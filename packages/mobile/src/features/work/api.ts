import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isDoneLabel } from '@avenit/shared/src/lib/boardStatus.js';
import { boardModuleKey } from '@avenit/shared/src/permissions/moduleScope.js';
import { supabase } from '../../lib/supabase';
import { logBoardActivity, patchBoardItemCells } from '../teams/boardItems';

// „Moje zadania” — elementy tablic (Projekty + zakładki „Zadania” służb i modułów z kreatora),
// w których zalogowany jest przypisany w kolumnie „Osoby”. Jak pulpit weba
// (src/modules/Dashboard/hooks/useMyBoardTasks.js): zakres wierszy wyznacza serwer (prywatne
// tablice, dostęp w zakresie służby), więc bez bramki module:boards. Trzy zapytania bez N+1:
// tablice (bez archiwalnych i szablonów) + potrzebne kolumny, potem elementy TYLKO tych tablic,
// które mają kolumnę „Osoby” — a nie wszystkie elementy wszystkich tablic.

export interface WorkLabel {
  id: string;
  title: string;
  color: string;
  done?: boolean;
}

export interface WorkItem {
  id: string;
  name: string;
  boardId: string;
  boardName: string;
  boardColor: string;
  // Służba tablicy (null = Projekty) — do uprawnień w zakresie służby.
  moduleKey: string | null;
  due: string | null; // YYYY-MM-DD lub ISO
  statusId: string | null;
  statusLabel: string | null;
  statusColor: string | null;
  done: boolean;
  // Do zmiany statusu z telefonu (kolumna typu status tej tablicy).
  statusColumnId: string | null;
  statusLabels: WorkLabel[];
}

interface BoardRow {
  id: string;
  name: string | null;
  color: string | null;
  module_key: string | null;
  source_kind: string | null;
  is_template?: boolean | null;
}
interface ColumnRow {
  id: string;
  board_id: string;
  type: string;
  display_order?: number | null;
  settings: unknown;
}
interface ItemRow {
  id: string;
  board_id: string;
  name: string | null;
  cells: unknown;
  parent_item_id?: string | null;
}

// 403 = brak dostępu do tablic (ani Projektów, ani żadnej służby) — to nie błąd, po prostu pusto.
const isForbidden = (error: unknown) => {
  const e = error as { status?: number; code?: string } | null;
  return !!e && (e.status === 403 || ['403', '42501', '42P01'].includes(String(e.code ?? '')));
};

const asObject = <T,>(v: unknown, fallback: T): T => {
  if (v == null) return fallback;
  if (typeof v === 'string') {
    try {
      return (JSON.parse(v) as T) ?? fallback;
    } catch {
      return fallback;
    }
  }
  return v as T;
};

const lower = (v: unknown) => String(v ?? '').trim().toLowerCase();

const isAssigned = (value: unknown, me: string) =>
  Array.isArray(value) && value.some((p) => lower(typeof p === 'string' ? p : (p as { email?: string } | null)?.email) === me);

export const useMyWork = (userEmail: string | null) =>
  useQuery({
    queryKey: ['my-work', userEmail],
    enabled: !!userEmail,
    queryFn: async (): Promise<WorkItem[]> => {
      const me = lower(userEmail);
      if (!me) return [];
      const [boardsRes, colsRes] = await Promise.all([
        supabase.from('boards').select('id, name, color, module_key, source_kind, is_template').eq('is_archived', false),
        supabase
          .from('board_columns')
          .select('id, board_id, type, settings, display_order')
          .in('type', ['people', 'status', 'priority', 'date', 'timeline'])
          .order('display_order', { ascending: true }),
      ]);
      if (isForbidden(boardsRes.error) || isForbidden(colsRes.error)) return [];
      if (boardsRes.error) throw boardsRes.error;
      if (colsRes.error) throw colsRes.error;

      // Szablony nie są pracą do zrobienia (archiwalne odcina już zapytanie).
      const boards = new Map<string, BoardRow>();
      for (const b of (boardsRes.data ?? []) as unknown as BoardRow[]) {
        if (!b.is_template) boards.set(String(b.id), b);
      }
      const colsByBoard = new Map<string, ColumnRow[]>();
      for (const c of (colsRes.data ?? []) as unknown as ColumnRow[]) {
        const k = String(c.board_id);
        if (!boards.has(k)) continue;
        if (!colsByBoard.has(k)) colsByBoard.set(k, []);
        colsByBoard.get(k)!.push(c);
      }
      const withPeople = [...colsByBoard.entries()].filter(([, cols]) => cols.some((c) => c.type === 'people')).map(([id]) => id);
      if (!withPeople.length) return [];

      const itemsRes = await supabase
        .from('board_items')
        .select('id, board_id, name, cells, parent_item_id')
        .in('board_id', withPeople)
        .is('parent_item_id', null);
      if (itemsRes.error) {
        if (isForbidden(itemsRes.error)) return [];
        throw itemsRes.error;
      }

      const out: WorkItem[] = [];
      for (const it of (itemsRes.data ?? []) as unknown as ItemRow[]) {
        const boardId = String(it.board_id);
        const board = boards.get(boardId);
        if (!board || it.parent_item_id) continue;
        const cols = colsByBoard.get(boardId) ?? [];
        const cells = asObject<Record<string, any>>(it.cells, {});
        // E-mail bez względu na wielkość liter (konta bywają zapisane różnie).
        if (!cols.some((c) => c.type === 'people' && isAssigned(cells[c.id], me))) continue;

        const settingsOf = (c: ColumnRow | undefined) => asObject<{ role?: string; labels?: any[] }>(c?.settings, {});
        // Termin: kolumna daty z rolą „termin”, pierwsza kolumna daty, potem oś czasu (jak serwer).
        const dateCol =
          cols.find((c) => c.type === 'date' && settingsOf(c).role === 'due') ??
          cols.find((c) => c.type === 'date') ??
          cols.find((c) => c.type === 'timeline');
        let due: string | null = null;
        if (dateCol) {
          const v = cells[dateCol.id];
          due = dateCol.type === 'timeline' ? v?.end || v?.start || null : v || null;
        }
        const statusCol = cols.find((c) => c.type === 'status') ?? cols.find((c) => c.type === 'priority');
        const labels: WorkLabel[] = (settingsOf(statusCol).labels ?? []).map((l: any) => ({
          id: String(l?.id),
          title: String(l?.title ?? l?.id),
          color: String(l?.color ?? '#6E685A'),
          ...(typeof l?.done === 'boolean' ? { done: l.done } : {}),
        }));
        const statusVal = statusCol ? cells[statusCol.id] : null;
        const label = statusVal != null ? labels.find((l) => l.id === String(statusVal)) ?? null : null;

        out.push({
          id: String(it.id),
          name: String(it.name ?? ''),
          boardId,
          boardName: board.name || 'Tablica',
          boardColor: board.color || '#6B6557',
          moduleKey: boardModuleKey(board),
          due: typeof due === 'string' ? due : null,
          statusId: statusVal != null ? String(statusVal) : null,
          statusLabel: label?.title ?? null,
          statusColor: label?.color ?? null,
          // Jedna reguła „zrobione” dla webu, serwera i mobilki (flaga etykiety, potem nazwa).
          done: statusCol?.type === 'status' && isDoneLabel(label),
          statusColumnId: statusCol ? String(statusCol.id) : null,
          statusLabels: labels,
        });
      }
      return out;
    },
  });

// Zmiana statusu: tylko komórka statusu (fn board-item-patch scala na serwerze; na starym
// serwerze świeży odczyt + scalenie) i wpis w dzienniku aktywności — jak edycja na webie.
// Optymistycznie: pigułka zmienia się od razu, przy błędzie wraca.
export const useSetWorkStatus = (userEmail: string | null) => {
  const qc = useQueryClient();
  const key = ['my-work', userEmail];
  return useMutation({
    mutationFn: async ({
      item,
      labelId,
      actorName,
    }: {
      item: WorkItem;
      labelId: string;
      actorName?: string | null;
    }) => {
      if (!item.statusColumnId) throw new Error('Ta tablica nie ma kolumny statusu.');
      const { before } = await patchBoardItemCells(item.id, { [item.statusColumnId]: labelId });
      logBoardActivity({
        itemId: item.id,
        boardId: item.boardId,
        action: 'status_changed',
        columnId: item.statusColumnId,
        from: before ? before[item.statusColumnId] ?? null : item.statusId ?? null,
        to: labelId,
        actorEmail: userEmail,
        actorName: actorName ?? null,
      });
    },
    onMutate: async ({ item, labelId }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<WorkItem[]>(key);
      const label = (item.statusLabels ?? []).find((l) => l.id === labelId) ?? null;
      qc.setQueryData<WorkItem[]>(key, (list) =>
        (list ?? []).map((w) =>
          w.id === item.id
            ? {
                ...w,
                statusId: labelId,
                statusLabel: label?.title ?? null,
                statusColor: label?.color ?? null,
                done: isDoneLabel(label),
              }
            : w,
        ),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ['team', 'board'] });
    },
  });
};
