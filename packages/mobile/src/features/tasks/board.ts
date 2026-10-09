import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { isDoneLabel } from '@avenit/shared/src/lib/boardStatus.js';

// Czyste pomocniki zadań (elementów tablic board_*): kształty wierszy, kolumny, etykiety statusu,
// osoby, termin, dziennik aktywności. Bez Reacta i zapytań — wspólne dla ekranu zadania,
// Kalendarza i pulpitu.

export interface StatusLabel {
  id: string;
  title: string;
  color: string;
  done?: boolean;
}

export interface BoardColumn {
  id: string;
  board_id: string;
  name: string;
  type: string;
  settings: Record<string, any>;
  display_order: number;
}

export interface BoardGroup {
  id: string;
  name: string;
  color: string | null;
  display_order: number;
}

export interface BoardInfo {
  id: string;
  name: string;
  module_key: string | null;
  source_kind: string | null;
}

export interface BoardItem {
  id: string;
  board_id: string;
  group_id: string | null;
  parent_item_id: string | null;
  name: string;
  description: string | null;
  cells: Record<string, unknown>;
  created_at: string | null;
  created_by: string | null;
}

// Osoba w kolumnie „Osoby” — kanoniczny kształt wartości komórki (web PeopleCell).
export interface Person {
  email: string;
  name: string;
  avatar_url: string | null;
}

export interface TaskUpdate {
  id: string;
  item_id: string;
  parent_update_id: string | null;
  author_email: string | null;
  author_name: string | null;
  body: string;
  likes: string[];
  created_at: string | null;
}

export interface TaskActivity {
  id: string;
  actor_email: string | null;
  actor_name: string | null;
  column_id: string | null;
  action: string;
  from_value: unknown;
  to_value: unknown;
  created_at: string | null;
}

// settings/cells bywają zserializowanym JSON-em (stare wiersze) — zawsze obiekt.
export const asObject = (v: unknown): Record<string, any> => {
  if (!v) return {};
  if (typeof v === 'string') {
    try {
      const o = JSON.parse(v);
      return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    } catch {
      return {};
    }
  }
  return typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {};
};

const str = (v: unknown): string => (v == null ? '' : String(v));
const strOrNull = (v: unknown): string | null => (v == null || v === '' ? null : String(v));

export const toColumn = (r: any): BoardColumn => ({
  id: str(r.id),
  board_id: str(r.board_id),
  name: str(r.name),
  type: str(r.type),
  settings: asObject(r.settings),
  display_order: Number(r.display_order) || 0,
});

export const toGroup = (r: any): BoardGroup => ({
  id: str(r.id),
  name: str(r.name) || 'Grupa',
  color: strOrNull(r.color),
  display_order: Number(r.display_order) || 0,
});

export const toBoard = (r: any): BoardInfo => ({
  id: str(r.id),
  name: str(r.name) || 'Tablica',
  module_key: strOrNull(r.module_key),
  source_kind: strOrNull(r.source_kind),
});

export const toItem = (r: any): BoardItem => ({
  id: str(r.id),
  board_id: str(r.board_id),
  group_id: strOrNull(r.group_id),
  parent_item_id: strOrNull(r.parent_item_id),
  name: str(r.name),
  description: typeof r.description === 'string' ? r.description : null,
  cells: asObject(r.cells),
  created_at: strOrNull(r.created_at),
  created_by: strOrNull(r.created_by),
});

// likes bywa {} (domyślny JSONB) albo listą e-maili.
export const toUpdate = (r: any): TaskUpdate => ({
  id: str(r.id),
  item_id: str(r.item_id),
  parent_update_id: strOrNull(r.parent_update_id),
  author_email: strOrNull(r.author_email),
  author_name: strOrNull(r.author_name),
  body: str(r.body),
  likes: Array.isArray(r.likes) ? r.likes.map(str).filter(Boolean) : [],
  created_at: strOrNull(r.created_at),
});

export const toActivity = (r: any): TaskActivity => ({
  id: str(r.id),
  actor_email: strOrNull(r.actor_email),
  actor_name: strOrNull(r.actor_name),
  column_id: strOrNull(r.column_id),
  action: str(r.action),
  from_value: r.from_value ?? null,
  to_value: r.to_value ?? null,
  created_at: strOrNull(r.created_at),
});

// ── Kolory (jak web Boards/lib/palette.js) ──────────────────────────────────
// Tablice powstały z paletą Monday — przy wyświetlaniu mapujemy na paletę aplikacji.
const APP = { success: '#16a34a', warning: '#d97706', danger: '#dc2626', info: '#2563eb', neutral: '#6b7280', accent: '#8A6606' };
const MONDAY_TO_APP: Record<string, string> = {
  '#00c875': APP.success, '#037f4c': APP.success, '#9cd326': APP.success,
  '#fdab3d': APP.warning, '#ff642e': APP.warning,
  '#e2445c': APP.danger, '#ff5ac4': APP.danger,
  '#579bfc': APP.info, '#0086c0': APP.info, '#66ccff': APP.info, '#5559df': APP.info,
  '#a25ddc': APP.accent, '#784bd1': APP.accent, '#401694': APP.accent, '#6366f1': APP.accent,
  '#c4c4c4': APP.neutral, '#333333': APP.neutral,
};
export const boardColor = (hex: string | null | undefined): string => {
  if (!hex) return APP.neutral;
  const h = String(hex).toLowerCase();
  if (MONDAY_TO_APP[h]) return MONDAY_TO_APP[h];
  return /^#[0-9a-f]{6}$/i.test(String(hex)) ? String(hex) : APP.neutral;
};
// Miękkie tło etykiety (kolor + przezroczystość) — tekst w pełnym kolorze ma na nim ≥ 4,5:1.
export const softBg = (hex: string) => `${boardColor(hex)}1F`;

// ── Kolumny ─────────────────────────────────────────────────────────────────
export const statusColumnOf = (cols: BoardColumn[]) => cols.find((c) => c.type === 'status') ?? null;
export const peopleColumnsOf = (cols: BoardColumn[]) => cols.filter((c) => c.type === 'people');
// Termin: kolumna daty z rolą „due” (tablice z importu), potem pierwsza data, potem oś czasu.
export const dueColumnOf = (cols: BoardColumn[]) =>
  cols.find((c) => c.type === 'date' && c.settings?.role === 'due') ??
  cols.find((c) => c.type === 'date') ??
  cols.find((c) => c.type === 'timeline') ??
  null;

export const labelsOf = (col: BoardColumn | null): StatusLabel[] =>
  (Array.isArray(col?.settings?.labels) ? col!.settings.labels : [])
    .filter((l: any) => l && l.id != null)
    .map((l: any) => ({
      id: String(l.id),
      title: String(l.title ?? l.id),
      color: boardColor(l.color),
      ...(typeof l.done === 'boolean' ? { done: l.done } : {}),
    }));

export const labelFor = (col: BoardColumn | null, value: unknown): StatusLabel | null => {
  if (!col || value == null || value === '') return null;
  return labelsOf(col).find((l) => l.id === String(value)) ?? null;
};

export const doneLabelIn = (labels: StatusLabel[]): StatusLabel | null =>
  labels.find((l) => l.done === true) ?? labels.find((l) => isDoneLabel(l)) ?? null;

// Pierwsza etykieta „do zrobienia” (do cofnięcia „gotowe”): jawnie nie-gotowa, inaczej pierwsza.
export const openLabelIn = (labels: StatusLabel[]): StatusLabel | null =>
  labels.find((l) => !isDoneLabel(l)) ?? null;

// Wartość komórki „Osoby” → lista osób (tolerujemy gołe e-maile ze starych danych).
export const peopleIn = (value: unknown): Person[] => {
  if (!Array.isArray(value)) return [];
  const out: Person[] = [];
  for (const p of value) {
    const email = typeof p === 'string' ? p : p?.email;
    if (!email) continue;
    out.push({
      email: String(email),
      name: String((typeof p === 'object' && (p?.name || p?.full_name)) || String(email).split('@')[0]),
      avatar_url: typeof p === 'object' && p?.avatar_url ? String(p.avatar_url) : null,
    });
  }
  return out;
};

const lower = (v: unknown) => String(v ?? '').trim().toLowerCase();
export const sameEmail = (a: unknown, b: unknown) => !!lower(a) && lower(a) === lower(b);

export const isAssigned = (cells: Record<string, unknown>, cols: BoardColumn[], email: string | null) =>
  !!email && peopleColumnsOf(cols).some((c) => peopleIn(cells[c.id]).some((p) => sameEmail(p.email, email)));

// Termin z kolumny daty ('YYYY-MM-DD…') albo osi czasu ({ start, end } → koniec).
export const dueOf = (col: BoardColumn | null, cells: Record<string, unknown>): string | null => {
  if (!col) return null;
  const v = cells?.[col.id] as any;
  const raw = col.type === 'timeline' ? v?.end || v?.start : v;
  if (typeof raw !== 'string') return null;
  const m = raw.match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
};

export const todayYmd = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
export const isOverdueYmd = (ymd: string | null, today = todayYmd()) => !!ymd && ymd < today;

// „Dziś”, „Jutro”, „Wczoraj”, „12 paź” (+ rok, gdy inny).
export const dueLabel = (ymd: string | null): string => {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const diff = Math.round((date.getTime() - t0) / 86_400_000);
  if (diff === 0) return 'Dziś';
  if (diff === 1) return 'Jutro';
  if (diff === -1) return 'Wczoraj';
  return format(date, date.getFullYear() === today.getFullYear() ? 'd MMM' : 'd MMM yyyy', { locale: pl });
};

// Czas komentarza jak na webie: dziś → godzina, wczoraj, dzień tygodnia, potem data.
export const whenLabel = (iso: string | null): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(date)) / 86_400_000);
  const time = format(date, 'HH:mm');
  if (days <= 0) return time;
  if (days === 1) return `wczoraj ${time}`;
  if (days < 7) return `${format(date, 'EEE', { locale: pl })} ${time}`;
  return format(date, date.getFullYear() === now.getFullYear() ? 'd MMM, HH:mm' : 'd MMM yyyy, HH:mm', { locale: pl });
};

// Opis wpisu dziennika aktywności (jak web ItemPanel.activityText).
export const activityText = (a: TaskActivity, columns: BoardColumn[], groups: BoardGroup[]): string => {
  const col = a.column_id ? columns.find((c) => c.id === a.column_id) ?? null : null;
  const field = col?.name;
  const to = a.to_value && typeof a.to_value === 'object' && 'value' in (a.to_value as any) ? (a.to_value as any).value : a.to_value;
  switch (a.action) {
    case 'created':
      return (a.to_value as any)?.via === 'form' ? 'utworzył(a) zadanie · przez formularz' : 'utworzył(a) zadanie';
    case 'status_changed': {
      if (!field) return 'zmienił(a) status';
      const l = labelFor(col, to);
      return l ? `zmienił(a) „${field}” na „${l.title}”` : `wyczyścił(a) „${field}”`;
    }
    case 'value_changed':
      return field ? `zmienił(a) pole „${field}”` : 'zmienił(a) wartość';
    case 'assigned':
      return field ? `zmienił(a) pole „${field}”` : 'zmienił(a) przypisanie';
    case 'moved': {
      const g = groups.find((x) => x.id === String((a.to_value as any)?.group_id ?? ''));
      return g ? `przeniósł(przeniosła) do grupy „${g.name}”` : 'przeniósł(przeniosła) do innej grupy';
    }
    case 'renamed':
      return 'zmienił(a) nazwę';
    case 'description_changed':
      return 'zmienił(a) opis';
    default:
      return a.action || 'zmiana';
  }
};

// ── Błędy ──────────────────────────────────────────────────────────────────
type ErrLike = { code?: string; status?: number; message?: string } | null | undefined;

export const isForbidden = (e: ErrLike) =>
  !!e && (e.status === 403 || e.status === 401 || ['403', '401', '42501'].includes(String(e.code ?? '')));

// Brak wiersza / zły identyfikator (np. ucięty link) — „nie ma takiego zadania”.
export const isNotFound = (e: ErrLike) =>
  !!e && (e.status === 404 || ['404', '400', '22P02', 'PGRST116'].includes(String(e.code ?? '')));
