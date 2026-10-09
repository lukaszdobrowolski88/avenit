import { useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { taskItemLink } from '@avenit/shared/src/lib/taskLinks.js';
import { supabase } from '../../lib/supabase';
import { usePermissions } from '../../lib/permissions';
import { isMissingFn, logBoardActivity, patchBoardItemCells } from '../teams/boardItems';
import {
  isForbidden,
  isNotFound,
  toActivity,
  toBoard,
  toColumn,
  toGroup,
  toItem,
  toUpdate,
  type BoardColumn,
  type BoardGroup,
  type BoardInfo,
  type BoardItem,
  type Person,
  type TaskActivity,
  type TaskUpdate,
} from './board';

// Dane ekranu zadania (element tablicy board_*): element + tablica + kolumny + grupy, komentarze,
// dziennik, katalog osób i zapisy. Zakres wierszy wyznacza serwer (/api/db: prywatne tablice,
// dostęp „w zakresie służby” — moduleScope.js), więc 403/404 to normalny stan ekranu, nie awaria.
//
// Zapisy idą przez funkcje serwera (board-item-patch, board-comment). Na starszym serwerze (404
// samej funkcji) — zapis zapasowy jak web przed zmianą: świeże komórki → scalenie → zapis całości.

export interface TaskSubitem {
  id: string;
  name: string;
  cells: Record<string, unknown>;
}

export type TaskDetail =
  | {
      state: 'ok';
      item: BoardItem;
      board: BoardInfo;
      columns: BoardColumn[];
      groups: BoardGroup[];
      parent: { id: string; name: string } | null;
      subitems: TaskSubitem[];
    }
  | { state: 'forbidden' }
  | { state: 'missing' };

export const taskKey = (itemId: string) => ['task', itemId] as const;

interface BoardParts {
  board: BoardInfo | null;
  columns: BoardColumn[];
  groups: BoardGroup[];
  error: any;
}

// Tablica + kolumny + grupy. Nie rzuca — błąd zwraca w `error` (odczyt „na zapas” po boardId
// z linku może się nie przydać i nie powinien zostawić nieobsłużonej obietnicy).
const loadBoardParts = async (boardId: string): Promise<BoardParts> => {
  try {
    const [b, c, g] = await Promise.all([
      supabase.from('boards').select('*').eq('id', boardId).maybeSingle(),
      supabase.from('board_columns').select('*').eq('board_id', boardId).order('display_order'),
      supabase.from('board_groups').select('id, name, color, display_order').eq('board_id', boardId).order('display_order'),
    ]);
    if (b.error) return { board: null, columns: [], groups: [], error: b.error };
    return {
      board: b.data ? toBoard(b.data) : null,
      columns: c.error ? [] : ((c.data ?? []) as any[]).map(toColumn).sort((x, y) => x.display_order - y.display_order),
      groups: g.error ? [] : ((g.data ?? []) as any[]).map(toGroup).sort((x, y) => x.display_order - y.display_order),
      error: c.error && !isForbidden(c.error) ? c.error : null,
    };
  } catch (e) {
    return { board: null, columns: [], groups: [], error: e };
  }
};

const fetchTaskDetail = async (itemId: string, boardIdHint: string | null): Promise<TaskDetail> => {
  // Tablica z linku — równolegle z elementem (zwykle się zgadza, oszczędza jedno okrążenie).
  const hinted = boardIdHint ? loadBoardParts(boardIdHint) : null;
  const [itemRes, subsRes] = await Promise.all([
    supabase.from('board_items').select('*').eq('id', itemId).maybeSingle(),
    supabase.from('board_items').select('id, name, cells, display_order').eq('parent_item_id', itemId).order('display_order'),
  ]);
  if (itemRes.error) {
    if (isForbidden(itemRes.error)) return { state: 'forbidden' };
    if (isNotFound(itemRes.error)) return { state: 'missing' };
    throw itemRes.error;
  }
  if (!itemRes.data) return { state: 'missing' };
  const item = toItem(itemRes.data);

  const parts = hinted && boardIdHint === item.board_id ? await hinted : await loadBoardParts(item.board_id);
  if (parts.error) {
    if (isForbidden(parts.error)) return { state: 'forbidden' };
    throw parts.error;
  }
  if (!parts.board) return { state: 'forbidden' };

  let parent: { id: string; name: string } | null = null;
  if (item.parent_item_id) {
    const { data } = await supabase.from('board_items').select('id, name').eq('id', item.parent_item_id).maybeSingle();
    if (data) parent = { id: String((data as any).id), name: String((data as any).name ?? '') };
  }
  const subitems: TaskSubitem[] = subsRes.error
    ? []
    : ((subsRes.data ?? []) as any[]).map((r) => {
        const it = toItem(r);
        return { id: it.id, name: it.name, cells: it.cells };
      });

  return { state: 'ok', item, board: parts.board, columns: parts.columns, groups: parts.groups, parent, subitems };
};

export const useTaskDetail = (itemId: string | null, boardIdHint: string | null) =>
  useQuery({
    queryKey: taskKey(itemId ?? ''),
    enabled: !!itemId,
    queryFn: (): Promise<TaskDetail> => fetchTaskDetail(itemId!, boardIdHint),
  });

export const useTaskUpdates = (itemId: string | null, enabled = true) =>
  useQuery({
    queryKey: ['task', itemId ?? '', 'updates'],
    enabled: !!itemId && enabled,
    queryFn: async (): Promise<TaskUpdate[]> => {
      const { data, error } = await supabase
        .from('board_item_updates')
        .select('*')
        .eq('item_id', itemId)
        .order('created_at', { ascending: true });
      if (error) {
        if (isForbidden(error)) return [];
        throw error;
      }
      return ((data ?? []) as any[]).map(toUpdate);
    },
  });

export const useTaskActivity = (itemId: string | null, enabled = true) =>
  useQuery({
    queryKey: ['task', itemId ?? '', 'activity'],
    enabled: !!itemId && enabled,
    queryFn: async (): Promise<TaskActivity[]> => {
      const { data, error } = await supabase
        .from('board_item_activity')
        .select('*')
        .eq('item_id', itemId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) {
        if (isForbidden(error)) return [];
        throw error;
      }
      return ((data ?? []) as any[]).map(toActivity);
    },
  });

// Katalog osób do kolumny „Osoby” i @wzmianek (app_users czyta każdy zalogowany) — jak web.
export const useTaskPeople = (enabled = true) =>
  useQuery({
    queryKey: ['task-people'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Person[]> => {
      const { data, error } = await supabase.from('app_users').select('email, full_name, name, avatar_url, is_active, status');
      if (error) {
        if (isForbidden(error)) return [];
        throw error;
      }
      return ((data ?? []) as any[])
        .filter((u) => u.email && u.is_active !== false && (u.status ?? 'active') === 'active')
        .map((u) => ({
          email: String(u.email),
          name: String(u.full_name || u.name || String(u.email).split('@')[0]).trim(),
          avatar_url: u.avatar_url ? String(u.avatar_url) : null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pl'));
    },
  });

// Ścieżki modułów z app_modules (do linku zadania na webie) — z my-permissions.
export const useModulePaths = (): Record<string, string> => {
  const { modules } = usePermissions();
  return useMemo(() => {
    const out: Record<string, string> = {};
    for (const m of modules) if (m.path) out[m.key] = m.path;
    return out;
  }, [modules]);
};

export const taskWebPath = (board: BoardInfo, itemId: string, paths: Record<string, string>): string =>
  taskItemLink(board, itemId, paths);

// ── Zapisy ─────────────────────────────────────────────────────────────────

export interface TaskPatch {
  cells?: Record<string, unknown | null>; // null = usuń wartość
  name?: string;
  description?: string | null;
  group_id?: string;
}

export interface Actor {
  email: string | null;
  name: string | null;
}

// Zapis elementu — jedna implementacja z zakładkami „Zadania” i „Moją pracą”
// (features/teams/boardItems.ts):
//   • komórki (status, osoby, termin): patchBoardItemCells — fn board-item-patch, a na starym
//     serwerze świeży odczyt + scalenie + zapis;
//   • nazwa / opis / grupa: ta sama fn board-item-patch, a bez niej — zwykły zapis tych pól;
//   • dziennik board_item_activity jak web (useBoardData) — w tle, błąd nie cofa zmiany.
export async function patchBoardItem(input: {
  item: BoardItem;
  columns: BoardColumn[];
  patch: TaskPatch;
  actor: Actor;
}): Promise<BoardItem | null> {
  const { item, columns, patch, actor } = input;
  let saved: BoardItem | null = null;
  let before: Record<string, unknown> | null = null;

  const fields: Record<string, unknown> = {};
  if (patch.name !== undefined) fields.name = patch.name;
  if (patch.description !== undefined) fields.description = patch.description;
  if (patch.group_id !== undefined) fields.group_id = patch.group_id;

  if (Object.keys(fields).length) {
    const { data, error } = await supabase.functions.invoke('board-item-patch', {
      body: { item_id: item.id, ...fields, ...(patch.cells ? { cells: patch.cells } : {}) },
    });
    if (!error) {
      saved = (data as any)?.item ? toItem((data as any).item) : null;
    } else if (!isMissingFn(error as any)) {
      throw error;
    } else {
      // Stary serwer: komórki osobno (scalenie po świeżym odczycie), pola — zwykły zapis.
      if (patch.cells) before = (await patchBoardItemCells(item.id, patch.cells)).before;
      const { data: row, error: saveErr } = await (supabase.from('board_items') as any)
        .update(fields)
        .eq('id', item.id)
        .select()
        .maybeSingle();
      if (saveErr) throw saveErr;
      saved = row ? toItem(row) : null;
    }
  } else if (patch.cells) {
    const r = await patchBoardItemCells(item.id, patch.cells);
    before = r.before;
    // Odpowiedź bez komórek — zostaje widok optymistyczny do odświeżenia.
    saved = Object.keys(r.cells).length ? { ...item, cells: r.cells } : null;
  }

  const log = { itemId: item.id, boardId: item.board_id, actorEmail: actor.email, actorName: actor.name };
  for (const [colId, v] of Object.entries(patch.cells ?? {})) {
    const col = columns.find((c) => c.id === colId);
    const action =
      col && (col.type === 'status' || col.type === 'priority') ? 'status_changed' : col?.type === 'people' ? 'assigned' : 'value_changed';
    const from = before ? before[colId] ?? null : item.cells[colId] ?? null;
    logBoardActivity({ ...log, action, columnId: colId, from, to: v });
  }
  if (patch.group_id !== undefined && patch.group_id !== item.group_id) {
    logBoardActivity({ ...log, action: 'moved', columnId: null, from: null, to: { group_id: patch.group_id } });
  }
  return saved;
}

// Scalenie zmiany w lokalny element (widok optymistyczny).
const applyPatch = (item: BoardItem, patch: TaskPatch): BoardItem => {
  const cells = { ...item.cells };
  for (const [k, v] of Object.entries(patch.cells ?? {})) {
    if (v === null) delete cells[k];
    else cells[k] = v;
  }
  return {
    ...item,
    cells,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.group_id !== undefined ? { group_id: patch.group_id } : {}),
  };
};

// Listy zadań w innych miejscach apki, które pokazują ten element.
const invalidateTaskLists = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['dashboard'] });
  qc.invalidateQueries({ queryKey: ['agenda-tasks'] });
  qc.invalidateQueries({ queryKey: ['my-work'] });
  qc.invalidateQueries({ queryKey: ['team', 'board'] });
};

export const useTaskPatch = (itemId: string, actor: Actor) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ item, columns, patch }: { item: BoardItem; columns: BoardColumn[]; patch: TaskPatch }) =>
      patchBoardItem({ item, columns, patch, actor }),
    onMutate: async ({ patch }) => {
      await qc.cancelQueries({ queryKey: taskKey(itemId) });
      const prev = qc.getQueryData<TaskDetail>(taskKey(itemId));
      if (prev?.state === 'ok') {
        const next: TaskDetail = { ...prev, item: applyPatch(prev.item, patch) };
        qc.setQueryData(taskKey(itemId), next);
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(taskKey(itemId), ctx.prev);
    },
    onSuccess: (saved) => {
      const cur = qc.getQueryData<TaskDetail>(taskKey(itemId));
      if (saved && cur?.state === 'ok') {
        const next: TaskDetail = { ...cur, item: saved };
        qc.setQueryData(taskKey(itemId), next);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: taskKey(itemId) });
      invalidateTaskLists(qc);
    },
  });
};

// Komentarz: fn board-comment (serwer zapisuje i powiadamia @wzmiankowanych), a bez niej —
// wpis w board_item_updates + powiadomienia „mention” od klienta (jak web przed zmianą).
export async function addTaskComment(input: {
  item: BoardItem;
  board: BoardInfo;
  body: string;
  mentions: string[];
  parentId: string | null;
  actor: Actor;
  paths: Record<string, string>;
}): Promise<void> {
  const { item, board, body, mentions, parentId, actor, paths } = input;
  const { error } = await supabase.functions.invoke('board-comment', {
    body: { item_id: item.id, body, ...(parentId ? { parent_id: parentId } : {}), mentions },
  });
  if (!error) return;
  if (!isMissingFn(error as any)) throw error;

  const { error: insErr } = await (supabase.from('board_item_updates') as any)
    .insert({
      item_id: item.id,
      board_id: item.board_id,
      parent_update_id: parentId,
      author_email: actor.email,
      author_name: actor.name,
      body,
      mentions,
      likes: [],
    })
    .select()
    .single();
  if (insErr) throw insErr;
  const link = taskItemLink(board, item.id, paths);
  for (const email of mentions) {
    if (actor.email && email.toLowerCase() === actor.email.toLowerCase()) continue;
    (supabase.from('notifications') as any)
      .insert({
        user_email: email,
        type: 'mention',
        title: `${actor.name || actor.email || 'Ktoś'} wspomniał(a) o Tobie`,
        body: body.slice(0, 140),
        link,
        data: { item_id: item.id, board_id: item.board_id },
      })
      .then(
        () => undefined,
        () => undefined,
      );
  }
}

export const useAddComment = (itemId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: addTaskComment,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['task', itemId, 'updates'] });
      qc.invalidateQueries({ queryKey: ['task', itemId, 'activity'] });
    },
  });
};

export const useToggleLike = (itemId: string, myEmail: string | null) => {
  const qc = useQueryClient();
  const key = ['task', itemId, 'updates'];
  return useMutation({
    mutationFn: async (u: TaskUpdate) => {
      if (!myEmail) throw new Error('Brak zalogowanego konta');
      const liked = u.likes.some((e) => e.toLowerCase() === myEmail.toLowerCase());
      const next = liked ? u.likes.filter((e) => e.toLowerCase() !== myEmail.toLowerCase()) : [...u.likes, myEmail];
      const { error } = await (supabase.from('board_item_updates') as any).update({ likes: next }).eq('id', u.id);
      if (error) throw error;
      return next;
    },
    onMutate: async (u) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<TaskUpdate[]>(key);
      if (prev && myEmail) {
        const liked = u.likes.some((e) => e.toLowerCase() === myEmail.toLowerCase());
        const next = liked ? u.likes.filter((e) => e.toLowerCase() !== myEmail.toLowerCase()) : [...u.likes, myEmail];
        qc.setQueryData<TaskUpdate[]>(key, prev.map((x) => (x.id === u.id ? { ...x, likes: next } : x)));
      }
      return { prev };
    },
    onError: (_e, _u, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
};

export const useDeleteComment = (itemId: string) => {
  const qc = useQueryClient();
  const key = ['task', itemId, 'updates'];
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from('board_item_updates') as any).delete().eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<TaskUpdate[]>(key);
      if (prev) qc.setQueryData<TaskUpdate[]>(key, prev.filter((u) => u.id !== id && u.parent_update_id !== id));
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
};

// Na żywo: komentarze, dziennik i sam element. Realtime ignoruje filtry — odsiewamy po item_id.
export const useTaskRealtime = (itemId: string | null) => {
  const qc = useQueryClient();
  useEffect(() => {
    if (!itemId) return;
    const channelName = `task:${itemId}`;
    // Kanał-widmo po szybkim powrocie na ten sam ekran — sprzątamy przed nową subskrypcją.
    for (const c of supabase.getChannels()) {
      if (c.topic === `realtime:${channelName}`) supabase.removeChannel(c);
    }
    const mine = (p: { new: any; old: any }) =>
      String(p.new?.item_id ?? p.old?.item_id ?? '') === itemId;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'board_item_updates' }, (p) => {
        const known = qc.getQueryData<TaskUpdate[]>(['task', itemId, 'updates']) ?? [];
        // DELETE niesie czasem samo id — wtedy sprawdzamy, czy to nasz wpis.
        if (mine(p) || (p.eventType === 'DELETE' && known.some((u) => u.id === String(p.old?.id ?? '')))) {
          qc.invalidateQueries({ queryKey: ['task', itemId, 'updates'] });
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'board_item_activity' }, (p) => {
        if (mine(p)) qc.invalidateQueries({ queryKey: ['task', itemId, 'activity'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'board_items' }, (p) => {
        const id = String(p.new?.id ?? p.old?.id ?? '');
        const parent = String(p.new?.parent_item_id ?? p.old?.parent_item_id ?? '');
        if (id === itemId || parent === itemId) qc.invalidateQueries({ queryKey: taskKey(itemId) });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [itemId, qc]);
};
