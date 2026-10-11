import { useQuery, useQueryClient } from '@tanstack/react-query';
import { moduleForTasksSource, sliceResource } from '@avenit/shared/src/permissions/moduleScope.js';
import { isDoneLabel } from '@avenit/shared/src/lib/boardStatus.js';
import { supabase } from '../../lib/supabase';
import { ensureTasksBoardId, findTasksBoardId, logBoardActivity } from '../teams/boardItems';
import {
  dueColumnOf,
  dueOf,
  isForbidden,
  labelFor,
  peopleColumnsOf,
  peopleIn,
  statusColumnOf,
  toColumn,
  type BoardColumn,
  type Person,
  type StatusLabel,
} from '../tasks/board';
import { CALENDAR_TASKS_SOURCE } from './tasks';

// Zadania przypięte do wydarzenia (board_items.event_id) — jak web src/modules/Events/eventTasks.js.
// Zadanie żyje na tablicy zadań modułu wydarzenia (Media → media_tasks, moduł własny →
// custom_<key>_tasks…); wydarzenie ogólne albo moduł bez zakładki „Zadania” → tablica Kalendarza.
// Szablony per tablica: boards.settings.event_task_templates = [{ name, offset_days, people? }].

export function eventTasksSource(moduleKey: string | null | undefined): string {
  const key = moduleKey && moduleKey !== 'general' ? String(moduleKey) : 'calendar';
  return sliceResource(key, 'tasks') || CALENDAR_TASKS_SOURCE;
}
// Moduł, w którego zakresie są uprawnienia do tablicy (jak boardModuleKey na serwerze).
export const eventTasksModule = (moduleKey: string | null | undefined) =>
  moduleForTasksSource(eventTasksSource(moduleKey)) || 'calendar';

const pad2 = (n: number) => String(n).padStart(2, '0');
export function addDaysYmd(ymd: string | null, days: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + (Number(days) || 0));
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export interface TaskTemplate {
  name: string;
  offset_days: number;
  people: { email: string; name: string; avatar_url?: string }[];
}
export function normalizeTemplates(list: unknown): TaskTemplate[] {
  return (Array.isArray(list) ? list : [])
    .map((t: any) => ({
      name: String(t?.name || '').trim(),
      offset_days: Number.isFinite(Number(t?.offset_days)) ? Math.trunc(Number(t.offset_days)) : 0,
      people: Array.isArray(t?.people)
        ? t.people
            .filter((p: any) => p && p.email)
            .map((p: any) => ({ email: p.email, name: p.name || p.email, ...(p.avatar_url ? { avatar_url: p.avatar_url } : {}) }))
        : [],
    }))
    .filter((t) => t.name);
}

export interface NewTaskRow {
  name: string;
  due: string | null;
  people: { email: string; name: string; avatar_url?: string }[];
}
export const templateRows = (templates: TaskTemplate[], eventDate: string | null): NewTaskRow[] =>
  normalizeTemplates(templates).map((t) => ({ name: t.name, due: addDaysYmd(eventDate, t.offset_days), people: t.people }));

// Komórki nowego zadania: termin (rola „due” / pierwsza data), osoby, status „do zrobienia”.
function newTaskCells(columns: BoardColumn[], row: NewTaskRow): Record<string, unknown> {
  const due = columns.find((c) => c.settings?.role === 'due') ?? columns.find((c) => c.type === 'date') ?? null;
  const people = columns.find((c) => c.type === 'people') ?? null;
  const status = statusColumnOf(columns);
  const cells: Record<string, unknown> = {};
  if (due && row.due) cells[due.id] = row.due;
  if (people && row.people.length) cells[people.id] = row.people;
  const raw = Array.isArray(status?.settings?.labels) ? (status!.settings.labels as any[]) : [];
  const todo = raw.find((l) => l?.id === 'todo') ?? raw.find((l) => l && !isDoneLabel(l)) ?? null;
  if (status && todo?.id != null) cells[status.id] = todo.id;
  return cells;
}

export interface EventTaskRow {
  id: string;
  boardId: string;
  name: string;
  boardName: string;
  due: string | null;
  status: StatusLabel | null;
  done: boolean;
  people: Person[];
}

export interface TaskBoardTarget {
  board: { id: string; name: string; settings: Record<string, any> };
  columns: BoardColumn[];
  groupId: string | null;
}

async function readTaskBoard(boardId: string): Promise<TaskBoardTarget | null> {
  const [b, cols, groups] = await Promise.all([
    supabase.from('boards').select('id, name, settings').eq('id', boardId).maybeSingle(),
    supabase.from('board_columns').select('*').eq('board_id', boardId).order('display_order'),
    supabase.from('board_groups').select('id, display_order').eq('board_id', boardId).order('display_order').limit(1),
  ]);
  if (b.error || !b.data) return null;
  const row = b.data as any;
  return {
    board: { id: String(row.id), name: String(row.name ?? ''), settings: row.settings && typeof row.settings === 'object' ? row.settings : {} },
    columns: ((cols.data ?? []) as any[]).map(toColumn),
    groupId: (groups.data as any[] | null)?.[0]?.id != null ? String((groups.data as any[])[0].id) : null,
  };
}

// Zadania wydarzenia, które widzę (zakres wierszy pilnuje serwer: tablice prywatne, zakres służby).
async function loadEventTasks(eventId: number, moduleLabel: (key: string | null) => string | null): Promise<EventTaskRow[]> {
  const r = await supabase
    .from('board_items')
    .select('id, board_id, name, cells, event_id')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });
  if (r.error) {
    if (isForbidden({ status: (r as { status?: number }).status, code: (r.error as { code?: string }).code })) return [];
    throw r.error;
  }
  const items = (r.data ?? []) as any[];
  const ids = [...new Set(items.map((i) => String(i.board_id)))];
  if (!ids.length) return [];
  const [b, c] = await Promise.all([
    supabase.from('boards').select('id, name, module_key, source_kind, is_template').in('id', ids),
    supabase.from('board_columns').select('id, board_id, type, name, settings, display_order').in('board_id', ids),
  ]);
  const boards = new Map(((b.data ?? []) as any[]).filter((x) => !x.is_template).map((x) => [String(x.id), x]));
  const colsBy = new Map<string, BoardColumn[]>();
  for (const col of ((c.data ?? []) as any[]).map(toColumn).sort((x, y) => x.display_order - y.display_order)) {
    if (!colsBy.has(col.board_id)) colsBy.set(col.board_id, []);
    colsBy.get(col.board_id)!.push(col);
  }
  const out: EventTaskRow[] = [];
  for (const it of items) {
    const board = boards.get(String(it.board_id));
    if (!board) continue;
    const cols = colsBy.get(String(it.board_id)) ?? [];
    const cells = it.cells && typeof it.cells === 'object' ? it.cells : {};
    const statusCol = statusColumnOf(cols);
    const status = labelFor(statusCol, cells[statusCol?.id ?? '']);
    const mod = board.module_key || moduleForTasksSource(board.source_kind) || null;
    out.push({
      id: String(it.id),
      boardId: String(board.id),
      name: String(it.name || '').trim(),
      boardName: (mod && moduleLabel(mod)) || board.name || '',
      due: dueOf(dueColumnOf(cols), cells),
      status,
      done: isDoneLabel(status),
      people: peopleColumnsOf(cols).flatMap((pc) => peopleIn(cells[pc.id])),
    });
  }
  // Niezrobione najpierw, potem po terminie (bez terminu na końcu).
  return out.sort((a, b) => Number(a.done) - Number(b.done) || (a.due ?? '9999').localeCompare(b.due ?? '9999'));
}

export function useEventTasks(eventId: number, moduleLabel: (key: string | null) => string | null) {
  return useQuery({
    queryKey: ['event-tasks', eventId],
    queryFn: () => loadEventTasks(eventId, moduleLabel),
  });
}

// Tablica docelowa (bez tworzenia) — do szablonów i decyzji o przyciskach.
export function useEventTaskBoard(moduleKey: string | null) {
  return useQuery({
    queryKey: ['event-task-board', eventTasksSource(moduleKey)],
    queryFn: async (): Promise<TaskBoardTarget | null> => {
      const id = await findTasksBoardId(eventTasksSource(moduleKey)).catch(() => null);
      return id ? readTaskBoard(id) : null;
    },
  });
}

// Tworzy zadania na tablicy modułu (przy pierwszym zadaniu serwer tworzy tablicę).
export async function createEventTasks(
  moduleKey: string | null,
  boardTitle: string,
  eventId: number,
  rows: NewTaskRow[],
  me: { email: string | null; name: string | null },
): Promise<number> {
  const list = rows.filter((r) => r.name.trim());
  if (!list.length) return 0;
  const boardId = await ensureTasksBoardId(eventTasksSource(moduleKey), boardTitle);
  const target = await readTaskBoard(boardId);
  if (!target) throw new Error('Nie udało się otworzyć tablicy zadań.');
  const { data: last } = await supabase
    .from('board_items')
    .select('display_order')
    .eq('board_id', boardId)
    .order('display_order', { ascending: false })
    .limit(1);
  const base = Number((last as any[] | null)?.[0]?.display_order) || 0;
  const payload = list.map((r, i) => ({
    board_id: boardId,
    group_id: target.groupId,
    name: r.name.trim(),
    cells: newTaskCells(target.columns, r),
    display_order: base + i + 1,
    created_by: me.email,
    event_id: eventId,
  }));
  const { data, error } = await supabase.from('board_items').insert(payload).select();
  if (error) throw error;
  const items = (Array.isArray(data) ? data : data ? [data] : []) as any[];
  for (const it of items) {
    logBoardActivity({ itemId: String(it.id), boardId, actorEmail: me.email, actorName: me.name, action: 'created' });
  }
  return items.length;
}

// Zapis szablonów — świeże settings z bazy, żeby nie nadpisać innych kluczy.
export async function saveEventTaskTemplates(boardId: string, templates: TaskTemplate[]) {
  const { data: fresh, error: readErr } = await supabase.from('boards').select('id, settings').eq('id', boardId).maybeSingle();
  if (readErr) throw readErr;
  const cur = (fresh as any)?.settings;
  const settings = { ...(cur && typeof cur === 'object' ? cur : {}), event_task_templates: normalizeTemplates(templates) };
  const { error } = await supabase.from('boards').update({ settings }).eq('id', boardId);
  if (error) throw error;
  return settings;
}

export const useInvalidateEventTasks = () => {
  const qc = useQueryClient();
  return (eventId: number, moduleKey: string | null) => {
    void qc.invalidateQueries({ queryKey: ['event-tasks', eventId] });
    void qc.invalidateQueries({ queryKey: ['event-task-board', eventTasksSource(moduleKey)] });
  };
};

