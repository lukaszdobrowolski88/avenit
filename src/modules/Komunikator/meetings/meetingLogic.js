// Spotkania online — logika klienta (bez Reacta): formularz ↔ API, termin, stan spotkania.
import { appLocale } from '../../../i18n';

export const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180, 240];
export const DEFAULT_DURATION = 60;
export const MAX_GUESTS = 50;
export const RESPONSES = ['accepted', 'tentative', 'declined'];

const pad = (n) => String(n).padStart(2, '0');
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
export const isEmail = (v) => EMAIL_RE.test(String(v ?? '').trim());

// Data i godzina z formularza (czas lokalny przeglądarki) → ISO; null, gdy niepełne.
export function toStartsAt(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) || !/^\d{2}:\d{2}$/.test(String(time || ''))) return null;
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

// Domyślny termin nowego spotkania: najbliższe pełne pół godziny, co najmniej 30 min od teraz.
export function defaultSlot(now = new Date()) {
  const d = new Date(now.getTime() + 30 * 60_000);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60);
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

// Spotkanie z API → pola formularza edycji.
export function formFromMeeting(m) {
  const s = new Date(m.starts_at);
  const duration = Math.round((Date.parse(m.ends_at) - Date.parse(m.starts_at)) / 60_000);
  return {
    title: m.title || '',
    description: m.description || '',
    date: `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`,
    time: `${pad(s.getHours())}:${pad(s.getMinutes())}`,
    duration: DURATION_OPTIONS.includes(duration) ? duration : duration || DEFAULT_DURATION,
    kind: m.kind === 'audio' ? 'audio' : 'video',
    guestsAutoAdmit: !!m.guests_auto_admit,
  };
}

// Wklejone adresy gości („a@b.pl, c@d.pl; Jan <jan@x.pl>”) → { emails, invalid }.
export function parseGuestInput(text) {
  const parts = String(text || '').split(/[\s,;]+/).map((p) => p.replace(/^<|>$/g, '').trim()).filter(Boolean);
  const emails = [];
  const invalid = [];
  for (const p of parts) {
    if (!p.includes('@')) continue; // słowa z „Jan Kowalski <jan@x.pl>”
    const e = p.toLowerCase();
    if (isEmail(e)) { if (!emails.includes(e)) emails.push(e); } else invalid.push(p);
  }
  return { emails, invalid };
}

// Ciało meeting-create / meeting-update.
export function meetingPayload(form, { members = [], guests = [] } = {}) {
  return {
    title: String(form.title || '').trim(),
    description: String(form.description || '').trim(),
    starts_at: toStartsAt(form.date, form.time),
    duration_min: Number(form.duration) || DEFAULT_DURATION,
    kind: form.kind === 'audio' ? 'audio' : 'video',
    guests_auto_admit: !!form.guestsAutoAdmit,
    members: members.map((m) => (typeof m === 'string' ? m : m.email)),
    guests: guests.map((g) => (typeof g === 'string' ? { email: g } : { email: g.email, name: g.name || undefined })),
  };
}

// Błędy formularza (zanim pójdzie do serwera); null = OK.
export function validateForm(form, { now = Date.now(), editing = false, originalStart = null } = {}) {
  if (!String(form.title || '').trim()) return 'Podaj nazwę spotkania';
  const starts = toStartsAt(form.date, form.time);
  if (!starts) return 'Podaj datę i godzinę spotkania';
  const moved = !editing || starts !== originalStart;
  if (moved && Date.parse(starts) < now - 5 * 60_000) return 'Termin spotkania już minął';
  return null;
}

// Stan względem zegara: 'cancelled' | 'live' (połączenie trwa) | 'soon' (≤ 15 min) | 'now' (w czasie
// spotkania, bez połączenia) | 'upcoming' | 'ended'.
export function meetingPhase(m, { now = Date.now(), callLive = false } = {}) {
  if (!m) return 'upcoming';
  if (m.status === 'cancelled') return 'cancelled';
  if (callLive || m.call_live) return 'live';
  const s = Date.parse(m.starts_at);
  const e = Date.parse(m.ends_at);
  if (now > e) return 'ended';
  if (now >= s) return 'now';
  if (s - now <= 15 * 60_000) return 'soon';
  return 'upcoming';
}

const fmt = (opts) => new Intl.DateTimeFormat(appLocale(), opts);
// „pon., 12 paź · 18:00–19:30” (ten sam dzień) albo z datą końca.
export function formatMeetingWhen(startsAt, endsAt) {
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  const day = fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(s);
  const t = fmt({ hour: '2-digit', minute: '2-digit' });
  const same = s.toDateString() === e.toDateString();
  return same ? `${day} · ${t.format(s)}–${t.format(e)}` : `${day} · ${t.format(s)} – ${fmt({ day: 'numeric', month: 'short' }).format(e)} ${t.format(e)}`;
}
export const formatMeetingLong = (startsAt) => fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(startsAt));

// Liczby odpowiedzi: { accepted, tentative, declined, pending } (członkowie + goście).
export function responseCounts(m) {
  const out = { accepted: 0, tentative: 0, declined: 0, pending: 0 };
  for (const p of [...(m?.members || []), ...(m?.guests || [])]) out[RESPONSES.includes(p.response) ? p.response : 'pending'] += 1;
  return out;
}

export const RESPONSE_LABELS = {
  accepted: 'Wezmę udział',
  tentative: 'Może',
  declined: 'Nie wezmę udziału',
  pending: 'Bez odpowiedzi',
};
export const RESPONSE_STATUS = {
  accepted: 'Bierze udział',
  tentative: 'Może',
  declined: 'Nie bierze udziału',
  pending: 'Bez odpowiedzi',
};
