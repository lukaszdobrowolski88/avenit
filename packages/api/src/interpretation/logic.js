// Tłumaczenie na żywo — czyste reguły (bez bazy i LiveKit), testowane w test/interpretation.test.js.
import { randomBytes } from 'node:crypto';
import { eventTimes, zonedToUtc } from '../meetings/logic.js';

export const MAX_CHANNELS = 8;
export const MAX_INTERPRETERS = 6; // na kanał
export const LABEL_MAX = 40;
export const LISTENER_PREFIX = 'listener:';
export const ORIGINAL_PREFIX = 'orig:'; // nadawca „Oryginału” (stół akustyka) — inna tożsamość niż odsłuch tłumacza
export const LISTENER_TTL = '4h';
export const INTERPRETER_TTL = '6h';
export const ROOM_MAX_PARTICIPANTS = 500;
export const ROOM_EMPTY_TIMEOUT = 10 * 60; // s — pokój bez nikogo znika po 10 min (zakładamy go od nowa)
export const ROOM_DEPARTURE_TIMEOUT = 2 * 60;
export const IDLE_AFTER_SEC = 3 * 60; // kanał bez nadającego > 3 min → „nie nadaje”
export const END_AFTER_EVENT_SEC = 6 * 3600; // sesja kończy się sama 6 h po końcu wydarzenia

// Języki do szybkiego dodania (etykieta w języku słuchacza — tak ją zobaczy na stronie i plakacie).
export const LANGUAGE_PRESETS = [
  { lang_code: 'en', label: 'English' },
  { lang_code: 'uk', label: 'Українська' },
  { lang_code: 'ru', label: 'Русский' },
  { lang_code: 'de', label: 'Deutsch' },
  { lang_code: 'es', label: 'Español' },
];

const lower = (v) => String(v ?? '').trim().toLowerCase();
const LANG_RE = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (v) => EMAIL_RE.test(String(v ?? '').trim()) && String(v).length <= 254;

export const newPublicToken = () => randomBytes(24).toString('base64url'); // 32 znaki
export const newListenerIdentity = () => `${LISTENER_PREFIX}${randomBytes(8).toString('hex')}`;
export const isListenerIdentity = (id) => lower(id).startsWith(LISTENER_PREFIX);
export const isOriginalIdentity = (id) => lower(id).startsWith(ORIGINAL_PREFIX);
export const originalIdentity = (email) => `${ORIGINAL_PREFIX}${lower(email)}`;
export const publicPath = (token) => `/tlumaczenie/${token}`;
const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;
export const isPublicToken = (t) => TOKEN_RE.test(String(t ?? ''));

// Etykieta: jedna linia, bez znaków sterujących, najwyżej 40 znaków.
export function normalizeLabel(raw) {
  // eslint-disable-next-line no-control-regex
  const s = String(raw ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return Array.from(s).slice(0, LABEL_MAX).join('').trim();
}

export function normalizeLangCode(raw) {
  const s = lower(raw).replace(/_/g, '-');
  return LANG_RE.test(s) ? s : null;
}

// Lista kanałów z formularza → [{ id?, lang_code, label, interpreters: [email] }] w kolejności
// (sort = indeks). Rzuca { message, code } przy błędzie — serwis zamienia na 400.
export function normalizeChannels(list) {
  if (!Array.isArray(list)) throw Object.assign(new Error('Lista języków jest nieprawidłowa'), { code: 'BAD_CHANNELS' });
  if (list.length > MAX_CHANNELS) throw Object.assign(new Error(`Najwyżej ${MAX_CHANNELS} języków na wydarzenie`), { code: 'TOO_MANY_CHANNELS' });
  const seen = new Set();
  return list.map((c, i) => {
    const code = normalizeLangCode(c?.lang_code);
    if (!code) throw Object.assign(new Error('Nieprawidłowy kod języka (np. en, uk, pt-br)'), { code: 'BAD_LANG' });
    if (seen.has(code)) throw Object.assign(new Error(`Język ${code} jest już na liście`), { code: 'DUPLICATE_LANG' });
    seen.add(code);
    const preset = LANGUAGE_PRESETS.find((p) => p.lang_code === code);
    const label = normalizeLabel(c?.label) || preset?.label || code.toUpperCase();
    const interpreters = [...new Set((Array.isArray(c?.interpreters) ? c.interpreters : []).map((e) => lower(typeof e === 'object' ? e?.email : e)).filter(isEmail))];
    if (interpreters.length > MAX_INTERPRETERS) throw Object.assign(new Error(`Najwyżej ${MAX_INTERPRETERS} tłumaczy na kanał`), { code: 'TOO_MANY_INTERPRETERS' });
    const id = typeof c?.id === 'string' && /^[0-9a-f-]{36}$/i.test(c.id) ? c.id.toLowerCase() : null;
    return { id, lang_code: code, label, sort: i, interpreters };
  });
}

// Koniec wydarzenia (UTC) — z godziną: koniec spotkania (meetings/logic eventTimes); bez godziny:
// koniec dnia (end_date albo date). null — brak daty.
export function eventEndsAt(ev) {
  if (!ev) return null;
  const t = eventTimes(ev);
  if (t) return new Date(t.ends_at);
  const day = String(ev.end_date || ev.date || '').slice(0, 10);
  return day ? zonedToUtc(day, '23:59') : null;
}

// Czy sesja powinna już się zakończyć (6 h po końcu wydarzenia).
export function sessionExpired(ev, now = Date.now()) {
  const end = eventEndsAt(ev);
  return !!end && now > end.getTime() + END_AFTER_EVENT_SEC * 1000;
}

// Metadane pokoju kanału — klienci (konsola) reagują na RoomMetadataChanged.
export const roomMetadata = (channel) => JSON.stringify({ active: channel?.active_interpreter_email || null });

// Słuchacze w pokoju: tożsamości listener:* (ukryci; tłumacze/nadawca się nie liczą).
export const countListeners = (participants) => (participants || []).filter((p) => isListenerIdentity(p.identity)).length;

// Nadający w pokoju kanału — każdy poza słuchaczami (tłumacze); w „Oryginale” — orig:*.
export const hasPublisher = (participants, { original = false } = {}) => (participants || [])
  .some((p) => (original ? isOriginalIdentity(p.identity) : !isListenerIdentity(p.identity)));

// Ścieżki mikrofonu danej osoby (do wyciszenia przy zmianie tłumacza).
export function micTracksOf(participants, identity) {
  const me = lower(identity);
  const p = (participants || []).find((x) => lower(x.identity) === me);
  return (p?.tracks || []).filter((t) => t.kind === 'audio' && (t.source === 'microphone' || !t.source) && !t.muted);
}

const ms = (v) => (v instanceof Date ? v.getTime() : Date.parse(v));
// Kanał „nadaje”, ale od IDLE_AFTER_SEC nikt nie nadaje → idle.
export function idleDue(lastActiveAt, now = Date.now()) {
  const t = ms(lastActiveAt);
  return !Number.isFinite(t) || now - t > IDLE_AFTER_SEC * 1000;
}
