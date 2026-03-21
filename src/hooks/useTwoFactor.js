import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// Prosty generator base32 dla TOTP secret
function generateBase32Secret(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let result = '';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
}

// Dekodowanie base32 do bytes
function base32ToBytes(base32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of base32.toUpperCase()) {
    const val = chars.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substr(i, 8), 2));
  }
  return new Uint8Array(bytes);
}

// HMAC-SHA1 używając Web Crypto API
async function hmacSha1(key, message) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, message);
  return new Uint8Array(signature);
}

// Generowanie kodu TOTP
async function generateTOTP(secret, timeStep = 30, digits = 6) {
  const key = base32ToBytes(secret);
  const time = Math.floor(Date.now() / 1000 / timeStep);

  // Konwersja time do 8-bajtowej tablicy big-endian
  const timeBuffer = new ArrayBuffer(8);
  const timeView = new DataView(timeBuffer);
  timeView.setUint32(4, time, false); // big-endian

  const hmac = await hmacSha1(key, new Uint8Array(timeBuffer));

  // Dynamic truncation
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  ) % Math.pow(10, digits);

  return code.toString().padStart(digits, '0');
}

// Weryfikacja kodu TOTP (z oknem czasowym)
async function verifyTOTP(secret, code, window = 1) {
  const timeStep = 30;
  const currentTime = Math.floor(Date.now() / 1000 / timeStep);

  for (let i = -window; i <= window; i++) {
    const time = currentTime + i;
    const timeBuffer = new ArrayBuffer(8);
    const timeView = new DataView(timeBuffer);
    timeView.setUint32(4, time, false);

    const key = base32ToBytes(secret);
    const hmac = await hmacSha1(key, new Uint8Array(timeBuffer));

    const offset = hmac[hmac.length - 1] & 0x0f;
    const generatedCode = (
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)
    ) % 1000000;

    if (generatedCode.toString().padStart(6, '0') === code) {
      return true;
    }
  }
  return false;
}

// Generowanie kodów zapasowych
function generateBackupCodes(count = 10) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const randomValues = new Uint8Array(4);
    crypto.getRandomValues(randomValues);
    const code = Array.from(randomValues)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
    codes.push(code.slice(0, 8)); // 8-znakowy kod
  }
  return codes;
}

export function useTwoFactor(userEmail) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Sprawdz czy uzytkownik ma wlaczone 2FA - z timeout
  const checkTwoFactorStatus = useCallback(async (email) => {
    try {
      const result = await Promise.race([
        supabase
          .from('app_users')
          .select('totp_enabled, totp_verified_at')
          .eq('email', email || userEmail)
          .maybeSingle(),
        new Promise(resolve => setTimeout(() => resolve({ data: null, timeout: true }), 2000))
      ]);

      if (result.timeout || result.error) {
        return { enabled: false, verifiedAt: null };
      }

      return {
        enabled: result.data?.totp_enabled || false,
        verifiedAt: result.data?.totp_verified_at || null
      };
    } catch (err) {
      console.error('Error checking 2FA status:', err);
      return { enabled: false, verifiedAt: null };
    }
  }, [userEmail]);

  // Rozpocznij konfiguracje 2FA - generuj secret i QR code URL
  const setupTwoFactor = useCallback(async (appName = 'Church Manager') => {
    setLoading(true);
    setError(null);

    try {
      const secret = generateBase32Secret(32);
      const backupCodes = generateBackupCodes(10);

      // Zapisz secret tymczasowo (jeszcze nie wlaczaj 2FA)
      const { error: updateError } = await supabase
        .from('app_users')
        .update({
          totp_secret: secret,
          totp_backup_codes: backupCodes.map(code => ({ code, used: false }))
        })
        .eq('email', userEmail);

      if (updateError) throw updateError;

      // Generuj URL dla QR code (otpauth format)
      const otpauthUrl = `otpauth://totp/${encodeURIComponent(appName)}:${encodeURIComponent(userEmail)}?secret=${secret}&issuer=${encodeURIComponent(appName)}&algorithm=SHA1&digits=6&period=30`;

      // Loguj akcje
      await logTwoFactorAction('setup', true);

      return {
        success: true,
        secret,
        otpauthUrl,
        backupCodes
      };
    } catch (err) {
      setError(err.message);
      await logTwoFactorAction('setup', false);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [userEmail]);

  // Weryfikuj kod i aktywuj 2FA
  const verifyAndEnableTwoFactor = useCallback(async (code) => {
    setLoading(true);
    setError(null);

    try {
      // Pobierz secret
      const { data: userData, error: fetchError } = await supabase
        .from('app_users')
        .select('totp_secret')
        .eq('email', userEmail)
        .single();

      if (fetchError) throw fetchError;
      if (!userData?.totp_secret) throw new Error('Nie znaleziono klucza 2FA');

      // Weryfikuj kod
      const isValid = await verifyTOTP(userData.totp_secret, code);

      if (!isValid) {
        await logTwoFactorAction('verify', false);
        throw new Error('Nieprawidłowy kod weryfikacyjny');
      }

      // Aktywuj 2FA
      const { error: updateError } = await supabase
        .from('app_users')
        .update({
          totp_enabled: true,
          totp_verified_at: new Date().toISOString()
        })
        .eq('email', userEmail);

      if (updateError) throw updateError;

      await logTwoFactorAction('verify', true);

      return { success: true };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [userEmail]);

  // Weryfikuj kod przy logowaniu
  const verifyLoginCode = useCallback(async (email, code) => {
    setLoading(true);
    setError(null);

    try {
      // Pobierz secret i kody zapasowe
      const { data: userData, error: fetchError } = await supabase
        .from('app_users')
        .select('totp_secret, totp_backup_codes')
        .eq('email', email)
        .single();

      if (fetchError) throw fetchError;
      if (!userData?.totp_secret) throw new Error('2FA nie jest skonfigurowane');

      // Najpierw sprawdz TOTP
      const isValidTOTP = await verifyTOTP(userData.totp_secret, code);

      if (isValidTOTP) {
        await logTwoFactorAction('verify', true, email);
        return { success: true };
      }

      // Sprawdz kody zapasowe
      const backupCodes = userData.totp_backup_codes || [];
      const backupIndex = backupCodes.findIndex(
        bc => bc.code === code.toUpperCase() && !bc.used
      );

      if (backupIndex !== -1) {
        // Oznacz kod jako uzyty
        backupCodes[backupIndex].used = true;
        backupCodes[backupIndex].usedAt = new Date().toISOString();

        await supabase
          .from('app_users')
          .update({ totp_backup_codes: backupCodes })
          .eq('email', email);

        await logTwoFactorAction('backup_used', true, email);
        return { success: true, backupCodeUsed: true };
      }

      await logTwoFactorAction('verify', false, email);
      throw new Error('Nieprawidłowy kod weryfikacyjny');
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, []);

  // Wylacz 2FA
  const disableTwoFactor = useCallback(async (code) => {
    setLoading(true);
    setError(null);

    try {
      // Pobierz secret
      const { data: userData, error: fetchError } = await supabase
        .from('app_users')
        .select('totp_secret')
        .eq('email', userEmail)
        .single();

      if (fetchError) throw fetchError;

      // Weryfikuj kod przed wylaczeniem
      const isValid = await verifyTOTP(userData.totp_secret, code);

      if (!isValid) {
        throw new Error('Nieprawidłowy kod weryfikacyjny');
      }

      // Wylacz 2FA
      const { error: updateError } = await supabase
        .from('app_users')
        .update({
          totp_enabled: false,
          totp_secret: null,
          totp_verified_at: null,
          totp_backup_codes: []
        })
        .eq('email', userEmail);

      if (updateError) throw updateError;

      await logTwoFactorAction('disable', true);

      return { success: true };
    } catch (err) {
      setError(err.message);
      await logTwoFactorAction('disable', false);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [userEmail]);

  // Regeneruj kody zapasowe
  const regenerateBackupCodes = useCallback(async (code) => {
    setLoading(true);
    setError(null);

    try {
      // Pobierz secret i zweryfikuj kod
      const { data: userData, error: fetchError } = await supabase
        .from('app_users')
        .select('totp_secret')
        .eq('email', userEmail)
        .single();

      if (fetchError) throw fetchError;

      const isValid = await verifyTOTP(userData.totp_secret, code);
      if (!isValid) {
        throw new Error('Nieprawidłowy kod weryfikacyjny');
      }

      // Generuj nowe kody
      const newBackupCodes = generateBackupCodes(10);

      const { error: updateError } = await supabase
        .from('app_users')
        .update({
          totp_backup_codes: newBackupCodes.map(code => ({ code, used: false }))
        })
        .eq('email', userEmail);

      if (updateError) throw updateError;

      return { success: true, backupCodes: newBackupCodes };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [userEmail]);

  // Pobierz pozostale kody zapasowe
  const getBackupCodes = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('app_users')
        .select('totp_backup_codes')
        .eq('email', userEmail)
        .single();

      if (fetchError) throw fetchError;

      const codes = data?.totp_backup_codes || [];
      return {
        all: codes,
        unused: codes.filter(c => !c.used),
        used: codes.filter(c => c.used)
      };
    } catch (err) {
      return { all: [], unused: [], used: [] };
    }
  }, [userEmail]);

  // Logowanie akcji 2FA - nieblokujące, z timeout
  const logTwoFactorAction = (action, success, email = null) => {
    // Fire and forget - nie czekaj na wynik
    Promise.race([
      supabase.from('totp_auth_logs').insert({
        user_email: email || userEmail,
        action,
        success,
        user_agent: navigator.userAgent
      }),
      new Promise(resolve => setTimeout(resolve, 1000)) // 1s timeout
    ]).catch(() => {
      // Ignoruj błędy logowania - nie blokuj aplikacji
    });
  };

  return {
    loading,
    error,
    checkTwoFactorStatus,
    setupTwoFactor,
    verifyAndEnableTwoFactor,
    verifyLoginCode,
    disableTwoFactor,
    regenerateBackupCodes,
    getBackupCodes
  };
}

// Export funkcji pomocniczych
export { generateTOTP, verifyTOTP };
