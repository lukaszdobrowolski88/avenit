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
export function consumeBackupCode(rawCodes, code) {
  // Format bazy bywa różny (text[] z napisami JSON albo jsonb) — sprowadź do [{code, used}].
  const backupCodes = Array.isArray(rawCodes) && typeof rawCodes[0] === 'string' && !String(rawCodes[0]).trim().startsWith('{')
    ? rawCodes
    : normalizeBackupCodes(rawCodes);
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

// ── Kody zapasowe: różne formaty kolumny w bazach tenantów ─────────────────────
// W części baz (np. tenant schwro, dane z Supabase) app_users.totp_backup_codes to text[],
// gdzie każdy element jest NAPISEM JSON '{"code":"…","used":false}'; w nowszych — jsonb z
// tablicą obiektów. Do 2026-10 serwer zapisywał zawsze jsonb (błąd „is of type text[] but
// expression is of type jsonb” przy wyłączaniu 2FA), a przy logowaniu porównywał kod z całym
// napisem JSON — kody zapasowe nie działały.

// Dowolny format → [{ code, used }].
export function normalizeBackupCodes(raw) {
  let list = raw;
  if (typeof list === 'string') {
    try { list = JSON.parse(list); } catch { return []; }
  }
  if (!Array.isArray(list)) return [];
  return list
    .map((c) => {
      if (c && typeof c === 'object') return { ...c, code: String(c.code || '').toUpperCase(), used: !!c.used };
      if (typeof c === 'string') {
        const s = c.trim();
        if (s.startsWith('{')) {
          try { const o = JSON.parse(s); return { ...o, code: String(o.code || '').toUpperCase(), used: !!o.used }; } catch { return null; }
        }
        return { code: s.toUpperCase(), used: false };
      }
      return null;
    })
    .filter((c) => c && c.code);
}

const columnKind = new Map(); // nazwa bazy → 'text[]' | 'jsonb'
async function backupColumnKind(db) {
  const key = db?.options?.connectionString || 'default';
  if (columnKind.has(key)) return columnKind.get(key);
  let kind = 'jsonb';
  try {
    const { rows } = await db.query(
      `SELECT udt_name FROM information_schema.columns WHERE table_name = 'app_users' AND column_name = 'totp_backup_codes' LIMIT 1`
    );
    if (rows[0]?.udt_name === '_text') kind = 'text[]';
  } catch { /* zostaje jsonb */ }
  columnKind.set(key, kind);
  return kind;
}

// Wartość parametru dla UPDATE … SET totp_backup_codes = $n zgodna z typem kolumny.
export async function backupCodesParam(db, codes) {
  const list = normalizeBackupCodes(codes);
  return (await backupColumnKind(db)) === 'text[]' ? list.map((c) => JSON.stringify(c)) : JSON.stringify(list);
}
