// TOTP (RFC 6238): SHA1, krok 30 s, 6 cyfr, sekret base32.
// Implementacja zgodna 1:1 z istniejącą (packages/mobile/src/lib/totp.ts) —
// użytkownicy mają już sekrety w bazie, algorytm nie może się różnić.
import crypto from 'node:crypto';

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(base32) {
  let bits = '';
  for (const ch of base32.toUpperCase()) {
    const v = BASE32_CHARS.indexOf(ch);
    if (v === -1) continue;
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function base32Encode(buffer) {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += BASE32_CHARS[parseInt(bits.slice(i, i + 5), 2)];
  }
  return out;
}

export function generateSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes));
}

function hotp(secretBuf, counter, digits = 6) {
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  msg.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', secretBuf).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    10 ** digits;
  return code.toString().padStart(digits, '0');
}

export function generateTOTP(secret, timeStep = 30, digits = 6) {
  const counter = Math.floor(Date.now() / 1000 / timeStep);
  return hotp(base32Decode(secret), counter, digits);
}

export function verifyTOTP(secret, code, window = 1) {
  const timeStep = 30;
  const counter = Math.floor(Date.now() / 1000 / timeStep);
  const key = base32Decode(secret);
  for (let i = -window; i <= window; i++) {
    if (hotp(key, counter + i) === String(code)) return true;
  }
  return false;
}

// Kody zapasowe: JSONB — tablica stringów (legacy) lub obiektów {code, used, usedAt}.
// Zwraca { ok, updated } — updated to nowa wartość kolumny do zapisania (zużycie kodu).
export function consumeBackupCode(backupCodes, code) {
  if (!Array.isArray(backupCodes) || backupCodes.length === 0) return { ok: false };
  const needle = String(code).toUpperCase();
  if (typeof backupCodes[0] === 'string') {
    const idx = backupCodes.findIndex((c) => c === needle);
    if (idx === -1) return { ok: false };
    const updated = [...backupCodes];
    updated.splice(idx, 1);
    return { ok: true, updated };
  }
  const idx = backupCodes.findIndex((c) => c && c.code === needle && !c.used);
  if (idx === -1) return { ok: false };
  const updated = backupCodes.map((c, i) =>
    i === idx ? { ...c, used: true, usedAt: new Date().toISOString() } : c
  );
  return { ok: true, updated };
}
