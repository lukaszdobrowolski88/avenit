// „Moje zadania” na Pulpicie: elementy tablic (Projekty + zakładki „Zadania” modułów), w których
// bieżący użytkownik jest w którejkolwiek kolumnie „Osoby”. Czysta logika (bez Reacta i zapytań)
// — testy obok (myBoardTasks.test.js).
//
// Reguła linku zgodna z powiadomieniem serwera (packages/api/src/dataapi/boardNotify.js):
// tablica zakładki „Zadania” modułu (source_kind '<x>_tasks') → ścieżka modułu + ?item=<id>
// (ModuleBoard otwiera element), każda inna tablica → /projekty?board=<id>&item=<id>.

const lower = (v) => String(v ?? '').trim().toLowerCase();

const TASK_SOURCE_MODULES = { media_tasks: 'media', home_group_tasks: 'homegroups', mlodziezowka_tasks: 'mlodziezowka' };
const FALLBACK_MODULE_PATHS = {
  media: '/media', homegroups: '/home-groups', mlodziezowka: '/mlodziezowka',
  atmosfera: '/atmosfera', worship: '/worship', kids: '/kids',
};

// Klucz modułu, w którego zakładce „Zadania” żyje tablica; null = zwykła tablica Projektów.
export function taskBoardModuleKey(board) {
  const sk = String(board?.source_kind || '');
  if (!sk.endsWith('_tasks')) return null;
  if (board.module_key) return String(board.module_key);
  if (TASK_SOURCE_MODULES[sk]) return TASK_SOURCE_MODULES[sk];
  const m = sk.match(/^custom_(.+)_tasks$/);
  return m ? m[1] : null;
}

// modules: lista app_modules ({ key, path, label }) — z useAppModules.
export function taskLink(board, itemId, modules = []) {
  const key = taskBoardModuleKey(board);
  const id = encodeURIComponent(String(itemId));
  if (key) {
    const mod = modules.find((m) => m?.key === key);
    const path = typeof mod?.path === 'string' && mod.path.startsWith('/')
      ? mod.path
      : (FALLBACK_MODULE_PATHS[key] || `/module/${encodeURIComponent(key)}`);
    return `${path}?item=${id}`;
  }
  return `/projekty?board=${encodeURIComponent(String(board.id))}&item=${id}`;
}

// Etykieta „gotowe”: id albo tytuł w stylu Gotowe / Zrobione / Ukończone / Zakończone / Done.
const DONE_RE = /(^|[^a-z])(done|gotow|zrobion|ukoncz|zakoncz|zamkniet|complete|finish)/;
const norm = (s) => lower(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
export function isDoneLabel(label) {
  if (!label) return false;
  return DONE_RE.test(norm(label.id)) || DONE_RE.test(norm(label.title));
}

// Etykieta „gotowe” kolumny statusu (do szybkiego „oznacz jako gotowe”) albo null.
export function doneLabelOf(statusCol) {
  const labels = Array.isArray(statusCol?.settings?.labels) ? statusCol.settings.labels : [];
  return labels.find((l) => lower(l?.id) === 'done') || labels.find(isDoneLabel) || null;
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
// display_order }], items: [{ id, board_id, name, cells, parent_item_id }].
// Zwraca zadania posortowane: z terminem rosnąco, bez terminu na końcu (potem po nazwie).
export function collectMyBoardTasks({ boards = [], columns = [], items = [], email, modules = [] }) {
  const me = lower(email);
  if (!me) return [];
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
    const assigned = peopleCols.some((c) => {
      const v = it.cells?.[c.id];
      return Array.isArray(v) && v.some((p) => lower(typeof p === 'string' ? p : p?.email) === me);
    });
    if (!assigned) continue;

    const dateCol = cols.find((c) => c.type === 'date') || cols.find((c) => c.type === 'timeline') || null;
    const statusCol = cols.find((c) => c.type === 'status') || null;
    const labels = Array.isArray(statusCol?.settings?.labels) ? statusCol.settings.labels : [];
    const statusVal = statusCol ? it.cells?.[statusCol.id] : null;
    const status = statusCol ? labels.find((l) => l?.id === statusVal) || null : null;
    const doneLabel = doneLabelOf(statusCol);
    const moduleKey = taskBoardModuleKey(board);

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
      link: taskLink(board, it.id, modules),
    });
  }
  return out.sort(compareTasks);
}

export function compareTasks(a, b) {
  if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
  if (a.due && !b.due) return -1;
  if (!a.due && b.due) return 1;
  return String(a.name).localeCompare(String(b.name), 'pl');
}
