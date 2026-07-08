import { useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

// 2FA (TOTP) — cała kryptografia i sekrety są po stronie API.
// (Poprzednio klient czytał totp_secret z bazy i weryfikował kody lokalnie.)

export function useTwoFactor(userEmail) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Sekret i kody z /2fa/setup trzymamy do czasu potwierdzenia kodem (enable).
  const pendingSetup = useRef(null);

  // Sprawdz czy uzytkownik ma wlaczone 2FA - z timeout
  const checkTwoFactorStatus = useCallback(async (email) => {
    try {
      const result = await Promise.race([
        supabase.functions ? fetchStatus(email || userEmail) : null,
        new Promise(resolve => setTimeout(() => resolve({ timeout: true }), 2000))
      ]);

      if (!result || result.timeout) {
        return { enabled: false, verifiedAt: null };
      }
      return { enabled: result.enabled || false, verifiedAt: result.verifiedAt || null };
    } catch (err) {
      console.error('Error checking 2FA status:', err);
      return { enabled: false, verifiedAt: null };
    }
  }, [userEmail]);

  async function fetchStatus(email) {
    const res = await supabase._request('/api/auth/2fa-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    if (!res.ok) return { enabled: false, verifiedAt: null };
    return res.json();
  }

  // Rozpocznij konfiguracje 2FA - serwer generuje secret i kody zapasowe
  const setupTwoFactor = useCallback(async (appName = 'Avenit') => {
    setLoading(true);
    setError(null);

    try {
      const res = await supabase._request('/api/auth/2fa/setup', { method: 'POST' });
      if (!res.ok) throw new Error('Nie udało się rozpocząć konfiguracji 2FA');
      const data = await res.json();

      pendingSetup.current = { secret: data.secret, backupCodes: data.backupCodes };

      const otpauthUrl = `otpauth://totp/${encodeURIComponent(appName)}:${encodeURIComponent(userEmail)}?secret=${data.secret}&issuer=${encodeURIComponent(appName)}&algorithm=SHA1&digits=6&period=30`;

      return {
        success: true,
        secret: data.secret,
        otpauthUrl,
        backupCodes: data.backupCodes
      };
    } catch (err) {
      setError(err.message);
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
      if (!pendingSetup.current) throw new Error('Najpierw rozpocznij konfigurację 2FA');
      const res = await supabase._request('/api/auth/2fa/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: pendingSetup.current.secret,
          backupCodes: pendingSetup.current.backupCodes,
          code
        })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || 'Nieprawidłowy kod weryfikacyjny');
      }
      pendingSetup.current = null;
      return { success: true };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, []);

  // Weryfikacja kodu przy logowaniu odbywa się w POST /api/auth/login (totpCode)
  // — ta funkcja zostaje dla zgodności ze starymi wywołaniami.
  const verifyLoginCode = useCallback(async (_email, _code) => {
    return { success: false, error: 'Kod weryfikowany jest przy logowaniu' };
  }, []);

  // Wylacz 2FA (serwer weryfikuje kod)
  const disableTwoFactor = useCallback(async (code) => {
    setLoading(true);
    setError(null);

    try {
      const res = await supabase._request('/api/auth/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || 'Nieprawidłowy kod weryfikacyjny');
      }
      return { success: true };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, []);

  // Regeneruj kody zapasowe (serwer weryfikuje kod)
  const regenerateBackupCodes = useCallback(async (code) => {
    setLoading(true);
    setError(null);

    try {
      const res = await supabase._request('/api/auth/2fa/backup-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || 'Nieprawidłowy kod weryfikacyjny');
      }
      const data = await res.json();
      return { success: true, backupCodes: data.codes };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, []);

  // Pobierz pozostale kody zapasowe
  const getBackupCodes = useCallback(async () => {
    try {
      const res = await supabase._request('/api/auth/2fa/backup-codes');
      if (!res.ok) throw new Error('Błąd pobierania kodów');
      const data = await res.json();
      const codes = data?.codes || [];
      return {
        all: codes,
        unused: codes.filter(c => !c.used),
        used: codes.filter(c => c.used)
      };
    } catch (err) {
      return { all: [], unused: [], used: [] };
    }
  }, []);

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
