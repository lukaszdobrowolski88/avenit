// Social Media — udostępnianie treści Avenit (wydarzenia, kazania): szablony postów, zmienne,
// miniatury YouTube, UTM. Wspólne dla serwera (gotowy szkic, reguły automatyczne) i webu
// (podgląd szablonu w edytorze reguł).
import { warsawParts } from './chatSchedule.js';

const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
const WEEKDAYS = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];

// Data z bazy → „RRRR-MM-DD”. Kolumna `date` przychodzi z node-pg jako Date o północy czasu
// lokalnego procesu — bierzemy części lokalne (toISOString przesunąłby dzień przy strefie +1/+2).
export function ymdOf(value) {
  if (!value) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

// Data wydarzenia/kazania („RRRR-MM-DD”, ISO albo Date) → „niedziela, 26 października”.
export function formatDayPl(value) {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymdOf(value));
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export const formatTime = (t) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
};

// Tekst z HTML (opis wydarzenia z edytora) — bez znaczników, encji i nadmiaru spacji.
export function plainText(html, max = 0) {
  const s = String(html || '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
  if (!max || s.length <= max) return s;
  const cut = s.slice(0, max);
  const at = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('\n'));
  return `${(at > max * 0.5 ? cut.slice(0, at + 1) : cut).trim()}…`;
}

// Identyfikator filmu YouTube z adresu (watch, youtu.be, embed, shorts, live).
export function youtubeId(url) {
  const s = String(url || '');
  const m = s.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
export const youtubeThumb = (url) => {
  const id = youtubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
};

// Zmienne szablonów (polskie nazwy — widoczne dla użytkownika w edytorze reguł).
export const TEMPLATE_VARS = {
  event: [
    { key: 'tytul', label: 'Tytuł' }, { key: 'data', label: 'Data' }, { key: 'godzina', label: 'Godzina' },
    { key: 'miejsce', label: 'Miejsce' }, { key: 'opis', label: 'Opis' }, { key: 'link', label: 'Link' },
  ],
  sermon: [
    { key: 'tytul', label: 'Tytuł' }, { key: 'mowca', label: 'Mówca' }, { key: 'seria', label: 'Seria' },
    { key: 'data', label: 'Data' }, { key: 'fragment', label: 'Fragment Pisma' }, { key: 'opis', label: 'Opis' }, { key: 'link', label: 'Link' },
  ],
};

export const DEFAULT_TEMPLATES = {
  event: '📅 {tytul}\n{data}{godzina? · godz. {godzina}}{miejsce? · {miejsce}}\n\n{opis}\n\nWięcej: {link}',
  sermon: '🎧 Nowe kazanie: „{tytul}”{mowca? — {mowca}}{seria?\nSeria: {seria}}{fragment?\n📖 {fragment}}\n\n{opis}\n\nPosłuchaj: {link}',
};

export function eventVars(ev, link = '') {
  return {
    tytul: String(ev?.title || '').trim(),
    data: formatDayPl(ev?.date),
    godzina: formatTime(ev?.time),
    miejsce: String(ev?.location || '').trim(),
    opis: plainText(ev?.details_html || ev?.description || '', 400),
    link: link || '',
  };
}

export function sermonVars(s, link = '') {
  return {
    tytul: String(s?.title || '').trim(),
    mowca: String(s?.speaker || '').trim(),
    seria: String(s?.series || '').trim(),
    data: formatDayPl(s?.sermon_date),
    fragment: String(s?.scripture_ref || '').trim(),
    opis: plainText(s?.description || '', 400),
    link: link || '',
  };
}

// Szablon: {zmienna} — wartość; {zmienna? tekst z {zmienna}} — fragment tylko, gdy zmienna niepusta.
// Puste linie po usunięciu fragmentów są sprzątane.
export function renderTemplate(tpl, vars = {}) {
  const val = (k) => String(vars[k] ?? '').trim();
  let out = String(tpl || '').replace(/\{(\w+)\?([^{}]*(?:\{\w+\}[^{}]*)*)\}/g, (_, k, inner) =>
    (val(k) ? inner.replace(/\{(\w+)\}/g, (m, kk) => val(kk)) : ''));
  out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? val(k) : m));
  return out.split('\n').map((l) => l.replace(/[ \t]+$/g, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// UTM do adresu (zachowuje istniejące parametry; nie nadpisuje jawnie podanych utm_*).
export function withUtm(url, { source, medium = 'social', campaign } = {}) {
  let u;
  try { u = new URL(url); } catch { return url; }
  if (!/^https?:$/.test(u.protocol)) return url;
  if (source && !u.searchParams.has('utm_source')) u.searchParams.set('utm_source', source);
  if (medium && !u.searchParams.has('utm_medium')) u.searchParams.set('utm_medium', medium);
  if (campaign && !u.searchParams.has('utm_campaign')) u.searchParams.set('utm_campaign', campaign);
  return u.toString();
}

// Adresy do skrócenia w treści (bez naszych krótkich linków i bez adresów samych sieci).
const URL_RE_G = /\bhttps?:\/\/[^\s<>"')\]]+/gi;
export function findUrls(text) {
  return [...new Set((String(text || '').match(URL_RE_G) || []).map((u) => u.replace(/[.,;:!?]+$/, '')))];
}
export const isShortLink = (url) => /^https?:\/\/[^/]+\/l\/[A-Za-z0-9]{5,12}$/.test(String(url || ''));
export const isSocialHost = (url) => /^https?:\/\/([^/]+\.)?(facebook\.com|fb\.me|instagram\.com|threads\.net)\b/i.test(String(url || ''));

// Termin reguły „przypomnienie o wydarzeniu”: czy wydarzenie z datą `date` przypada za `days` dni (czas polski).
export function isDaysBefore(date, days, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymdOf(date));
  if (!m) return false;
  const p = warsawParts(now);
  const today = Date.UTC(p.year, p.month - 1, p.day);
  const ev = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.round((ev - today) / 86_400_000) === Number(days);
}
