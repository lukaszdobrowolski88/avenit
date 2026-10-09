// Link do zadania (elementu tablicy) — JEDNA reguła dla serwera (powiadomienia, iCal, my-board-items),
// webu (pulpit, Kalendarz, wyszukiwarka) i mobilki (deep linki). Wcześniej były trzy kopie z różnymi
// warunkami i zadania Kalendarza prowadziły do Projektów, do których część osób nie ma dostępu.
//
//   • tablica zadań służby (source_kind = stara tabela zadań modułu: media_tasks, custom_<key>_tasks…)
//     → strona modułu z ?item=<id> (moduł otwiera zakładkę Zadania, ModuleBoard — zadanie);
//   • tablica zadań Kalendarza (source_kind 'tasks') → /wydarzenia?item=<id> (Kalendarz otwiera zadanie);
//   • każda inna tablica (Projekty, zakładka „Tablica” w module) → /projekty?board=<id>&item=<id>.
import { moduleForTasksSource } from '../permissions/moduleScope.js';

// Ścieżki modułów, gdy app_modules nie podaje własnej (zgodne z menu bocznym).
export const FALLBACK_MODULE_PATHS = {
  media: '/media', homegroups: '/home-groups', mlodziezowka: '/mlodziezowka',
  atmosfera: '/atmosfera', worship: '/worship', kids: '/kids', calendar: '/wydarzenia',
};

export function modulePathFor(key, paths = {}) {
  const p = paths?.[key];
  if (typeof p === 'string' && p.startsWith('/')) return p;
  return FALLBACK_MODULE_PATHS[key] || `/module/${encodeURIComponent(key)}`;
}

// Moduł, którego zakładka „Zadania” (albo Kalendarz) pokazuje tę tablicę; null = zwykła tablica Projektów.
// Rozstrzyga source_kind (tablica z importu bywa bez module_key), a nie samo module_key —
// tablice z zakładki „Tablica” modułu też mają module_key, ale nie otwierają się z ?item=.
export function taskBoardModuleKey(board) {
  if (!board) return null;
  const fromSource = moduleForTasksSource(board.source_kind);
  if (!fromSource) return null;
  return board.module_key ? String(board.module_key) : fromSource;
}

// paths: { [moduleKey]: '/sciezka' } z app_modules.path (opcjonalnie).
export function taskItemLink(board, itemId, paths = {}) {
  const id = encodeURIComponent(String(itemId));
  const key = taskBoardModuleKey(board);
  if (key) {
    const base = modulePathFor(key, paths);
    return `${base}${base.includes('?') ? '&' : '?'}item=${id}`;
  }
  return `/projekty?board=${encodeURIComponent(String(board?.id ?? ''))}&item=${id}`;
}

// Odwrotność dla klientów (mobilka, nawigacja w aplikacji): z linku → { kind, moduleKey?, boardId?, itemId }.
export function parseTaskLink(link, paths = {}) {
  try {
    const u = new URL(String(link || ''), 'https://x.invalid');
    const itemId = u.searchParams.get('item');
    if (!itemId) return null;
    if (u.pathname === '/projekty') return { kind: 'board', boardId: u.searchParams.get('board'), itemId };
    if (u.pathname === '/wydarzenia' || u.pathname === '/calendar') return { kind: 'module', moduleKey: 'calendar', itemId };
    const byPath = Object.entries({ ...FALLBACK_MODULE_PATHS, ...paths }).find(([, p]) => p === u.pathname);
    if (byPath) return { kind: 'module', moduleKey: byPath[0], itemId };
    const m = /^\/module\/([^/]+)$/.exec(u.pathname);
    if (m) return { kind: 'module', moduleKey: decodeURIComponent(m[1]), itemId };
    return null;
  } catch { return null; }
}

// Którą tablicę źródła (source_kind) uznać za „tablicę zadań” — ta sama reguła co serwer
// (board-import-legacy): najpierw utworzona przez import, potem najstarsza. rows posortowane rosnąco po created_at.
export const IMPORT_CREATOR = 'system:board-import';
export function pickSourceBoard(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return list.find((b) => b?.created_by === IMPORT_CREATOR) || list[0] || null;
}
