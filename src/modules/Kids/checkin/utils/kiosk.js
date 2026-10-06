// Czysta logika check-inu dzieci: losowe kody odbioru, PIN trybu kiosku, daty lokalne,
// dopasowanie telefonu. Bez Reacta i bez tr() — testowane w kiosk.test.js.

// ── Kody odbioru ───────────────────────────────────────────────────────────
// Bez znaków, które łatwo pomylić na naklejce lub przy przepisywaniu:
// 0/O/Q/D, 1/I/L/J, 2/Z, 5/S, 6/G, 8/B, U/V.
export const PICKUP_CODE_ALPHABET = 'ACEFHKMNPRTWXY3479';
export const PICKUP_CODE_LENGTH = 4;

// Klawisze specjalne klawiatury ekranowej (nie mylić z literą „C” w kodach odbioru).
export const KEY_CLEAR = '__clear';
export const KEY_BACK = '__back';

// Klawiatura kodu odbioru — dokładnie znaki alfabetu kodów.
export const CODE_KEYPAD_ROWS = [
  ['A', 'C', 'E', 'F', 'H'],
  ['K', 'M', 'N', 'P', 'R'],
  ['T', 'W', 'X', 'Y', '3'],
  ['4', '7', '9', KEY_CLEAR, KEY_BACK],
];

function randomIndex(max) {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  if (c && typeof c.getRandomValues === 'function') {
    // Odrzucanie próbek ponad wielokrotność `max` — równy rozkład znaków.
    const limit = Math.floor(256 / max) * max;
    const buf = new Uint8Array(1);
    for (;;) {
      c.getRandomValues(buf);
      if (buf[0] < limit) return buf[0] % max;
    }
  }
  return Math.floor(Math.random() * max);
}

export function generatePickupCode(length = PICKUP_CODE_LENGTH, alphabet = PICKUP_CODE_ALPHABET) {
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[randomIndex(alphabet.length)];
  return out;
}

// Kod unikalny wśród aktywnych (nieodebranych) meldowań sesji.
export function generateUniquePickupCode(existingCodes = [], { length = PICKUP_CODE_LENGTH, attempts = 50 } = {}) {
  const taken = new Set();
  for (const raw of existingCodes) {
    for (const c of splitStoredCodes(raw)) taken.add(c);
  }
  for (let i = 0; i < attempts; i++) {
    const code = generatePickupCode(length);
    if (!taken.has(code)) return code;
  }
  // Sesja „pełna” dla 4 znaków (praktycznie niemożliwe) — wydłuż kod.
  return generatePickupCode(length + 1);
}

export function normalizePickupCode(input) {
  return String(input || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

// security_code w bazie: nowy format to jeden kod („K7HX”), stary to końcówki telefonów „1234|5678”.
export function splitStoredCodes(stored) {
  return String(stored || '')
    .split('|')
    .map(normalizePickupCode)
    .filter(Boolean);
}

export function pickupCodeMatches(stored, entered) {
  const code = normalizePickupCode(entered);
  if (!code) return false;
  return splitStoredCodes(stored).includes(code);
}

// ── PIN trybu kiosku ───────────────────────────────────────────────────────
export const KIOSK_PIN_LENGTH = 4;
export const KIOSK_STORAGE_KEY = 'avenit_kids_kiosk';
export const KIOSK_MAX_ATTEMPTS = 5;
export const KIOSK_LOCKOUT_MS = 30 * 1000;

export function isValidPin(pin) {
  return new RegExp(`^\\d{${KIOSK_PIN_LENGTH}}$`).test(String(pin || ''));
}

export function randomSalt() {
  let s = '';
  for (let i = 0; i < 16; i++) s += randomIndex(16).toString(16);
  return s;
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Zapasowy skrót (cyrb53), gdy brak WebCrypto (np. strona bez HTTPS). PIN i tak jest
// trzymany tylko lokalnie — chodzi o to, żeby nie leżał w localStorage jawnym tekstem.
function fallbackHash(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `f1:${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`;
}

export async function hashPin(pin, salt) {
  const input = `${salt}:${pin}`;
  const subtle = globalThis.crypto?.subtle;
  if (subtle && typeof TextEncoder !== 'undefined') {
    try {
      const digest = await subtle.digest('SHA-256', new TextEncoder().encode(input));
      return `s256:${toHex(digest)}`;
    } catch { /* brak WebCrypto w tym kontekście — niżej zapas */ }
  }
  return fallbackHash(input);
}

export async function verifyPin(pin, state) {
  if (!state?.pinHash || !state?.salt) return false;
  return (await hashPin(pin, state.salt)) === state.pinHash;
}

export function readKioskState(storage = safeStorage()) {
  try {
    const raw = storage?.getItem(KIOSK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.active && parsed.pinHash && parsed.salt ? parsed : null;
  } catch {
    return null;
  }
}

export function writeKioskState(state, storage = safeStorage()) {
  try {
    storage?.setItem(KIOSK_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearKioskState(storage = safeStorage()) {
  try { storage?.removeItem(KIOSK_STORAGE_KEY); } catch { /* ignore */ }
}

export function isKioskActive(storage = safeStorage()) {
  return !!readKioskState(storage);
}

function safeStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

// Ile ms jeszcze trwa blokada po zbyt wielu błędnych PIN-ach (0 = można próbować).
export function lockoutRemaining(failures, lastFailureAt, now = Date.now()) {
  if (failures < KIOSK_MAX_ATTEMPTS || !lastFailureAt) return 0;
  return Math.max(0, lastFailureAt + KIOSK_LOCKOUT_MS - now);
}

// ── Daty i telefony ────────────────────────────────────────────────────────
// Data lokalna YYYY-MM-DD (toISOString dawał UTC — między 00:00 a 02:00 wczorajszy dzień).
export function localDateISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function localTimeHM(d = new Date()) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// „2026-10-04” → Date o północy czasu lokalnego (new Date('2026-10-04') to północ UTC).
export function parseLocalDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return iso ? new Date(iso) : null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function phoneDigits(phone) {
  return String(phone || '').replace(/\D/g, '');
}

export function phoneEndsWith(phone, lastDigits) {
  const d = phoneDigits(phone);
  return !!lastDigits && d.length >= lastDigits.length && d.endsWith(lastDigits);
}

// „601 234 567” → „••• ••• 567” (na ekranie kiosku nie pokazujemy cudzych numerów).
export function maskPhone(phone) {
  const d = phoneDigits(phone);
  if (d.length < 3) return '';
  return `••• ••• ${d.slice(-3)}`;
}

// Polska odmiana liczebnika: 1 dziecko / 2 dzieci… (formy przekazuje wywołujący, już przez tr()).
export function pluralForm(n, one, few, many) {
  const abs = Math.abs(n);
  if (abs === 1) return one;
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return few;
  return many;
}

// Wydarzenie z dzisiejszego kalendarza, które najlepiej nazywa sesję meldowania:
// trwające lub najbliższe nadchodzące; gdy wszystkie minęły — ostatnie.
export function pickSessionEvent(events, now = new Date()) {
  const list = (events || []).filter((e) => e && e.title);
  if (list.length === 0) return null;
  const nowHM = localTimeHM(now);
  const hm = (t) => String(t || '').slice(0, 5);
  const sorted = [...list].sort((a, b) => hm(a.time).localeCompare(hm(b.time)));
  const ongoing = sorted.find((e) => e.time && e.end_time && hm(e.time) <= nowHM && nowHM <= hm(e.end_time));
  if (ongoing) return ongoing;
  const upcoming = sorted.find((e) => !e.time || hm(e.time) >= nowHM);
  return upcoming || sorted[sorted.length - 1];
}
