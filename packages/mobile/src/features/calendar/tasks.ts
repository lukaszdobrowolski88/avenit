import { isDoneLabel } from '@avenit/shared/src/lib/boardStatus.js';
import { supabase } from '../../lib/supabase';
import { ensureTasksBoardId, findTasksBoardId } from '../teams/boardItems';
import {
  isForbidden,
  isAssigned,
  labelFor,
  toBoard,
  toColumn,
  toItem,
  type BoardColumn,
} from '../tasks/board';
import type { AgendaEvent } from './api';

// Zadania w Kalendarzu (jak web CalendarModule + Boards/lib/calendarTasks.js):
//   • tablica zadań Kalendarza (boards.source_kind = 'tasks') — wszystkie elementy z terminem;
//   • elementy INNYCH tablic z terminem, do których jestem przypisany (fn my-board-items).
// Wpisy mają `task` (odróżnia je od wydarzeń: inny wygląd, stuknięcie → ekran zadania).

export const CALENDAR_TASKS_SOURCE = 'tasks';

const localDate = (ymd: string, hm?: string | null): Date => {
  const [y, mo, d] = ymd.split('-').map(Number);
  const [h, mi] = (hm ?? '00:00').split(':').map(Number);
  return new Date(y, mo - 1, d, h || 0, mi || 0, 0);
};
const ymdOf = (v: unknown): string | null => {
  const m = String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};
const hmOf = (v: unknown): string | null => {
  const m = String(v ?? '').match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
};

// Kolumny tablicy Kalendarza po settings.role (nadawane przy imporcie), a gdy ktoś je zmienił —
// po typie/nazwie (jak web calendarColumns).
const byRole = (cols: BoardColumn[], role: string) => cols.find((c) => c.settings?.role === role) ?? null;
const byTypeName = (cols: BoardColumn[], type: string, re: RegExp) =>
  cols.find((c) => c.type === type && re.test(c.name)) ?? null;
const calendarColumns = (cols: BoardColumn[]) => ({
  due: byRole(cols, 'due') ?? cols.find((c) => c.type === 'date') ?? null,
  start: byRole(cols, 'start_time') ?? byTypeName(cols, 'text', /^(od|godzina|start)/i),
  end: byRole(cols, 'end_time') ?? byTypeName(cols, 'text', /^(do|koniec)$/i),
  location: byRole(cols, 'location') ?? cols.find((c) => c.type === 'location') ?? null,
  status: cols.find((c) => c.type === 'status') ?? null,
});

const base = (id: string, title: string): Omit<AgendaEvent, 'startsAt' | 'endsAt' | 'allDay' | 'task'> => ({
  id,
  eventId: 0,
  source: CALENDAR_TASKS_SOURCE,
  title,
  location: null,
  description: null,
  moduleKey: null,
  eventType: null,
  programId: null,
  campusId: null,
  isMine: false,
  myRole: null,
});

// Id tablicy zadań Kalendarza. Brak tablicy → jednorazowy import starej tabeli `tasks` na serwerze
// (fn board-import-legacy, idempotentnie; jak web przy pierwszym wejściu) — raz na sesję apki.
// Wspólne pomocniki z zakładkami „Zadania” (features/teams/boardItems.ts).
let importing: Promise<string | null> | null = null;
const calendarBoardId = async (mayImport: boolean): Promise<string | null> => {
  const found = await findTasksBoardId(CALENDAR_TASKS_SOURCE);
  if (found || !mayImport) return found;
  if (!importing) importing = ensureTasksBoardId(CALENDAR_TASKS_SOURCE, 'Zadania').catch(() => null);
  return importing;
};

export async function loadCalendarTaskEntries(opts: {
  from: string;
  to: string;
  email: string | null;
  mayImport: boolean;
}): Promise<{ boardId: string | null; entries: AgendaEvent[] }> {
  const empty = { boardId: null, entries: [] as AgendaEvent[] };
  // Brak dostępu (403) albo awaria odczytu — Kalendarz po prostu bez tych zadań.
  const id = await calendarBoardId(opts.mayImport).catch(() => null);
  if (!id) return empty;
  const found = await supabase.from('boards').select('id, name, module_key, source_kind').eq('id', id).limit(1);
  if (found.error && !isForbidden(found.error)) throw found.error;
  const row = ((found.data ?? []) as any[])[0] ?? null;
  if (!row) return empty;
  const board = toBoard(row);

  const [cols, items] = await Promise.all([
    supabase.from('board_columns').select('*').eq('board_id', board.id).order('display_order'),
    supabase.from('board_items').select('*').eq('board_id', board.id).is('parent_item_id', null).order('display_order'),
  ]);
  if (cols.error || items.error) {
    const err = cols.error || items.error;
    if (isForbidden(err)) return { boardId: board.id, entries: [] };
    throw err;
  }
  const columns = ((cols.data ?? []) as any[]).map(toColumn);
  const c = calendarColumns(columns);
  if (!c.due) return { boardId: board.id, entries: [] };

  const entries: AgendaEvent[] = [];
  for (const r of (items.data ?? []) as any[]) {
    const it = toItem(r);
    const ymd = ymdOf(it.cells[c.due.id]);
    if (!ymd || ymd < opts.from || ymd > opts.to) continue;
    const start = c.start ? hmOf(it.cells[c.start.id]) : null;
    const end = c.end ? hmOf(it.cells[c.end.id]) : null;
    const status = labelFor(c.status, c.status ? it.cells[c.status.id] : null);
    const loc = c.location ? it.cells[c.location.id] : null;
    entries.push({
      ...base(`task-${it.id}`, it.name.trim() || 'Zadanie'),
      startsAt: localDate(ymd, start),
      endsAt: start && end ? localDate(ymd, end) : null,
      allDay: !start,
      location: typeof loc === 'string' && loc.trim() ? loc : (loc as any)?.address ?? null,
      description: it.description,
      task: {
        itemId: it.id,
        boardId: board.id,
        boardName: board.name,
        done: isDoneLabel(status),
        statusTitle: status?.title ?? null,
        statusColor: status?.color ?? null,
        mine: isAssigned(it.cells, columns, opts.email),
      },
    });
  }
  return { boardId: board.id, entries };
}

interface MyBoardItem {
  id: string;
  board_id: string;
  board_name: string | null;
  module_key: string | null;
  source_kind: string | null;
  name: string | null;
  date: string;
  end: string | null;
  status: { title: string; color: string | null; done?: boolean } | null;
  done?: boolean;
}

// Elementy innych tablic z terminem, do których jestem przypisany (tylko podgląd → ekran zadania).
export async function loadMyBoardEntries(opts: { from: string; to: string; excludeBoardId: string | null }): Promise<AgendaEvent[]> {
  const { data, error } = await supabase.functions.invoke('my-board-items', {
    body: { from: opts.from, to: opts.to, ...(opts.excludeBoardId ? { exclude_board_id: opts.excludeBoardId } : {}) },
  });
  if (error) return []; // brak funkcji / dostępu / sieci — kalendarz bez tych wpisów
  const items = Array.isArray((data as any)?.items) ? ((data as any).items as MyBoardItem[]) : [];
  return items.flatMap((it) => {
    const ymd = ymdOf(it.date);
    if (!ymd || String(it.board_id) === opts.excludeBoardId) return [];
    const endYmd = ymdOf(it.end);
    // Etykieta z jawną flagą `done` (nowy serwer) albo nazwą; bez etykiety — wynik serwera.
    const done = it.status ? isDoneLabel(it.status) : !!it.done;
    return [
      {
        ...base(`task-${it.id}`, String(it.name ?? '').trim() || 'Zadanie'),
        startsAt: localDate(ymd),
        endsAt: endYmd && endYmd !== ymd ? localDate(endYmd) : null,
        allDay: true,
        task: {
          itemId: String(it.id),
          boardId: String(it.board_id),
          boardName: it.board_name ?? null,
          done,
          statusTitle: it.status?.title ?? null,
          statusColor: it.status?.color ?? null,
          mine: true,
        },
      },
    ];
  });
}
