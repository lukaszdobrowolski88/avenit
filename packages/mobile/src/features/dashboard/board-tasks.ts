import { isDoneLabel } from '@avenit/shared/src/lib/boardStatus.js';
import { taskBoardModuleKey } from '@avenit/shared/src/lib/taskLinks.js';
import { supabase } from '../../lib/supabase';
import {
  doneLabelIn,
  dueColumnOf,
  dueOf,
  isAssigned,
  isForbidden,
  labelFor,
  labelsOf,
  statusColumnOf,
  toColumn,
  toItem,
  type BoardColumn,
} from '../tasks/board';

// „Moje zadania” z tablic (Projekty + zakładki „Zadania” służb + zadania Kalendarza): elementy,
// w których jestem w którejkolwiek kolumnie „Osoby” — ta sama logika co web
// (Dashboard/utils/myBoardTasks.js + hooks/useMyBoardTasks.js). Także bez terminu (fn
// my-board-items zwraca tylko te z terminem). Zakres wierszy wyznacza serwer (prywatne tablice,
// dostęp w zakresie służby) — 403 to „brak tablic”, nie błąd.

export interface BoardTaskItem {
  id: string;
  boardId: string;
  name: string;
  boardName: string;
  // Moduł zakładki „Zadania” (etykietę bierze widżet z uprawnień); null = Projekty.
  moduleKey: string | null;
  due: string | null; // YYYY-MM-DD
  statusTitle: string | null;
  statusColor: string | null;
  done: boolean;
  // Do szybkiego „gotowe” (null = tablica bez etykiety „gotowe”).
  statusColId: string | null;
  doneLabelId: string | null;
}

const compare = (a: BoardTaskItem, b: BoardTaskItem) => {
  if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
  if (a.due && !b.due) return -1;
  if (!a.due && b.due) return 1;
  return a.name.localeCompare(b.name, 'pl');
};

export async function fetchMyBoardTasks(email: string): Promise<BoardTaskItem[]> {
  const [b, c] = await Promise.all([
    supabase.from('boards').select('id, name, module_key, source_kind, is_template').eq('is_archived', false),
    supabase
      .from('board_columns')
      .select('id, board_id, name, type, settings, display_order')
      .in('type', ['people', 'status', 'date', 'timeline']),
  ]);
  if (isForbidden(b.error) || isForbidden(c.error)) return [];
  if (b.error) throw b.error;
  if (c.error) throw c.error;

  const boards = new Map<string, any>(
    ((b.data ?? []) as any[]).filter((x) => !x.is_template).map((x) => [String(x.id), x]),
  );
  const colsByBoard = new Map<string, BoardColumn[]>();
  for (const col of ((c.data ?? []) as any[]).map(toColumn).sort((x, y) => x.display_order - y.display_order)) {
    if (!colsByBoard.has(col.board_id)) colsByBoard.set(col.board_id, []);
    colsByBoard.get(col.board_id)!.push(col);
  }
  // Elementy tylko tablic z kolumną „Osoby” (bez N+1: jedno zapytanie).
  const withPeople = [...colsByBoard.entries()]
    .filter(([id, cols]) => boards.has(id) && cols.some((x) => x.type === 'people'))
    .map(([id]) => id);
  if (!withPeople.length) return [];
  const r = await supabase.from('board_items').select('id, board_id, name, cells, parent_item_id').in('board_id', withPeople);
  if (r.error) {
    if (isForbidden(r.error)) return [];
    throw r.error;
  }

  const out: BoardTaskItem[] = [];
  for (const row of (r.data ?? []) as any[]) {
    const it = toItem(row);
    const board = boards.get(it.board_id);
    if (!board) continue;
    const cols = colsByBoard.get(it.board_id) ?? [];
    if (!isAssigned(it.cells, cols, email)) continue;
    const statusCol = statusColumnOf(cols);
    const status = labelFor(statusCol, statusCol ? it.cells[statusCol.id] : null);
    const doneLabel = doneLabelIn(labelsOf(statusCol));
    out.push({
      id: it.id,
      boardId: it.board_id,
      name: it.name.trim() || 'Bez nazwy',
      boardName: String(board.name ?? '') || 'Tablica',
      moduleKey: taskBoardModuleKey({ module_key: board.module_key ?? null, source_kind: board.source_kind ?? null }),
      due: dueOf(dueColumnOf(cols), it.cells),
      statusTitle: status?.title ?? null,
      statusColor: status?.color ?? null,
      done: isDoneLabel(status),
      statusColId: statusCol?.id ?? null,
      doneLabelId: doneLabel?.id ?? null,
    });
  }
  return out.sort(compare);
}
