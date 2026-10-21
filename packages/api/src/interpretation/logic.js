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

// Nazwy języków W TYM JĘZYKU (endonimy) — po kodzie. Języki kanałów pochodzą WYŁĄCZNIE z modułu
// Tłumaczenia (Służby: team_roles team_type 'tlumaczenia', klucz pola = kod języka); ta tabela
// służy tylko do etykiety kanału, którą widzi słuchacz (strona /tlumaczenie, plakat, aplikacja).
// Konwencja (2026-10-21): personel (karta, konsola, grafik) widzi nazwę Służby („Tłumacz EN”),
// słuchacz — nazwę języka w tym języku („English”, „Українська”).
export const LANGUAGE_NAMES = {
  en: 'English', uk: 'Українська', ru: 'Русский', de: 'Deutsch', es: 'Español', fr: 'Français',
  it: 'Italiano', pt: 'Português', 'pt-br': 'Português (Brasil)', pl: 'Polski', be: 'Беларуская',
  ro: 'Română', hu: 'Magyar', cs: 'Čeština', sk: 'Slovenčina', lt: 'Lietuvių', lv: 'Latviešu',
  et: 'Eesti', bg: 'Български', sr: 'Српски', hr: 'Hrvatski', ka: 'ქართული', hy: 'Հայերեն',
  tr: 'Türkçe', ar: 'العربية', fa: 'فارسی', he: 'עברית', hi: 'हिन्दी', zh: '中文', ja: '日本語',
  ko: '한국어', vi: 'Tiếng Việt', nl: 'Nederlands', sv: 'Svenska', no: 'Norsk', da: 'Dansk',
  fi: 'Suomi', el: 'Ελληνικά', sq: 'Shqip', kk: 'Қазақ тілі', sw: 'Kiswahili', am: 'አማርኛ',
};

const capFirst = (s) => (s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : s);
// Endonim z Intl (Node z pełnym ICU), gdy kodu nie ma w tabeli. null — nieznany.
function intlName(code) {
  try {
    const n = new Intl.DisplayNames([code], { type: 'language', fallback: 'none' }).of(code);
    return n && n.toLowerCase() !== code ? capFirst(n) : null;
  } catch {
    return null;
  }
}
// Etykieta kanału dla słuchacza: endonim → nazwa Służby bez „Tłumacz/Tłumaczka” → KOD.
// Jedna reguła dla karty (zapis), synchronizacji z grafiku i odczytu.
export function channelLabel(code, roleName = '') {
  const c = String(code || '').toLowerCase();
  const known = LANGUAGE_NAMES[c] || intlName(c);
  if (known) return known;
  const stripped = normalizeLabel(String(roleName || '').replace(/^\s*t[łl]umacz(ka|e)?\b[\s:–-]*/i, ''));
  return stripped || c.toUpperCase();
}

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

// Kod języka ze Służby modułu Tłumaczenia (team_roles: field_key, name) — field_key, gdy jest
// kodem (en, uk, pt-br); inaczej ostatni człon klucza („tumacz_de” → de) albo nazwy („Tłumacz DE”).
export function langForRole(roleKey, roleName = '') {
  const direct = normalizeLangCode(roleKey);
  if (direct) return direct;
  const tail = (s) => {
    const parts = String(s ?? '').trim().split(/[\s_]+/).filter(Boolean);
    const last = parts.length > 1 ? parts[parts.length - 1] : null;
    return last ? normalizeLangCode(last) : null;
  };
  return tail(roleKey) || tail(roleName) || null;
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
    const label = normalizeLabel(c?.label) || channelLabel(code);
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
