// Kalendarz Google / Outlook (Faza 2) — czysta logika: wydarzenie Avenit ↔ wydarzenie dostawcy.
//
// Wspólna postać pól (znormalizowana, niezależna od dostawcy), w strefie Europe/Warsaw:
//   { title, allDay, start, end, location, description, status }
//   start/end: 'YYYY-MM-DD' (cały dzień; koniec WYŁĄCZNIE — dzień po ostatnim) albo 'YYYY-MM-DDTHH:MM'.
//   description: tylko opis wydarzenia (część nad separatorem; pod nim dopisek Avenit: służba,
//   link do wydarzenia i spotkania online — zmiany w dopisku ignorujemy).
// Te same pola zapisujemy przy wysłaniu (pushed_fields) — różnica względem tego, co przychodzi od
// dostawcy, to zmiana zrobiona przez osobę w Google/Outlook.
import crypto from 'node:crypto';
import { zonedToUtc, utcToZoned, plainText } from '../meetings/logic.js';

export const TZ = 'Europe/Warsaw';
export const MS_TZ = 'Central European Standard Time'; // nazwa Windows — Graph (zapis i Prefer)
export const PENDING_SUFFIX = ' (do potwierdzenia)';
export const DESC_MARKER = '— — —';
export const WINDOW_PAST_DAYS = 30;
export const WINDOW_FUTURE_DAYS = 400;
export const DEFAULT_MINUTES = 60;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function ymd(v) {
  if (!v) return '';
  if (v instanceof Date) return utcToZoned(v).date;
  const s = String(v);
  return DATE_RE.test(s.slice(0, 10)) ? s.slice(0, 10) : '';
}
export function hhmm(v) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v ?? '').trim());
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}
export function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function addMinutesLocal(date, time, minutes) {
  const at = zonedToUtc(date, time);
  const z = utcToZoned(new Date(at.getTime() + minutes * 60_000));
  return `${z.date}T${z.time}`;
}

// Okno synchronizacji: od miesiąca wstecz do ~13 miesięcy w przód (daty lokalne).
export function windowBounds(now = Date.now()) {
  const today = utcToZoned(new Date(now)).date;
  return { from: addDays(today, -WINDOW_PAST_DAYS), to: addDays(today, WINDOW_FUTURE_DAYS) };
}

const oneLineTitle = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 255);
export const stripPending = (title) => {
  const t = oneLineTitle(title);
  return t.endsWith(PENDING_SUFFIX.trim()) ? t.slice(0, -PENDING_SUFFIX.trim().length).trim() : t;
};
const normDesc = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

// Wydarzenie Avenit (wiersz events) → pola. null: bez daty.
export function eventFields(ev, { pending = false, location = undefined } = {}) {
  const date = ymd(ev?.date);
  if (!date) return null;
  const t = hhmm(ev.time);
  const endDate = ymd(ev.end_date);
  const base = {
    title: oneLineTitle(ev.title) || 'Wydarzenie',
    location: String(location !== undefined ? location : (ev.location || '')).trim(),
    description: plainText(ev.description || ev.details_html || '') || '',
    status: pending ? 'tentative' : 'confirmed',
  };
  if (!t) {
    const last = endDate && endDate >= date ? endDate : date;
    return { ...base, allDay: true, start: date, end: addDays(last, 1) };
  }
  const start = `${date}T${t}`;
  const et = hhmm(ev.end_time);
  let end = et ? `${endDate && endDate >= date ? endDate : date}T${et}` : null;
  if (!end || end <= start) end = addMinutesLocal(date, t, DEFAULT_MINUTES);
  return { ...base, allDay: false, start, end };
}

// Dopisek Avenit pod separatorem.
export function footerLines({ eventUrl, onlineUrl, service }) {
  const lines = [];
  if (service) {
    const roles = (service.roles || []).join(', ') || 'służba';
    const teams = (service.teams || []).join(', ');
    lines.push(`Twoja służba: ${roles}${teams ? ` (${teams})` : ''}${service.pending ? ' — do potwierdzenia w Avenit' : ''}`);
  }
  if (onlineUrl) lines.push(`Spotkanie online: ${onlineUrl}`);
  if (eventUrl) lines.push(`Zobacz w Avenit: ${eventUrl}`);
  lines.push('Zmiany wprowadzaj w Avenit — kalendarz synchronizuje się automatycznie.');
  return lines;
}
export function composeDescription(userPart, lines) {
  return [String(userPart || '').trim(), DESC_MARKER, ...lines].filter((x, i) => i > 0 || x).join('\n');
}
// Część opisu nad separatorem (HTML z Google/Outlook → tekst).
export function userDescription(raw) {
  const txt = plainText(raw || '', 20_000) || '';
  const i = txt.indexOf(DESC_MARKER);
  return (i >= 0 ? txt.slice(0, i) : txt).trim();
}

// Pełny ładunek do wysłania + skrót (zmiana skrótu = trzeba zaktualizować u dostawcy).
export function buildPayload(ev, { service = null, eventUrl = '', onlineUrl = '' } = {}) {
  const pending = !!service?.pending;
  const online = ev.format === 'online';
  const fields = eventFields(ev, { pending, location: online && eventUrl ? eventUrl : undefined });
  if (!fields) return null;
  const description = composeDescription(fields.description, footerLines({ eventUrl, onlineUrl, service }));
  const title = fields.title + (pending ? PENDING_SUFFIX : '');
  const hash = crypto.createHash('sha1').update(JSON.stringify({ fields, title, description, eventUrl, v: 1 })).digest('hex');
  return { fields, title, description, eventUrl, hash };
}

// ── Google Calendar v3 ──────────────────────────────────────────────────────
const gTime = (v, allDay) => (allDay ? { date: v } : { dateTime: `${v}:00`, timeZone: TZ });
export function googleBody(p, { eventId, targetId } = {}) {
  return {
    summary: p.title,
    description: p.description,
    location: p.fields.location || '',
    start: gTime(p.fields.start, p.fields.allDay),
    end: gTime(p.fields.end, p.fields.allDay),
    status: p.fields.status === 'tentative' ? 'tentative' : 'confirmed',
    transparency: 'opaque',
    ...(p.eventUrl ? { source: { title: 'Avenit', url: p.eventUrl } } : {}),
    extendedProperties: { private: { avenit_event_id: String(eventId ?? ''), avenit_target: String(targetId ?? '') } },
  };
}
// Identyfikator wydarzenia nadawany przez nas (base32hex: 0-9a-v) — ponowienie wstawienia po awarii
// nie tworzy duplikatu (409 → aktualizacja).
export const googleEventId = (targetId, eventId, gen = '') =>
  `av${crypto.createHash('sha1').update(`${targetId}:${eventId}:${gen}`).digest('hex')}`;

function zonedFromIso(s, tz) {
  const v = String(s || '');
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(v)) {
    const z = utcToZoned(new Date(v));
    return `${z.date}T${z.time}`;
  }
  if (tz && tz !== TZ && /^utc$/i.test(tz)) {
    const z = utcToZoned(new Date(`${v.slice(0, 19)}Z`));
    return `${z.date}T${z.time}`;
  }
  return v.slice(0, 16);
}
export function googleFields(e) {
  const allDay = !!e?.start?.date;
  return {
    title: stripPending(e?.summary),
    allDay,
    start: allDay ? e.start.date : zonedFromIso(e?.start?.dateTime, e?.start?.timeZone),
    end: allDay ? (e?.end?.date || addDays(e.start.date, 1)) : zonedFromIso(e?.end?.dateTime, e?.end?.timeZone),
    location: String(e?.location || '').trim(),
    description: userDescription(e?.description),
    status: e?.status === 'tentative' ? 'tentative' : 'confirmed',
  };
}

// ── Microsoft Graph ─────────────────────────────────────────────────────────
const msTime = (v, allDay) => ({ dateTime: allDay ? `${v}T00:00:00` : `${v}:00`, timeZone: MS_TZ });
export function microsoftBody(p) {
  return {
    subject: p.title,
    body: { contentType: 'text', content: p.description },
    location: { displayName: p.fields.location || '' },
    start: msTime(p.fields.start, p.fields.allDay),
    end: msTime(p.fields.end, p.fields.allDay),
    isAllDay: !!p.fields.allDay,
    showAs: p.fields.status === 'tentative' ? 'tentative' : 'busy',
  };
}
function msLocal(t) {
  const v = String(t?.dateTime || '');
  if (!v) return '';
  if (/^utc$/i.test(String(t?.timeZone || ''))) {
    const z = utcToZoned(new Date(`${v.slice(0, 19)}Z`));
    return `${z.date}T${z.time}`;
  }
  return v.slice(0, 16); // Prefer: outlook.timezone = strefa kościoła
}
export function microsoftFields(e) {
  const allDay = !!e?.isAllDay;
  const s = msLocal(e?.start);
  const en = msLocal(e?.end);
  return {
    title: stripPending(e?.subject),
    allDay,
    start: allDay ? s.slice(0, 10) : s,
    end: allDay ? en.slice(0, 10) : en,
    location: String(e?.location?.displayName || '').trim(),
    description: userDescription(e?.body?.content),
    status: e?.showAs === 'tentative' ? 'tentative' : 'confirmed',
  };
}

// ── Różnice i zapis zwrotny ─────────────────────────────────────────────────
// Zmienione grupy pól: title | when | location | description (status ignorujemy — to stan służby).
export function diffFields(pushed, ext, { online = false } = {}) {
  if (!pushed || !ext) return [];
  const out = [];
  if (stripPending(pushed.title) !== stripPending(ext.title)) out.push('title');
  if (!!pushed.allDay !== !!ext.allDay || pushed.start !== ext.start || pushed.end !== ext.end) out.push('when');
  if (!online && String(pushed.location || '').trim() !== String(ext.location || '').trim()) out.push('location');
  if (normDesc(pushed.description) !== normDesc(ext.description)) out.push('description');
  return out;
}

// Pola zewnętrzne → kolumny events (tylko zmienione grupy). null przy nieprawidłowym terminie.
export function eventUpdateFrom(ext, changed) {
  const set = {};
  if (changed.includes('title')) set.title = stripPending(ext.title) || 'Wydarzenie';
  if (changed.includes('location')) set.location = ext.location || null;
  if (changed.includes('description')) set.description = ext.description || null;
  if (changed.includes('when')) {
    if (ext.allDay) {
      if (!DATE_RE.test(ext.start) || !DATE_RE.test(ext.end)) return null;
      const last = addDays(ext.end, -1);
      Object.assign(set, { date: ext.start, time: null, end_time: null, end_date: last > ext.start ? last : null });
    } else {
      const sd = ext.start.slice(0, 10); const ed = ext.end.slice(0, 10);
      const st = hhmm(ext.start.slice(11)); const et = hhmm(ext.end.slice(11));
      if (!DATE_RE.test(sd) || !DATE_RE.test(ed) || !st || !et) return null;
      Object.assign(set, { date: sd, time: st, end_time: et, end_date: ed !== sd ? ed : null });
    }
  }
  return set;
}

// Nowe wydarzenie z kalendarza kościoła → wiersz events (import).
export function importedEventRow(ext) {
  const set = eventUpdateFrom(ext, ['title', 'location', 'description', 'when']);
  if (!set) return null;
  return set;
}

// ── Preferencje ─────────────────────────────────────────────────────────────
// Kalendarz osobisty: 'mine' (domyślnie) = moje służby + zapisy + moje grupy/służby + moje
// spotkania + organizowane przeze mnie; 'all' = wszystkie wydarzenia, które widzę.
export function normalizeUserPrefs(p = {}) {
  const o = p && typeof p === 'object' ? p : {};
  return {
    mode: o.mode === 'all' ? 'all' : 'mine',
    my_services: o.my_services !== false,
    registered: o.registered !== false,
    my_groups: o.my_groups !== false,
    my_meetings: o.my_meetings !== false,
    organized: o.organized !== false,
  };
}
const strList = (v) => (Array.isArray(v) ? [...new Set(v.map((x) => String(x ?? '').trim()).filter(Boolean))].slice(0, 100) : []);
// Kalendarz kościoła: filtr modułów/typów (puste = wszystkie), import nowych wydarzeń (domyślnie
// wyłączony), Google — udostępnienie domenie, Microsoft — kalendarz osobny albo główny skrzynki.
export function normalizeChurchPrefs(p = {}) {
  const o = p && typeof p === 'object' ? p : {};
  return {
    modules: strList(o.modules),
    event_types: strList(o.event_types),
    import_new: o.import_new === true,
    share_domain: o.share_domain !== false,
    calendar_mode: o.calendar_mode === 'primary' ? 'primary' : 'dedicated',
  };
}
export const isEmailLike = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
