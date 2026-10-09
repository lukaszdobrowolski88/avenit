// „Moja praca” — czysta logika (testy obok): z elementów przypisanych do mnie (board_items z
// assignee_emails) + tablic + kolumn → wiersze z terminem, statusem, „zrobione” i linkiem.
import { taskItemLink } from '@avenit/shared/src/lib/taskLinks.js';
import { isDoneLabel } from '@avenit/shared/src/lib/boardStatus.js';
import { boardColor } from './palette';

const lower = (v) => String(v ?? '').trim().toLowerCase();
const YMD = /^\d{4}-\d{2}-\d{2}/;

// Kolumna terminu: data z rolą „termin”, potem pierwsza data, potem oś czasu (jak serwer, my-board-items).
export function dueColumn(columns) {
  const cols = [...(columns || [])].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  return cols.find((c) => c.type === 'date' && c.settings?.role === 'due')
    || cols.find((c) => c.type === 'date')
    || cols.find((c) => c.type === 'timeline')
    || null;
}

// Termin 'YYYY-MM-DD' albo null (oś czasu → koniec, a bez końca — początek).
export function dueOf(column, cells) {
  if (!column) return null;
  const v = cells?.[column.id];
  const raw = column.type === 'timeline' ? (v?.end || v?.start) : v;
  return typeof raw === 'string' && YMD.test(raw) ? raw.slice(0, 10) : null;
}

// Czy jestem w którejś kolumnie „Osoby” (e-mail bez względu na wielkość liter; stare dane — gołe e-maile).
export function isAssigned(cells, peopleColumns, email) {
  const me = lower(email);
  if (!me) return false;
  return (peopleColumns || []).some((c) => {
    const v = cells?.[c.id];
    return Array.isArray(v) && v.some((p) => lower(typeof p === 'string' ? p : p?.email) === me);
  });
}

// paths: { [moduleKey]: '/sciezka' } z app_modules — link przez wspólną regułę taskItemLink.
export function modulePaths(modules) {
  return Object.fromEntries((modules || []).filter((m) => m?.key && typeof m.path === 'string').map((m) => [m.key, m.path]));
}

// items: [{ id, board_id, name, cells }], boards: [{ id, name, color, module_key, source_kind, is_archived, is_template }],
// columns: [{ id, board_id, type, settings, display_order }]. Pomija tablice zarchiwizowane i szablony.
export function buildMyWorkRows({ items, boards, columns, email, paths = {} }) {
  const boardById = new Map((boards || []).filter((b) => b && !b.is_archived && !b.is_template).map((b) => [String(b.id), b]));
  const colsByBoard = new Map();
  for (const c of columns || []) {
    const k = String(c.board_id);
    if (!colsByBoard.has(k)) colsByBoard.set(k, []);
    colsByBoard.get(k).push(c);
  }
  const out = [];
  for (const it of items || []) {
    const board = boardById.get(String(it.board_id));
    if (!board) continue;
    const cols = colsByBoard.get(String(it.board_id)) || [];
    if (!isAssigned(it.cells, cols.filter((c) => c.type === 'people'), email)) continue;
    const statusCol = cols.find((c) => c.type === 'status');
    const label = statusCol ? (statusCol.settings?.labels || []).find((l) => l.id === it.cells?.[statusCol.id]) || null : null;
    out.push({
      id: it.id,
      name: it.name || '',
      boardId: board.id,
      boardName: board.name || '',
      boardColor: boardColor(board.color),
      due: dueOf(dueColumn(cols), it.cells),
      status: label ? { title: label.title, color: boardColor(label.color) } : null,
      done: isDoneLabel(label),
      link: taskItemLink(board, it.id, paths),
    });
  }
  return out;
}

// Zapas: wynik fn my-board-items (tylko elementy z terminem) → te same wiersze.
export function rowsFromFn(items, paths = {}) {
  return (items || []).map((it) => ({
    id: it.id,
    name: it.name || '',
    boardId: it.board_id,
    boardName: it.board_name || '',
    boardColor: boardColor(null),
    due: it.end || it.date || null,
    status: it.status ? { title: it.status.title, color: boardColor(it.status.color) } : null,
    done: !!it.done,
    link: taskItemLink({ id: it.board_id, module_key: it.module_key, source_kind: it.source_kind }, it.id, paths),
  }));
}

export const BUCKET_KEYS = ['overdue', 'today', 'week', 'later', 'none', 'done'];

// Kubełki wg terminu (today/endOfWeek jako 'YYYY-MM-DD'); w kubełku rosnąco po terminie, potem nazwie.
export function bucketize(rows, today, endOfWeek) {
  const g = Object.fromEntries(BUCKET_KEYS.map((k) => [k, []]));
  for (const r of rows || []) {
    if (r.done) g.done.push(r);
    else if (!r.due) g.none.push(r);
    else if (r.due < today) g.overdue.push(r);
    else if (r.due === today) g.today.push(r);
    else if (r.due <= endOfWeek) g.week.push(r);
    else g.later.push(r);
  }
  for (const list of Object.values(g)) {
    list.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.name.localeCompare(b.name, 'pl'));
  }
  return g;
}
