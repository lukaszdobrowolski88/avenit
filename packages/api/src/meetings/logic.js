// Spotkania online — czyste reguły (bez bazy): walidacja formularza, termin po polsku, plik
// kalendarza (.ics) i maile do gości w marce Avenit. Testy: test/meetings.test.js.
import { ApiError } from '../dataapi/querybuilder.js';
import { escapeHtml } from '../fn/send-assignment-invites.js';

export const TZ = 'Europe/Warsaw'; // kościoły w Polsce; serwer działa w UTC
export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 2000;
export const MIN_DURATION = 15;
export const MAX_DURATION = 8 * 60;
export const DEFAULT_DURATION = 60;
export const MAX_MEMBERS = 300;
export const MAX_GUESTS = 50;
export const GUEST_EMAILS_PER_DAY = 200; // na osobę zapraszającą
export const MAX_AHEAD_DAYS = 400;
export const LINK_GRACE_SEC = 12 * 3600; // link gościa działa jeszcze 12 h po planowanym końcu
export const REMINDER_MIN = 10;
export const RESPONSES = ['accepted', 'tentative', 'declined'];

const lower = (v) => String(v ?? '').trim().toLowerCase();
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
export const isEmail = (v) => EMAIL_RE.test(String(v ?? '').trim()) && String(v).length <= 254;

// eslint-disable-next-line no-control-regex
const clean = (v) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, ' ');
const oneLine = (v, max) => Array.from(clean(v).replace(/\s+/g, ' ').trim()).slice(0, max).join('').trim();
const multiLine = (v, max) => Array.from(clean(v).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()).slice(0, max).join('').trim();

// Formularz spotkania → { title, description, starts_at, ends_at, kind, guests_auto_admit }.
// partial: przy edycji brakujące pola zostają z `current`.
export function normalizeMeetingInput(body = {}, { now = Date.now(), current = null } = {}) {
  const has = (k) => body[k] !== undefined;
  const title = has('title') || !current ? oneLine(body.title, TITLE_MAX) : current.title;
  if (!title) throw new ApiError(400, 'Podaj nazwę spotkania', 'BAD_TITLE');
  const description = has('description') || !current ? (multiLine(body.description, DESCRIPTION_MAX) || null) : current.description;

  let starts = current ? Date.parse(current.starts_at) : NaN;
  if (has('starts_at') || !current) starts = Date.parse(String(body.starts_at ?? ''));
  if (!Number.isFinite(starts)) throw new ApiError(400, 'Podaj datę i godzinę spotkania', 'BAD_START');
  const timeChanged = !current || starts !== Date.parse(current.starts_at);
  // Nowy (albo przeniesiony) termin nie może być w przeszłości (5 min zapasu na „teraz”).
  if (timeChanged && starts < now - 5 * 60_000) throw new ApiError(400, 'Termin spotkania już minął', 'START_IN_PAST');
  if (starts > now + MAX_AHEAD_DAYS * 86_400_000) throw new ApiError(400, 'Spotkanie można zaplanować najwyżej rok naprzód', 'START_TOO_FAR');

  let duration = current ? Math.round((Date.parse(current.ends_at) - Date.parse(current.starts_at)) / 60_000) : DEFAULT_DURATION;
  if (has('duration_min') || !current) duration = Math.round(Number(body.duration_min ?? DEFAULT_DURATION));
  if (!Number.isFinite(duration) || duration < MIN_DURATION || duration > MAX_DURATION) {
    throw new ApiError(400, 'Spotkanie może trwać od 15 minut do 8 godzin', 'BAD_DURATION');
  }
  const kind = has('kind') || !current ? (body.kind === 'audio' ? 'audio' : 'video') : current.kind;
  const guestsAutoAdmit = has('guests_auto_admit') || !current ? body.guests_auto_admit === true : !!current.guests_auto_admit;
  return {
    title,
    description,
    starts_at: new Date(starts).toISOString(),
    ends_at: new Date(starts + duration * 60_000).toISOString(),
    kind,
    guests_auto_admit: guestsAutoAdmit,
  };
}

// Lista e-maili członków (konta) — małe litery, bez powtórzeń.
export function parseMembers(list) {
  if (list == null) return [];
  if (!Array.isArray(list)) throw new ApiError(400, 'Nieprawidłowa lista uczestników', 'BAD_MEMBERS');
  const out = [...new Set(list.map(lower).filter(Boolean))];
  if (out.length > MAX_MEMBERS) throw new ApiError(400, `Na spotkanie można zaprosić najwyżej ${MAX_MEMBERS} osób`, 'TOO_MANY_MEMBERS');
  return out;
}

// Goście po e-mailu: ['a@b.pl'] albo [{ email, name }] → [{ email, name }].
export function parseGuests(list) {
  if (list == null) return [];
  if (!Array.isArray(list)) throw new ApiError(400, 'Nieprawidłowa lista gości', 'BAD_GUESTS');
  const seen = new Map();
  for (const g of list) {
    const email = lower(typeof g === 'string' ? g : g?.email);
    if (!email) continue;
    if (!isEmail(email)) throw new ApiError(400, `Nieprawidłowy adres e-mail: ${oneLine(email, 80)}`, 'BAD_EMAIL');
    const name = typeof g === 'object' && g ? oneLine(g.name, 60) : '';
    if (!seen.has(email)) seen.set(email, { email, name: name || null });
  }
  const out = [...seen.values()];
  if (out.length > MAX_GUESTS) throw new ApiError(400, `Na spotkanie można zaprosić najwyżej ${MAX_GUESTS} gości`, 'TOO_MANY_GUESTS');
  return out;
}

// Imię z adresu, gdy zapraszający go nie podał: „anna.nowak@…” → „Anna Nowak”.
export function nameFromEmail(email) {
  const local = String(email || '').split('@')[0].replace(/[._-]+/g, ' ').replace(/\d+/g, ' ').trim();
  const words = local.split(/\s+/).filter(Boolean).slice(0, 3);
  const name = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return oneLine(name, 60) || 'Gość';
}

export const normalizeResponse = (v) => (RESPONSES.includes(v) ? v : null);
export const normalizeTitle = (v) => oneLine(v, TITLE_MAX);

// Nazwa pliku z tytułu (bez znaków niedozwolonych w nazwach plików).
export function oneLineFilename(title) {
  const s = oneLine(title, 60).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s || 'spotkanie';
}

// ── Termin wydarzenia (data + godzina w strefie kościoła) ↔ chwila UTC ─────
function tzOffsetMs(ts, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ts));
  const g = (t) => Number(parts.find((x) => x.type === t).value);
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - ts;
}
// „2026-10-12” + „18:30” w strefie kościoła → Date (UTC). null przy niepełnych danych.
export function zonedToUtc(dateStr, timeStr, tz = TZ) {
  const dm = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ''));
  const tm = /^(\d{1,2}):(\d{2})/.exec(String(timeStr || ''));
  if (!dm || !tm) return null;
  const guess = Date.UTC(+dm[1], +dm[2] - 1, +dm[3], +tm[1], +tm[2]);
  let ts = guess - tzOffsetMs(guess, tz);
  const again = tzOffsetMs(ts, tz);
  if (guess - again !== ts) ts = guess - again; // przejście czasu letniego/zimowego
  return new Date(ts);
}
// Chwila → { date: 'YYYY-MM-DD', time: 'HH:MM' } w strefie kościoła.
export function utcToZoned(at, tz = TZ) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(at));
  const g = (t) => parts.find((x) => x.type === t).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}:${g('minute')}` };
}
// Wydarzenie (date, time, end_time, end_date) → { starts_at, ends_at } (ISO) albo null bez godziny.
// Brak końca (albo koniec przed początkiem) — godzina trwania.
export function eventTimes(ev) {
  const starts = zonedToUtc(ev?.date, ev?.time);
  if (!starts) return null;
  let ends = ev?.end_time ? zonedToUtc(ev.end_date || ev.date, ev.end_time) : null;
  if (!ends || ends <= starts) ends = new Date(starts.getTime() + DEFAULT_DURATION * 60_000);
  return { starts_at: starts.toISOString(), ends_at: ends.toISOString() };
}
// Opis wydarzenia (zwykły tekst albo HTML) → tekst do spotkania i maila.
export function plainText(v, max = DESCRIPTION_MAX) {
  const s = String(v ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return multiLine(s, max) || null;
}

// ── Termin po polsku (strefa kościoła) ──────────────────────────────────────
const fmt = (opts) => new Intl.DateTimeFormat('pl-PL', { timeZone: TZ, ...opts });
export function formatWhen(startsAt, endsAt) {
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  const day = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(s);
  const t = fmt({ hour: '2-digit', minute: '2-digit' });
  const sameDay = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }).format(s) === fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }).format(e);
  return sameDay ? `${day}, ${t.format(s)}–${t.format(e)}` : `${day}, ${t.format(s)} – ${fmt({ day: 'numeric', month: 'long' }).format(e)}, ${t.format(e)}`;
}
export const formatShort = (startsAt) => fmt({ weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(startsAt));

// ── Kalendarz (.ics, RFC 5545) ──────────────────────────────────────────────
const icsDate = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = (t) => String(t ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsParam = (t) => `"${String(t ?? '').replace(/["\r\n]/g, '')}"`;
// Zawijanie linii do 75 bajtów (UTF-8, bez rozcinania znaków).
export function foldIcsLine(line) {
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch, 'utf8');
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}
export const meetingUid = (meetingId) => `meeting-${meetingId}@avenit.app`;

// method: 'REQUEST' (zaproszenie / zmiana) | 'CANCEL' (odwołanie / usunięcie z listy).
export function buildIcs({ meeting, method = 'REQUEST', organizer, attendee, url, now = Date.now() }) {
  const cancel = method === 'CANCEL';
  const desc = [meeting.description, url ? `Dołącz: ${url}` : ''].filter(Boolean).join('\n\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Avenit//Spotkania//PL',
    'CALSCALE:GREGORIAN',
    `METHOD:${cancel ? 'CANCEL' : 'REQUEST'}`,
    'BEGIN:VEVENT',
    `UID:${meetingUid(meeting.id)}`,
    `SEQUENCE:${Number(meeting.sequence) || 0}`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(meeting.starts_at)}`,
    `DTEND:${icsDate(meeting.ends_at)}`,
    `SUMMARY:${icsText(meeting.title)}`,
    ...(desc ? [`DESCRIPTION:${icsText(desc)}`] : []),
    ...(url ? [`LOCATION:${icsText(url)}`, `URL:${url}`] : []),
    ...(organizer?.email ? [`ORGANIZER;CN=${icsParam(organizer.name || organizer.email)}:mailto:${organizer.email}`] : []),
    ...(attendee?.email
      ? [`ATTENDEE;CN=${icsParam(attendee.name || attendee.email)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${attendee.email}`]
      : []),
    `STATUS:${cancel ? 'CANCELLED' : 'CONFIRMED'}`,
    ...(cancel ? [] : ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(meeting.title)}`, `TRIGGER:-PT${REMINDER_MIN}M`, 'END:VALARM']),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

// ── Maile do gości (marka Avenit: papier, słód, kurkuma; bez gradientów i emoji) ──
const C = {
  paper: '#F6F4EE', paperDark: '#ECE8DE', hero: '#FFF1C2', malt: '#2A2312', text: '#4A463E',
  muted: '#6B6557', mustard: '#8A6606', turmeric: '#FFBE0B', line: '#ECE8DE',
};
const FONT = "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// variant: 'invite' | 'update' | 'cancel' | 'reminder'
const COPY = {
  invite: { subject: (t) => `Zaproszenie: ${t}`, head: ['Zaproszenie', 'na spotkanie online'], intro: (by, church) => `${by} zaprasza Cię na spotkanie online (${church}).`, button: 'Dołącz do spotkania' },
  update: { subject: (t) => `Zmiana spotkania: ${t}`, head: ['Zmiana', 'spotkania'], intro: (by) => `${by} zmienił(a) szczegóły spotkania. Aktualny termin poniżej.`, button: 'Dołącz do spotkania' },
  cancel: { subject: (t) => `Odwołane: ${t}`, head: ['Spotkanie', 'odwołane'], intro: (by) => `${by} odwołał(a) to spotkanie. Link do spotkania już nie działa.`, button: null },
  reminder: { subject: (t) => `Za ${REMINDER_MIN} minut: ${t}`, head: ['Spotkanie', `za ${REMINDER_MIN} minut`], intro: () => 'Przypominamy — spotkanie zaraz się zacznie.', button: 'Dołącz do spotkania' },
};
export const variantOf = (v) => (COPY[v] ? v : 'invite');

export function guestEmailSubject(variant, title) {
  return COPY[variantOf(variant)].subject(title);
}

export function guestEmailHtml({ variant = 'invite', title, when, organizerName, churchName, description = '', joinUrl = '', guestName = '' }) {
  const v = variantOf(variant);
  const copy = COPY[v];
  const by = `<strong style="color:${C.malt};font-weight:700;">${escapeHtml(organizerName)}</strong>`;
  const intro = copy.intro(by, escapeHtml(churchName));
  const label = `font-family:${FONT};font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${C.mustard};`;
  const detail = (name, value) => (value ? `
          <tr>
            <td style="padding:14px 0 0;border-top:1px solid ${C.line};width:112px;vertical-align:top;${label}">${name}</td>
            <td style="padding:12px 0 14px;border-top:1px solid ${C.line};font-family:${FONT};font-size:15px;line-height:22px;font-weight:600;color:${C.malt};">${value}</td>
          </tr>` : '');
  const button = copy.button && joinUrl ? `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
          <tr><td align="center" bgcolor="${C.turmeric}" style="border-radius:999px;background:${C.turmeric};">
            <a href="${escapeHtml(joinUrl)}" target="_blank" style="display:block;padding:15px 12px;font-family:${FONT};font-size:16px;line-height:20px;font-weight:800;color:${C.malt};text-decoration:none;border-radius:999px;">${copy.button}</a>
          </td></tr>
        </table>
        <p style="margin:14px 0 0;font-family:${FONT};font-size:13px;line-height:19px;color:${C.muted};text-align:center;">Link jest osobisty${guestName ? ` (dla: ${escapeHtml(guestName)})` : ''}. Nie musisz zakładać konta — wystarczy przeglądarka z kamerą i mikrofonem.</p>` : '';
  const note = v === 'cancel' ? '' : (v === 'reminder' ? '' : `
        <p style="margin:16px 0 0;font-family:${FONT};font-size:13px;line-height:19px;color:${C.muted};text-align:center;">W załączniku plik kalendarza — dodasz spotkanie jednym kliknięciem.</p>`);
  const desc = description ? escapeHtml(description).replace(/\n/g, '<br>') : '';
  const preheader = `${escapeHtml(title)} — ${escapeHtml(when)}`;
  return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<title>${escapeHtml(copy.subject(title))}</title>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;600;700;800&display=swap" rel="stylesheet">
<style>
  a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
  @media (max-width: 480px) { .card { padding: 28px 22px !important; } .h1 { font-size: 26px !important; line-height: 32px !important; } }
</style>
</head>
<body style="margin:0;padding:0;background:${C.paper};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.paper};">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper};">
  <tr><td align="center" style="padding:32px 16px 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
      <tr><td style="padding:0 6px 16px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:800;color:${C.malt};">avenit<span style="color:${C.turmeric};">.</span></td></tr>
      <tr><td class="card" style="background:#FFFFFF;border-radius:24px;padding:36px 32px 32px;">
        <div style="${label}padding-bottom:10px;">${escapeHtml(churchName)}</div>
        <h1 class="h1" style="margin:0 0 12px;font-family:${FONT};font-size:30px;line-height:36px;font-weight:800;letter-spacing:-0.5px;color:${C.malt};">${copy.head[0]} <span style="font-weight:300;">${copy.head[1]}</span><span style="color:${C.turmeric};">.</span></h1>
        <p style="margin:0 0 24px;font-family:${FONT};font-size:15px;line-height:23px;color:${C.text};">${intro}</p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.hero};border-radius:18px;">
          <tr><td style="padding:18px 20px;">
            <div style="${label}">Spotkanie</div>
            <div style="padding-top:4px;font-family:${FONT};font-size:22px;line-height:28px;font-weight:800;color:${C.malt};${v === 'cancel' ? 'text-decoration:line-through;' : ''}">${escapeHtml(title)}</div>
          </td></tr>
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 4px;">
          ${detail('Kiedy', escapeHtml(when))}
          ${detail('Prowadzi', escapeHtml(organizerName))}
          ${detail('Opis', desc)}
        </table>
        ${button}${note}
      </td></tr>
      <tr><td style="padding:20px 6px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${C.muted};text-align:center;">Wiadomość wysłana z aplikacji Avenit na prośbę organizatora spotkania.</td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

export function guestEmailText({ variant = 'invite', title, when, organizerName, churchName, description = '', joinUrl = '' }) {
  const v = variantOf(variant);
  const copy = COPY[v];
  return [
    churchName,
    '',
    `${copy.head[0]} ${copy.head[1]}`,
    copy.intro(organizerName, churchName),
    '',
    `Spotkanie: ${title}`,
    `Kiedy: ${when}`,
    `Prowadzi: ${organizerName}`,
    ...(description ? ['', description] : []),
    ...(copy.button && joinUrl ? ['', `${copy.button}: ${joinUrl}`, 'Link jest osobisty. Nie musisz zakładać konta.'] : []),
    '',
    'Wiadomość wysłana z aplikacji Avenit na prośbę organizatora spotkania.',
  ].join('\n');
}
