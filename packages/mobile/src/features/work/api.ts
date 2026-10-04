import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

// „Moja praca" — elementy ze WSZYSTKICH tablic (Boards), gdzie zalogowany jest
// przypisany w kolumnie typu `people`. Odwzorowanie web src/modules/Boards/hooks/useMyWork.js.
// Członek ma granty boards/board_columns/board_items:read, więc to agregacja po stronie klienta.

export interface WorkItem {
  id: string;
  name: string;
  boardId: string;
  boardName: string;
  boardColor: string;
  due: string | null; // YYYY-MM-DD lub ISO
  statusLabel: string | null;
  statusColor: string | null;
  done: boolean;
  // Do zmiany statusu z telefonu (kolumna typu status tej tablicy).
  statusColumnId: string | null;
  statusLabels: { id: string; title: string; color: string }[];
  cells: Record<string, any>;
}

interface BoardRow {
  id: string;
  name: string;
  color: string | null;
}
interface ColumnRow {
  id: string;
  board_id: string;
  type: string;
  name: string;
  settings: { labels?: { id: string; title: string; color?: string }[] } | null;
}
interface ItemRow {
  id: string;
  board_id: string;
  group_id: string | null;
  name: string;
  cells: Record<string, any> | null;
}

const SWALLOW = new Set(['403', '42501', '42P01']);

export const useMyWork = (userEmail: string | null) =>
  useQuery({
    queryKey: ['my-work', userEmail],
    enabled: !!userEmail,
    queryFn: async (): Promise<WorkItem[]> => {
      const [boardsRes, colsRes, itemsRes] = await Promise.all([
        supabase.from('boards').select('id, name, color').eq('is_archived', false),
        supabase.from('board_columns').select('id, board_id, type, name, settings'),
        supabase
          .from('board_items')
          .select('id, board_id, group_id, name, cells')
          .is('parent_item_id', null),
      ]);
      // Brak dostępu/tabeli → pusto (moduł Boards może być wyłączony dla tenanta).
      for (const r of [boardsRes, colsRes, itemsRes]) {
        if (r.error) {
          const code = (r.error as { code?: string }).code;
          if (code && SWALLOW.has(code)) return [];
          throw r.error;
        }
      }

      const boards = new Map<string, BoardRow>(
        ((boardsRes.data ?? []) as unknown as BoardRow[]).map((b) => [b.id, b]),
      );
      const colsByBoard = new Map<string, ColumnRow[]>();
      for (const c of (colsRes.data ?? []) as unknown as ColumnRow[]) {
        if (!colsByBoard.has(c.board_id)) colsByBoard.set(c.board_id, []);
        colsByBoard.get(c.board_id)!.push(c);
      }

      const out: WorkItem[] = [];
      for (const it of (itemsRes.data ?? []) as unknown as ItemRow[]) {
        const cols = colsByBoard.get(it.board_id) ?? [];
        const cells = it.cells ?? {};
        const peopleCols = cols.filter((c) => c.type === 'people');
        const assigned = peopleCols.some((c) => {
          const v = cells[c.id];
          return Array.isArray(v) && v.some((p: any) => p?.email === userEmail);
        });
        if (!assigned) continue;

        const dateCol = cols.find((c) => c.type === 'date') ?? cols.find((c) => c.type === 'timeline');
        let due: string | null = null;
        if (dateCol) {
          const v = cells[dateCol.id];
          due = dateCol.type === 'timeline' ? (v?.end || v?.start || null) : (v || null);
        }
        const statusCol = cols.find((c) => c.type === 'status') ?? cols.find((c) => c.type === 'priority');
        const statusVal = statusCol ? cells[statusCol.id] : null;
        const label = statusCol
          ? (statusCol.settings?.labels ?? []).find((l) => l.id === statusVal) ?? null
          : null;
        const board = boards.get(it.board_id);

        out.push({
          id: it.id,
          name: it.name,
          boardId: it.board_id,
          boardName: board?.name ?? 'Tablica',
          boardColor: board?.color ?? '#6366f1',
          due: typeof due === 'string' ? due : null,
          statusLabel: label?.title ?? null,
          statusColor: label?.color ?? null,
          done: !!label && /gotow|done|zrobion|ukończ|zakończ/i.test(label.title),
          statusColumnId: statusCol?.id ?? null,
          statusLabels: (statusCol?.settings?.labels ?? []).map((l) => ({
            id: String(l.id),
            title: String(l.title ?? l.id),
            color: String(l.color ?? '#a8a29e'),
          })),
          cells,
        });
      }
      return out;
    },
  });

// Zmiana statusu elementu (jak edycja komórki w Boards: board_items.cells[kolumna] = id etykiety).
// Członek ma res:board_items:update (preset), więc działa także dla zwykłych osób.
export const useSetWorkStatus = (userEmail: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ item, labelId }: { item: WorkItem; labelId: string }) => {
      if (!item.statusColumnId) throw new Error('Ta tablica nie ma kolumny statusu.');
      const { error } = await (supabase.from('board_items') as any)
        .update({ cells: { ...item.cells, [item.statusColumnId]: labelId } })
        .eq('id', item.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-work', userEmail] }),
  });
};
