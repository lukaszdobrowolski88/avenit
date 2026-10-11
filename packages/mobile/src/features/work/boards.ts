import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { logBoardActivity, patchBoardItemCells } from '../teams/boardItems';
import {
  boardColor,
  dueColumnOf,
  isForbidden,
  isNotFound,
  peopleColumnsOf,
  statusColumnOf,
  toBoard,
  toColumn,
  toGroup,
  toItem,
  type BoardColumn,
  type BoardGroup,
  type BoardInfo,
  type BoardItem,
} from '../tasks/board';

// Projekty (Work OS) na telefonie: lista tablic i jedna tablica w widoku „Tabela” / „Kanban”.
// Odczyt jak web (src/modules/Boards/hooks/useBoards.js + useBoardData.js); zakres wierszy
// wyznacza serwer (prywatne tablice, dostęp w zakresie służby — moduleScope.js), więc 403/404
// to normalny stan ekranu. Zapis zmiany statusu — fn board-item-patch (patchBoardItemCells)
// + wpis w dzienniku, jak „Moje zadania” i ekran zadania.

export interface ProjectBoard {
  id: string;
  name: string;
  description: string | null;
  color: string;
  folder: string | null;
  isPrivate: boolean;
}

export interface BoardFolder {
  folder: string | null;
  boards: ProjectBoard[];
}

export type WorkBoardView = 'table' | 'kanban';

export interface WorkBoard {
  board: BoardInfo & { color: string; description: string | null };
  columns: BoardColumn[];
  groups: BoardGroup[];
  // Tylko elementy główne (bez podzadań), w kolejności z tablicy.
  items: BoardItem[];
  // Liczba podzadań elementu (id → n).
  subCount: Record<string, number>;
  // Widok zapisany jako pierwszy na webie (kanban/tabela) i kolumna grupująca kanbanu.
  defaultView: WorkBoardView;
  kanbanColumnId: string | null;
}

export type WorkBoardResult = ({ state: 'ok' } & WorkBoard) | { state: 'forbidden' } | { state: 'missing' };

const lower = (v: unknown) => String(v ?? '').trim().toLowerCase();

// Prywatna tablica: właściciel (awaryjnie twórca) i edytorzy — reguła jak web (lib/boardList.js)
// i serwer (dataapi/boardsScope.js). Serwer i tak zawęża; tu tylko spójność z webem.
const canSeeBoard = (b: any, email: string | null): boolean => {
  if (b?.visibility !== 'private') return true;
  const me = lower(email);
  if (!me) return false;
  if (lower(b.owner_email || b.created_by) === me) return true;
  return Array.isArray(b.editors) && b.editors.some((e: unknown) => lower(e) === me);
};

// Lista tablic Projektów (bez tablic służb, szablonów i archiwum), pogrupowana po folderach:
// najpierw foldery alfabetycznie, na końcu tablice bez folderu (jak web groupByFolder).
export const useProjectBoards = (email: string | null) =>
  useQuery({
    queryKey: ['work', 'boards', email],
    enabled: !!email,
    queryFn: async (): Promise<BoardFolder[]> => {
      // select('*') jak web — kolumny tablic różnią się między tenantami (folder, visibility…).
      const { data, error } = await supabase
        .from('boards')
        .select('*')
        .eq('is_template', false)
        .is('module_key', null)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) {
        if (isForbidden(error)) return [];
        throw error;
      }
      const list: ProjectBoard[] = ((data ?? []) as any[])
        .filter((b) => b && !b.is_template && !b.is_archived && !b.module_key && canSeeBoard(b, email))
        .map((b) => ({
          id: String(b.id),
          name: String(b.name || 'Tablica'),
          description: typeof b.description === 'string' && b.description.trim() ? b.description.trim() : null,
          color: boardColor(b.color),
          folder: typeof b.folder === 'string' && b.folder.trim() ? b.folder.trim() : null,
          isPrivate: b.visibility === 'private',
        }));
      const folders = [...new Set(list.map((b) => b.folder).filter((f): f is string => !!f))].sort((a, b) =>
        a.localeCompare(b, 'pl'),
      );
      return [
        ...folders.map((f) => ({ folder: f, boards: list.filter((b) => b.folder === f) })),
        { folder: null, boards: list.filter((b) => !b.folder) },
      ].filter((g) => g.boards.length > 0);
    },
  });

export const workBoardKey = (boardId: string) => ['work', 'board', boardId] as const;

const asObject = (v: unknown): Record<string, any> => {
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

// Kolumny, po których kanban grupuje na telefonie (etykiety — zmiana stuknięciem w pigułkę).
export const isLabelColumn = (c: BoardColumn | null | undefined) => !!c && (c.type === 'status' || c.type === 'priority');

const fetchWorkBoard = async (boardId: string): Promise<WorkBoardResult> => {
  const [b, c, g, i, v] = await Promise.all([
    supabase.from('boards').select('*').eq('id', boardId).maybeSingle(),
    supabase.from('board_columns').select('*').eq('board_id', boardId).order('display_order'),
    supabase.from('board_groups').select('*').eq('board_id', boardId).order('display_order'),
    supabase.from('board_items').select('*').eq('board_id', boardId).order('display_order'),
    supabase.from('board_views').select('*').eq('board_id', boardId).order('display_order'),
  ]);
  if (b.error) {
    if (isForbidden(b.error)) return { state: 'forbidden' };
    if (isNotFound(b.error)) return { state: 'missing' };
    throw b.error;
  }
  if (!b.data) return { state: 'missing' };
  const partErr = c.error || g.error || i.error;
  if (partErr) {
    if (isForbidden(partErr)) return { state: 'forbidden' };
    throw partErr;
  }
  const raw = b.data as any;
  const columns = ((c.data ?? []) as any[]).map(toColumn).sort((x, y) => x.display_order - y.display_order);
  const groups = ((g.data ?? []) as any[]).map(toGroup).sort((x, y) => x.display_order - y.display_order);
  const all = ((i.data ?? []) as any[]).map(toItem);
  const subCount: Record<string, number> = {};
  for (const it of all) if (it.parent_item_id) subCount[it.parent_item_id] = (subCount[it.parent_item_id] ?? 0) + 1;

  // Widoki weba: pierwszy zapisany widok wyznacza start (tabela/kanban); kanban pamięta kolumnę
  // grupującą (config.kanbanGroupBy) — gdy usunięta albo nie-etykietowa, bierzemy Status/Priorytet.
  const views = v.error ? [] : ((v.data ?? []) as any[]);
  const first = views[0];
  const kanbanView = views.find((x) => x?.type === 'kanban');
  const savedGroupBy = String(asObject(kanbanView?.config).kanbanGroupBy ?? '');
  const kanbanCol =
    columns.find((col) => col.id === savedGroupBy && isLabelColumn(col)) ??
    columns.find((col) => col.type === 'status') ??
    columns.find((col) => col.type === 'priority') ??
    null;

  return {
    state: 'ok',
    board: {
      ...toBoard(raw),
      color: boardColor(raw.color),
      description: typeof raw.description === 'string' && raw.description.trim() ? raw.description.trim() : null,
    },
    columns,
    groups,
    items: all.filter((it) => !it.parent_item_id),
    subCount,
    defaultView: first?.type === 'kanban' ? 'kanban' : 'table',
    kanbanColumnId: kanbanCol?.id ?? null,
  };
};

export const useWorkBoard = (boardId: string | null) =>
  useQuery({
    queryKey: workBoardKey(boardId ?? ''),
    enabled: !!boardId,
    queryFn: (): Promise<WorkBoardResult> => fetchWorkBoard(boardId!),
  });

// Na żywo: zmiany elementów, grup i kolumn tej tablicy (np. ktoś przestawił status na webie).
// Realtime ignoruje filtry — odsiewamy po board_id.
export const useWorkBoardRealtime = (boardId: string | null) => {
  const qc = useQueryClient();
  useEffect(() => {
    if (!boardId) return;
    const channelName = `work-board:${boardId}`;
    for (const ch of supabase.getChannels()) {
      if (ch.topic === `realtime:${channelName}`) supabase.removeChannel(ch);
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Seria zmian (np. przeniesienie wielu elementów) = jedno odświeżenie.
    const kick = (p: { new: any; old: any }) => {
      if (String(p.new?.board_id ?? p.old?.board_id ?? '') !== boardId) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => qc.invalidateQueries({ queryKey: workBoardKey(boardId) }), 400);
    };
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'board_items' }, kick)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'board_groups' }, kick)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'board_columns' }, kick)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [boardId, qc]);
};

// Zmiana etykiety (Status/Priorytet) elementu: tylko ta komórka (serwer scala pod blokadą
// wiersza), wpis w dzienniku. Optymistycznie — pigułka i kolumna kanbanu zmieniają się od razu,
// przy błędzie wracają.
export const useSetBoardLabel = (boardId: string, actor: { email: string | null; name: string | null }) => {
  const qc = useQueryClient();
  const key = workBoardKey(boardId);
  return useMutation({
    mutationFn: async ({ item, column, labelId }: { item: BoardItem; column: BoardColumn; labelId: string | null }) => {
      const { before } = await patchBoardItemCells(item.id, { [column.id]: labelId });
      logBoardActivity({
        itemId: item.id,
        boardId,
        action: 'status_changed',
        columnId: column.id,
        from: before ? before[column.id] ?? null : item.cells[column.id] ?? null,
        to: labelId,
        actorEmail: actor.email,
        actorName: actor.name,
      });
    },
    onMutate: async ({ item, column, labelId }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<WorkBoardResult>(key);
      qc.setQueryData<WorkBoardResult>(key, (d: WorkBoardResult | undefined) => {
        if (!d || d.state !== 'ok') return d;
        return {
          ...d,
          items: d.items.map((it: BoardItem) => {
            if (it.id !== item.id) return it;
            const cells = { ...it.cells };
            if (labelId == null) delete cells[column.id];
            else cells[column.id] = labelId;
            return { ...it, cells };
          }),
        };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: key });
      // Te same zadania widać w „Moich zadaniach”, na pulpicie, w Kalendarzu i na ekranie zadania.
      qc.invalidateQueries({ queryKey: ['my-work'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['agenda-tasks'] });
      qc.invalidateQueries({ queryKey: ['team', 'board'] });
      if (vars) qc.invalidateQueries({ queryKey: ['task', vars.item.id] });
    },
  });
};

// Kolumny, które pokazuje karta elementu na telefonie: Status, Priorytet, Osoby (pierwsza), termin.
export interface BoardMeta {
  status: BoardColumn | null;
  priority: BoardColumn | null;
  people: BoardColumn | null;
  due: BoardColumn | null;
}

export const boardMeta = (columns: BoardColumn[]): BoardMeta => ({
  status: statusColumnOf(columns),
  priority: columns.find((c) => c.type === 'priority') ?? null,
  people: peopleColumnsOf(columns)[0] ?? null,
  due: dueColumnOf(columns),
});
