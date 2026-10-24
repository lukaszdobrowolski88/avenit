// Social Media — czysta logika widoków (bez Reacta), testowana w socialUi.test.js.
import { STATUS_COLORS } from '../../../components/ui/DataTable';

// Kolory statusów — bez „tęczy”: szarość, musztarda marki, zieleń/czerwień tylko jako wynik.
export const STATUS_COLOR = {
  draft: STATUS_COLORS.neutral,
  pending_approval: STATUS_COLORS.accent,
  scheduled: '#4A463E',
  publishing: STATUS_COLORS.warning,
  published: STATUS_COLORS.success,
  partial: STATUS_COLORS.warning,
  failed: STATUS_COLORS.danger,
};
export const TARGET_COLOR = {
  pending: STATUS_COLORS.neutral,
  publishing: STATUS_COLORS.warning,
  processing: STATUS_COLORS.warning,
  published: STATUS_COLORS.success,
  failed: STATUS_COLORS.danger,
};

const pad = (n) => String(n).padStart(2, '0');

// Data lokalna urządzenia (aplikacja działa w Polsce — czas przeglądarki = czas polski).
export const dayKey = (d) => {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
export const timeLabel = (d) => {
  const x = d instanceof Date ? d : new Date(d);
  return `${pad(x.getHours())}:${pad(x.getMinutes())}`;
};

// Pola formularza (data + godzina) ↔ ISO.
export function toLocalFields(iso) {
  if (!iso) return { ymd: '', hm: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { ymd: '', hm: '' };
  return { ymd: dayKey(d), hm: timeLabel(d) };
}
export function fromLocalFields(ymd, hm) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
  const t = /^(\d{1,2}):(\d{2})$/.exec(String(hm || ''));
  if (!m || !t) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(t[1]), Number(t[2]), 0, 0);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Kiedy post „jest” w kalendarzu: opublikowany — moment publikacji, inaczej termin.
export const postWhen = (p) => p?.published_at || p?.scheduled_at || null;

// Siatka miesiąca od poniedziałku: tygodnie × 7 dni (Date o północy lokalnej).
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // pn = 0
  const start = new Date(year, month, 1 - offset);
  const last = new Date(year, month + 1, 0);
  const cells = Math.ceil((offset + last.getDate()) / 7) * 7;
  const weeks = [];
  for (let i = 0; i < cells; i += 7) {
    weeks.push(Array.from({ length: 7 }, (_, j) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i + j)));
  }
  return weeks;
}

// Tydzień (pn–nd) zawierający datę.
export function weekDays(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (d.getDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset + i));
}

// Posty pogrupowane po dniu (kolejka / opublikowane): [{ key, date, posts }] w kolejności wejścia.
export function groupByDay(posts, { desc = false } = {}) {
  const groups = new Map();
  for (const p of posts || []) {
    const when = postWhen(p);
    const key = when ? dayKey(when) : 'none';
    if (!groups.has(key)) groups.set(key, { key, date: when ? new Date(when) : null, posts: [] });
    groups.get(key).posts.push(p);
  }
  const list = [...groups.values()];
  list.sort((a, b) => {
    if (a.key === 'none') return 1;
    if (b.key === 'none') return -1;
    return desc ? b.key.localeCompare(a.key) : a.key.localeCompare(b.key);
  });
  return list;
}

// Posty na dzień (kalendarz): mapa dayKey → posty posortowane po godzinie.
export function postsByDay(posts) {
  const map = new Map();
  for (const p of posts || []) {
    const when = postWhen(p);
    if (!when) continue;
    const k = dayKey(when);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(p);
  }
  for (const list of map.values()) list.sort((a, b) => new Date(postWhen(a)) - new Date(postWhen(b)));
  return map;
}

// Przeniesienie posta na inny dzień z zachowaniem godziny (przeciąganie w kalendarzu).
export function moveToDay(iso, targetDate) {
  const src = iso ? new Date(iso) : new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 18, 0);
  const d = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), src.getHours(), src.getMinutes(), 0, 0);
  return d.toISOString();
}

const lower = (v) => String(v || '').toLowerCase();

// Co osoba może zrobić z postem — wspólne z mobilką (shared/lib/social.js), zgodne z serwerem.
export { postPermissions } from '@avenit/shared/src/lib/social.js';

// Wstawienie tekstu na końcu (zestaw hashtagów) z odstępem.
export function appendBlock(text, block) {
  const t = String(text || '');
  const b = String(block || '').trim();
  if (!b) return t;
  if (!t.trim()) return b;
  return `${t.replace(/\s+$/, '')}\n\n${b}`;
}

// Skrót tekstu do kart.
export function snippet(text, max = 140) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// Parametry powrotu z logowania Meta (?sm_result=…) → komunikat.
export function connectMessage(params) {
  const result = params.get('sm_result');
  if (!result) return null;
  if (result === 'connected') {
    const n = Number(params.get('sm_added')) || 0;
    return { tone: 'success', text: n ? 'Połączono kanały: {n}.' : 'Kanały odświeżone.', n };
  }
  const reasons = {
    denied: 'Logowanie do Facebooka zostało anulowane.',
    state: 'Sesja łączenia wygasła — spróbuj ponownie.',
    scopes: 'Nie udzielono zgody na publikowanie — połącz ponownie i zaznacz wszystkie zgody.',
    no_pages: 'Nie znaleziono stron, na których możesz publikować. Sprawdź swoją rolę na stronie.',
    not_configured: 'Aplikacja Meta nie jest skonfigurowana na platformie.',
  };
  return { tone: 'error', text: reasons[params.get('sm_reason')] || 'Nie udało się połączyć kanałów.' };
}

// Filtry widoków: kanały (którykolwiek z wybranych), status, tylko moje posty.
export const EMPTY_FILTERS = { accounts: [], status: '', mine: false };
export const filtersActive = (f) => Boolean(f && (f.accounts?.length || f.status || f.mine));
export function filterPosts(posts, f, myEmail = '') {
  if (!filtersActive(f)) return posts || [];
  const acc = new Set(f.accounts || []);
  const me = lower(myEmail);
  return (posts || []).filter((p) => {
    if (acc.size && !(p.targets || []).some((t) => acc.has(t.account_id))) return false;
    if (f.status && p.status !== f.status) return false;
    if (f.mine && lower(p.created_by) !== me) return false;
    return true;
  });
}
