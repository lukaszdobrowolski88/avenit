// „Moje zadania” na Pulpicie: elementy tablic (Projekty + zakładki „Zadania” modułów + zadania
// Kalendarza), w których bieżący użytkownik jest w którejkolwiek kolumnie „Osoby”. Czysta logika
// (bez Reacta i zapytań) — testy obok (myBoardTasks.test.js).
//
// Link do zadania i „gotowe” — JEDNA reguła z @avenit/shared (taskLinks.js / boardStatus.js),
// ta sama co w powiadomieniach serwera, Kalendarzu i mobilce.
import { taskItemLink, taskBoardModuleKey } from '@avenit/shared/src/lib/taskLinks.js';
import { isDoneLabel, doneLabelOf } from '@avenit/shared/src/lib/boardStatus.js';

const lower = (v) => String(v ?? '').trim().toLowerCase();

// app_modules ({ key, path }) → { [key]: path } dla taskItemLink.
export function modulePaths(modules = []) {
  const out = {};
  for (const m of modules || []) if (m?.key && typeof m.path === 'string') out[m.key] = m.path;
  return out;
}

// Termin z kolumny daty ('YYYY-MM-DD') albo osi czasu ({ start, end } → koniec).
export function dueOf(dateCol, cells) {
  if (!dateCol) return null;
  const v = cells?.[dateCol.id];
  const raw = dateCol.type === 'timeline' ? (v?.end || v?.start) : v;
  if (typeof raw !== 'string') return null;
  const m = raw.match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

export function todayYmd(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export const isOverdueYmd = (due, today = todayYmd()) => !!due && due < today;

const byOrder = (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0);

// boards: [{ id, name, module_key, source_kind, is_template }], columns: [{ id, board_id, type, settings,
// display_order }], items: [{ id, board_id, name, cells, parent_item_id, event_id? }].
// Wiersze zadań (bez filtra osób) — np. zadania wydarzenia. keep(item, peopleCols) zawęża wynik.
// Zwraca zadania posortowane: z terminem rosnąco, bez terminu na końcu (potem po nazwie).
export function boardTaskRows({ boards = [], columns = [], items = [], modules = [], keep = null }) {
  const paths = modulePaths(modules);
  const boardById = new Map(boards.filter((b) => b && !b.is_template).map((b) => [String(b.id), b]));
  const colsByBoard = new Map();
  for (const c of [...columns].sort(byOrder)) {
    const k = String(c.board_id);
    if (!colsByBoard.has(k)) colsByBoard.set(k, []);
    colsByBoard.get(k).push(c);
  }
  const moduleLabel = (key) => modules.find((m) => m?.key === key)?.label || null;

  const out = [];
  for (const it of items) {
    const board = boardById.get(String(it.board_id));
    if (!board) continue;
    const cols = colsByBoard.get(String(it.board_id)) || [];
    const peopleCols = cols.filter((c) => c.type === 'people');
    if (keep && !keep(it, peopleCols)) continue;

    const dateCol = cols.find((c) => c.type === 'date' && c.settings?.role === 'due')
      || cols.find((c) => c.type === 'date') || cols.find((c) => c.type === 'timeline') || null;
    const statusCol = cols.find((c) => c.type === 'status') || null;
    const labels = Array.isArray(statusCol?.settings?.labels) ? statusCol.settings.labels : [];
    const statusVal = statusCol ? it.cells?.[statusCol.id] : null;
    const status = statusCol ? labels.find((l) => l?.id === statusVal) || null : null;
    const doneLabel = doneLabelOf(statusCol);
    const moduleKey = taskBoardModuleKey(board);
    const people = peopleCols.flatMap((c) => (Array.isArray(it.cells?.[c.id]) ? it.cells[c.id] : []))
      .filter((p) => p && typeof p === 'object' && p.email);

    out.push({
      id: it.id,
      boardId: board.id,
      name: String(it.name || '').trim(),
      boardName: (moduleKey && moduleLabel(moduleKey)) || board.name || '',
      due: dueOf(dateCol, it.cells),
      status,                                   // { id, title, color } | null
      done: isDoneLabel(status),
      statusColId: statusCol?.id || null,
      doneLabelId: doneLabel?.id || null,       // null = brak etykiety „gotowe” (bez szybkiego odhaczania)
      people,                                   // [{ email, name, avatar_url }] ze wszystkich kolumn „Osoby”
      eventId: it.event_id ?? null,
      link: taskItemLink(board, it.id, paths),
    });
  }
  return out.sort(compareTasks);
}

// Elementy, w których osoba (email: jeden adres albo lista kont tej osoby) jest w kolumnie „Osoby”.
export function collectMyBoardTasks({ boards = [], columns = [], items = [], email, modules = [] }) {
  const mine = new Set((Array.isArray(email) ? email : [email]).map(lower).filter(Boolean));
  if (!mine.size) return [];
  return boardTaskRows({
    boards, columns, items, modules,
    keep: (it, peopleCols) => peopleCols.some((c) => {
      const v = it.cells?.[c.id];
      return Array.isArray(v) && v.some((p) => mine.has(lower(typeof p === 'string' ? p : p?.email)));
    }),
  });
}

export function compareTasks(a, b) {
  if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
  if (a.due && !b.due) return -1;
  if (!a.due && b.due) return 1;
  return String(a.name).localeCompare(String(b.name), 'pl');
}
