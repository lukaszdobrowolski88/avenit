// Wyszukiwarka ⌘K: elementy tablic (zadania służb, Kalendarza i Projektów) → wyniki palety.
// Czysta logika (testy obok). Zapytania idą przez Data API, więc serwer stosuje zakresy
// (prywatne tablice, tablice służb) — tu tylko odrzucamy archiwum/szablony i budujemy link
// wspólną regułą taskItemLink.
import { taskItemLink, taskBoardModuleKey } from '@avenit/shared/src/lib/taskLinks.js';

export const BOARD_ITEM_LIMIT = 20;

// labelFor(key, fallback) — nazwa modułu jak w menu; paths — { [moduleKey]: '/sciezka' }.
export function boardItemResults(items, boards, { paths = {}, labelFor = (k, f) => f } = {}) {
  const byId = new Map((boards || []).filter((b) => b && !b.is_archived && !b.is_template).map((b) => [String(b.id), b]));
  const out = [];
  for (const it of items || []) {
    const board = byId.get(String(it.board_id));
    if (!board) continue;
    const moduleKey = taskBoardModuleKey(board) || board.module_key || null;
    const moduleName = moduleKey ? labelFor(moduleKey, moduleKey === 'calendar' ? 'Wydarzenia' : moduleKey) : labelFor('boards', 'Projekty');
    // Tablica zadań służby nazywa się zwykle jak moduł — nie powtarzaj nazwy dwa razy.
    const boardName = board.name || '';
    const sub = boardName && boardName !== moduleName ? `${boardName} · ${moduleName}` : moduleName;
    out.push({
      id: `board-item-${it.id}`,
      label: it.name || '',
      sub,
      path: taskItemLink(board, it.id, paths),
    });
    if (out.length >= BOARD_ITEM_LIMIT) break;
  }
  return out;
}
