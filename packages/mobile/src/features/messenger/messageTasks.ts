import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  conversationModuleKey,
  messageLinkPath,
  messageTaskDescription,
  savedMessageRows,
  tasksByMessage,
  type MessageTaskRow,
} from '@avenit/shared/src/lib/messageTasks.js';
import { sliceResource } from '@avenit/shared/src/permissions/moduleScope.js';
import { isDoneLabel } from '@avenit/shared/src/lib/boardStatus.js';
import { supabase, tenantWebBase } from '../../lib/supabase';
import { ensureTasksBoardId, logBoardActivity } from '../teams/boardItems';
import { eventTasksModule, eventTasksSource } from '../calendar/event-tasks';
import { CALENDAR_TASKS_SOURCE } from '../calendar/tasks';
import { statusColumnOf, toColumn, type BoardColumn } from '../tasks/board';
import type { MessageRow } from './api';

// „Utwórz zadanie” z wiadomości i „Zapisane” (migracja 114) — jak web (Komunikator/messageTasks/api.js).
// Zakres wierszy pilnuje serwer (/api/db): zadania tylko z tablic, które widzę, powiązanie z wiadomością
// tylko z moich rozmów, zapisane — tylko moje i tylko z rozmów, w których jestem.

export type { MessageTaskRow };

const CHUNK = 150;
const chunks = <T,>(list: T[], n = CHUNK): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
};

// ── Wskaźnik „Zadanie: …” przy wiadomościach ────────────────────────────────
// Brak dostępu do zadań (403) albo stary serwer bez kolumny — null (wątek przestaje pytać).
export async function loadMessageTasks(messageIds: string[]): Promise<Map<string, MessageTaskRow[]> | null> {
  const ids = Array.from(new Set(messageIds.filter(Boolean).map(String)));
  if (!ids.length) return new Map();
  const items: any[] = [];
  for (const part of chunks(ids)) {
    const r = await supabase
      .from('board_items')
      .select('id, board_id, name, cells, source_message_id, created_at')
      .in('source_message_id', part);
    if (r.error) return null;
    items.push(...((r.data ?? []) as any[]));
  }
  if (!items.length) return new Map();
  const boardIds = Array.from(new Set(items.map((i) => String(i.board_id))));
  const [b, c] = await Promise.all([
    supabase.from('boards').select('id, name, module_key, source_kind, is_template').in('id', boardIds),
    supabase.from('board_columns').select('id, board_id, type, settings, display_order').in('board_id', boardIds).eq('type', 'status'),
  ]);
  return tasksByMessage(items, (b.data ?? []) as any[], (c.data ?? []) as any[]);
}

// Zadania widocznych wiadomości — pytamy tylko o nowe id (doczytanie starszych, nowa wiadomość).
export function useMessageTasks(messages: MessageRow[], enabled = true) {
  const [byMessage, setByMessage] = useState<Map<string, MessageTaskRow[]>>(() => new Map());
  const asked = useRef<Set<string>>(new Set());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const ids = useMemo(
    () =>
      messages
        .filter((m) => m?.id && !m.deleted_at && m.message_type !== 'system' && m.message_type !== 'call' && !String(m.id).startsWith('temp'))
        .map((m) => String(m.id)),
    [messages],
  );
  // Brak dostępu do zadań — nie pytamy przy każdej nowej wiadomości.
  const off = useRef(false);
  useEffect(() => {
    if (!enabled || off.current) return;
    const fresh = ids.filter((id) => !asked.current.has(id));
    if (!fresh.length) return;
    fresh.forEach((id) => asked.current.add(id));
    loadMessageTasks(fresh).then(
      (map) => {
        if (map === null) {
          off.current = true;
          return;
        }
        if (!mounted.current || !map.size) return;
        setByMessage((prev) => {
          const next = new Map(prev);
          map.forEach((v, k) => next.set(k, v));
          return next;
        });
      },
      () => fresh.forEach((id) => asked.current.delete(id)),
    );
  }, [ids, enabled]);

  const addLocal = useCallback((messageId: string, task: MessageTaskRow) => {
    setByMessage((prev) => {
      const next = new Map(prev);
      next.set(String(messageId), [...(next.get(String(messageId)) ?? []), task]);
      return next;
    });
  }, []);
  const tasksFor = useCallback((messageId: string) => byMessage.get(String(messageId)) ?? null, [byMessage]);
  return { tasksFor, addLocal };
}

// ── Tablice docelowe ────────────────────────────────────────────────────────
export interface TaskTarget {
  key: string;
  kind: 'tasks' | 'board';
  label: string;
  /** Tablica zadań służby/Kalendarza: źródło (source_kind) — tworzona przez serwer przy pierwszym zadaniu. */
  source?: string;
  boardId?: string;
}

type CanModule = (moduleKey: string | null, table: string, op: string) => boolean;

// Zadania służby kanału (domyślnie), Kalendarz, tablice Projektów — tylko te, w których mogę tworzyć.
export async function loadTaskTargets(
  conv: { type?: string | null; ministry_key?: string | null; name?: string | null } | null,
  canModule: CanModule,
  moduleLabel: (key: string) => string | null,
): Promise<TaskTarget[]> {
  const out: TaskTarget[] = [];
  const convModule = conversationModuleKey(conv);
  const can = (mod: string | null) => canModule(mod, 'board_items', 'create');
  if (convModule && sliceResource(convModule, 'tasks') && eventTasksSource(convModule) !== CALENDAR_TASKS_SOURCE) {
    if (can(eventTasksModule(convModule))) {
      const label = moduleLabel(convModule) || conv?.name || 'służby';
      out.push({ key: `tasks:${convModule}`, kind: 'tasks', source: eventTasksSource(convModule), label: `Zadania — ${label}` });
    }
  }
  if (can('calendar')) out.push({ key: 'tasks:calendar', kind: 'tasks', source: CALENDAR_TASKS_SOURCE, label: 'Zadania Kalendarza' });
  if (can(null)) {
    const { data } = await supabase
      .from('boards')
      .select('id, name, module_key, source_kind, is_template, is_archived')
      .eq('is_template', false)
      .is('module_key', null)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });
    for (const b of (data ?? []) as any[]) {
      if (b.is_archived || b.source_kind) continue;
      out.push({ key: `board:${b.id}`, kind: 'board', boardId: String(b.id), label: String(b.name || 'Tablica bez nazwy') });
    }
  }
  return out;
}

export const useTaskTargets = (
  conv: { id?: string; type?: string | null; ministry_key?: string | null; name?: string | null } | null,
  canModule: CanModule,
  moduleLabel: (key: string) => string | null,
  enabled: boolean,
) =>
  useQuery({
    queryKey: ['message-task-targets', conv?.id ?? '', conv?.type ?? '', conv?.ministry_key ?? ''],
    queryFn: () => loadTaskTargets(conv, canModule, moduleLabel),
    enabled: enabled && !!conv,
    staleTime: 60_000,
  });

// ── Zapis zadania ───────────────────────────────────────────────────────────
export const absoluteMessageUrl = (conversationId: string, messageId: string, threadRootId?: string | null) =>
  `${tenantWebBase()}${messageLinkPath(conversationId, messageId, threadRootId ?? null)}`;

export const taskDescriptionFor = (
  message: { id: string; conversation_id: string; content?: string | null; thread_root_id?: string | null },
  senderName: string,
  conversationName: string,
) =>
  messageTaskDescription({
    content: message.content,
    fromLine: `Z wiadomości od ${senderName} w „${conversationName}”`,
    url: absoluteMessageUrl(message.conversation_id, message.id, message.thread_root_id),
  });

interface PersonCell {
  email: string;
  name: string;
  avatar_url?: string;
}

// Komórki nowego zadania: termin (rola „due” / pierwsza data), osoba, status „do zrobienia”.
function newTaskCells(columns: BoardColumn[], due: string | null, people: PersonCell[]): Record<string, unknown> {
  const dueCol = columns.find((c) => c.settings?.role === 'due') ?? columns.find((c) => c.type === 'date') ?? null;
  const peopleCol = columns.find((c) => c.type === 'people') ?? null;
  const status = statusColumnOf(columns);
  const cells: Record<string, unknown> = {};
  if (dueCol && due) cells[dueCol.id] = due;
  if (peopleCol && people.length) cells[peopleCol.id] = people;
  const raw = Array.isArray(status?.settings?.labels) ? (status!.settings.labels as any[]) : [];
  const todo = raw.find((l) => l?.id === 'todo') ?? raw.find((l) => l && !isDoneLabel(l)) ?? null;
  if (status && todo?.id != null) cells[status.id] = todo.id;
  return cells;
}

export async function createTaskFromMessage(input: {
  target: TaskTarget;
  title: string;
  message: { id: string; conversation_id: string };
  name: string;
  description: string;
  due: string | null;
  people: PersonCell[];
  me: { email: string | null; name: string | null };
}): Promise<MessageTaskRow> {
  const boardId =
    input.target.kind === 'tasks' ? await ensureTasksBoardId(input.target.source!, input.title) : String(input.target.boardId);
  const [b, cols, groups, last] = await Promise.all([
    supabase.from('boards').select('id, name, module_key, source_kind, is_template').eq('id', boardId).maybeSingle(),
    supabase.from('board_columns').select('*').eq('board_id', boardId).order('display_order'),
    supabase.from('board_groups').select('id, display_order').eq('board_id', boardId).order('display_order').limit(1),
    supabase.from('board_items').select('display_order').eq('board_id', boardId).order('display_order', { ascending: false }).limit(1),
  ]);
  if (b.error || !b.data) throw new Error('Nie udało się otworzyć tablicy zadań.');
  const columns = ((cols.data ?? []) as any[]).map(toColumn);
  const cells = newTaskCells(columns, input.due, input.people);
  const { data, error } = await (supabase.from('board_items') as any)
    .insert({
      board_id: boardId,
      group_id: (groups.data as any[] | null)?.[0]?.id ?? null,
      name: input.name.trim(),
      description: input.description || null,
      cells,
      display_order: (Number((last.data as any[] | null)?.[0]?.display_order) || 0) + 1,
      created_by: input.me.email,
      source_message_id: input.message.id,
      source_conversation_id: input.message.conversation_id,
    })
    .select()
    .single();
  if (error) throw error;
  const item = data as any;
  logBoardActivity({ itemId: String(item.id), boardId, actorEmail: input.me.email, actorName: input.me.name, action: 'created' });
  const map = tasksByMessage([{ ...item, source_message_id: input.message.id }], [b.data as any], columns as any[]);
  const row = map.get(String(input.message.id))?.[0];
  return (
    row ?? {
      id: String(item.id),
      boardId,
      board: b.data as any,
      name: input.name.trim(),
      status: null,
      done: false,
      createdAt: null,
    }
  );
}

// ── Zapisane wiadomości ─────────────────────────────────────────────────────
export interface SavedRow {
  id: string;
  message_id: string;
  conversation_id: string | null;
  note: string | null;
  created_at: string | null;
}

export const savedIdsKey = (email: string | null) => ['saved-message-ids', email] as const;
export const savedListKey = (email: string | null) => ['saved-messages', email] as const;

// Moje zakładki (lekko) — do przełącznika w menu wiadomości. Stary serwer bez tabeli → [] (bez akcji).
export const useSavedIds = (email: string | null) =>
  useQuery({
    queryKey: savedIdsKey(email),
    queryFn: async (): Promise<{ available: boolean; ids: string[] }> => {
      const { data, error } = await supabase.from('saved_messages').select('message_id');
      if (error) return { available: false, ids: [] };
      return { available: true, ids: ((data ?? []) as any[]).map((r) => String(r.message_id)) };
    },
    enabled: !!email,
    staleTime: 60_000,
  });

export const useToggleSaved = (email: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, saved }: { messageId: string; saved: boolean }) => {
      if (saved) {
        const { error } = await supabase.from('saved_messages').delete().eq('message_id', messageId);
        if (error) throw error;
        return false;
      }
      const { error } = await (supabase.from('saved_messages') as any).insert({ message_id: messageId }).select().single();
      if (error) throw error;
      return true;
    },
    onMutate: ({ messageId, saved }) => {
      const prev = qc.getQueryData<{ available: boolean; ids: string[] }>(savedIdsKey(email));
      if (prev) {
        const ids = saved ? prev.ids.filter((id) => id !== messageId) : [...prev.ids, messageId];
        qc.setQueryData(savedIdsKey(email), { ...prev, ids });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(savedIdsKey(email), ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: savedListKey(email) });
    },
  });
};

export interface SavedListItem {
  saved: SavedRow;
  message: MessageRow;
}

// Lista „Zapisane”: zakładki + wiadomości, które nadal widzę. Najnowsze zapisane najpierw.
export const useSavedMessages = (email: string | null) =>
  useQuery({
    queryKey: savedListKey(email),
    queryFn: async (): Promise<SavedListItem[]> => {
      const { data, error } = await supabase.from('saved_messages').select('id, message_id, conversation_id, note, created_at');
      if (error) throw error;
      const saved = ((data ?? []) as any[]).map(
        (r): SavedRow => ({
          id: String(r.id),
          message_id: String(r.message_id),
          conversation_id: r.conversation_id != null ? String(r.conversation_id) : null,
          note: r.note ?? null,
          created_at: r.created_at ?? null,
        }),
      );
      if (!saved.length) return [];
      const msgs: MessageRow[] = [];
      for (const part of chunks(saved.map((s) => s.message_id))) {
        const r = await supabase
          .from('messages')
          .select('id, conversation_id, thread_root_id, sender_email, content, attachments, message_type, deleted_at, created_at, reply_to_id, edited_at')
          .in('id', part);
        if (r.error) throw r.error;
        msgs.push(...((r.data ?? []) as MessageRow[]));
      }
      return savedMessageRows(saved, msgs);
    },
    enabled: !!email,
  });
