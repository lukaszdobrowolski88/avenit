// Port logiki TOTP do React Native — crypto-js (pure JS) zamiast crypto.subtle (brak w RN).

import 'react-native-get-random-values';
import CryptoJS from 'crypto-js';
import { supabase } from './supabase';

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const base32ToWordArray = (base32: string): CryptoJS.lib.WordArray => {
  let bits = '';
  for (const ch of base32.toUpperCase()) {
    const v = BASE32_CHARS.indexOf(ch);
    if (v === -1) continue;
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  const words: number[] = [];
  for (let i = 0; i < bytes.length; i += 4) {
    words.push(
      ((bytes[i] ?? 0) << 24) |
        ((bytes[i + 1] ?? 0) << 16) |
        ((bytes[i + 2] ?? 0) << 8) |
        (bytes[i + 3] ?? 0),
    );
  }
  return CryptoJS.lib.WordArray.create(words, bytes.length);
};

const timeToWordArray = (time: number): CryptoJS.lib.WordArray => {
  const high = Math.floor(time / 0x100000000);
  const low = time >>> 0;
  return CryptoJS.lib.WordArray.create([high, low], 8);
};

export const generateTOTP = (secret: string, timeStep = 30, digits = 6): string => {
  const time = Math.floor(Date.now() / 1000 / timeStep);
  const key = base32ToWordArray(secret);
  const message = timeToWordArray(time);

  const hmac = CryptoJS.HmacSHA1(message, key);
  const hexStr = hmac.toString(CryptoJS.enc.Hex);
  const bytes: number[] = [];
  for (let i = 0; i < hexStr.length; i += 2) {
    bytes.push(parseInt(hexStr.slice(i, i + 2), 16));
  }

  const offset = bytes[bytes.length - 1] & 0x0f;
  const code =
    (((bytes[offset] & 0x7f) << 24) |
      ((bytes[offset + 1] & 0xff) << 16) |
      ((bytes[offset + 2] & 0xff) << 8) |
      (bytes[offset + 3] & 0xff)) %
    Math.pow(10, digits);

  return code.toString().padStart(digits, '0');
};

export const verifyTOTP = (secret: string, code: string, window = 1): boolean => {
  const timeStep = 30;
  const currentTime = Math.floor(Date.now() / 1000 / timeStep);
  for (let i = -window; i <= window; i++) {
    const time = currentTime + i;
    const key = base32ToWordArray(secret);
    const message = timeToWordArray(time);
    const hmac = CryptoJS.HmacSHA1(message, key);
    const hexStr = hmac.toString(CryptoJS.enc.Hex);
    const bytes: number[] = [];
    for (let j = 0; j < hexStr.length; j += 2) {
      bytes.push(parseInt(hexStr.slice(j, j + 2), 16));
    }
    const offset = bytes[bytes.length - 1] & 0x0f;
    const generated =
      (((bytes[offset] & 0x7f) << 24) |
        ((bytes[offset + 1] & 0xff) << 16) |
        ((bytes[offset + 2] & 0xff) << 8) |
        (bytes[offset + 3] & 0xff)) %
      1000000;
    if (generated.toString().padStart(6, '0') === code) return true;
  }
  return false;
};

export interface TwoFactorStatus {
  enabled: boolean;
  required: boolean;
}

export const checkTwoFactorStatus = async (email: string): Promise<TwoFactorStatus> => {
  const { data } = await supabase
    .from('app_users')
    .select('totp_enabled, totp_required')
    .eq('email', email)
    .maybeSingle();
  return {
    enabled: Boolean((data as any)?.totp_enabled),
    required: Boolean((data as any)?.totp_required),
  };
};

export interface VerifyResult {
  success: boolean;
  backupCodeUsed?: boolean;
  error?: string;
}

export const verifyLoginCode = async (email: string, code: string): Promise<VerifyResult> => {
  const { data, error } = await supabase
    .from('app_users')
    .select('totp_secret, totp_backup_codes')
    .eq('email', email)
    .single();
  if (error) return { success: false, error: error.message };
  const row = data as any;
  if (!row?.totp_secret) return { success: false, error: '2FA nie jest skonfigurowane' };

  if (verifyTOTP(row.totp_secret, code)) return { success: true };

  // Backup codes — accept array of objects {code, used} OR plain string array (legacy).
  const backup = row.totp_backup_codes;
  if (Array.isArray(backup) && backup.length > 0) {
    if (typeof backup[0] === 'string') {
      // Legacy: plain string array. Match and consume.
      const idx = (backup as string[]).findIndex((c) => c === code.toUpperCase());
      if (idx !== -1) {
        const next = [...(backup as string[])];
        next.splice(idx, 1);
        await (supabase.from('app_users') as any)
          .update({ totp_backup_codes: next })
          .eq('email', email);
        return { success: true, backupCodeUsed: true };
      }
    } else {
      const codes = backup as { code: string; used: boolean; usedAt?: string }[];
      const idx = codes.findIndex((c) => c.code === code.toUpperCase() && !c.used);
      if (idx !== -1) {
        codes[idx].used = true;
        codes[idx].usedAt = new Date().toISOString();
        await (supabase.from('app_users') as any)
          .update({ totp_backup_codes: codes })
          .eq('email', email);
        return { success: true, backupCodeUsed: true };
      }
    }
  }

  return { success: false, error: 'Nieprawidłowy kod' };
};
