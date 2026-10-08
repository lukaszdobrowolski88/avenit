import { supabase } from '../../../lib/supabase';
import { importLegacyTasks } from './legacyImport';

// Zadania Kalendarza = elementy Tablicy „Zadania” (boards.source_kind = 'tasks', module_key 'calendar').
// Dawna tabela `tasks` jest raz przenoszona na tablicę przez serwer (fn board-import-legacy) i dalej
// tylko czytana. Kolumny tablicy rozpoznajemy po settings.role (nadawane przy imporcie), a gdy ktoś
// je zmienił w Projektach — po typie/nazwie.

export const CALENDAR_TASKS_SOURCE = 'tasks';

const byRole = (cols, role) => cols.find((c) => c?.settings?.role === role);
const byTypeName = (cols, type, re) => cols.find((c) => c.type === type && re.test(String(c.name || '')));

export function calendarColumns(columns = []) {
  const cols = columns || [];
  return {
    due: byRole(cols, 'due') || cols.find((c) => c.type === 'date') || null,
    start: byRole(cols, 'start_time') || byTypeName(cols, 'text', /^(od|godzina|start)/i) || null,
    end: byRole(cols, 'end_time') || byTypeName(cols, 'text', /^(do|koniec)$/i) || null,
    team: byRole(cols, 'team') || byTypeName(cols, 'dropdown', /kategori|kalendarz/i) || null,
    location: byRole(cols, 'location') || cols.find((c) => c.type === 'location') || null,
    people: cols.find((c) => c.type === 'people') || null,
    status: cols.find((c) => c.type === 'status') || null,
  };
}

const hhmm = (v) => (typeof v === 'string' && /^\d{1,2}:\d{2}/.test(v) ? v.slice(0, 5).padStart(5, '0') : '');
const labelOf = (col, id) => (col?.settings?.labels || []).find((l) => l.id === id) || null;

// Element tablicy → „zadanie” w kształcie, którego używa kalendarz (buildCalendarEntries / ModalAddTask).
export function boardItemToTask(item, columns) {
  const c = calendarColumns(columns);
  const cells = item?.cells || {};
  const due = c.due ? cells[c.due.id] : null;
  const team = c.team ? cells[c.team.id] : null;
  const people = c.people && Array.isArray(cells[c.people.id]) ? cells[c.people.id] : [];
  const status = c.status ? labelOf(c.status, cells[c.status.id]) : null;
  return {
    id: item.id,
    title: item.name || '',
    description: item.description || '',
    due_date: typeof due === 'string' ? due.slice(0, 10) : null,
    due_time: c.start ? hhmm(cells[c.start.id]) : '',
    end_time: c.end ? hhmm(cells[c.end.id]) : '',
    team: Array.isArray(team) ? (team[0] || null) : (team || null),
    location: c.location ? (cells[c.location.id] || '') : '',
    status: status?.title || '',
    status_id: status?.id || null,
    people,
    assignee_email: people[0]?.email || '',
  };
}

// Etykieta statusu po tytule (np. 'Do zrobienia') — inaczej pierwsza „do zrobienia”/pierwsza w ogóle.
export function statusIdForTitle(col, title) {
  const labels = col?.settings?.labels || [];
  const t = String(title || '').trim().toLowerCase();
  const hit = labels.find((l) => String(l.title || '').trim().toLowerCase() === t)
    || (t ? null : labels.find((l) => l.id === 'todo'));
  return hit ? hit.id : (labels.find((l) => l.id === 'todo')?.id ?? labels[0]?.id ?? null);
}

// Zapis z okna zadania → { name, description, cells } (komórki spoza kalendarza zostają nietknięte).
// task: payload ModalAddTask (due_date 'YYYY-MM-DD…', due_time, end_time, team, location, status,
// assignee_touched + assignee (osoba {email,name,avatar_url} | null)).
export function taskToBoardItem(task, columns, prevCells = {}) {
  const c = calendarColumns(columns);
  const cells = { ...(prevCells || {}) };
  const set = (col, v) => { if (!col) return; if (v == null || v === '' || (Array.isArray(v) && !v.length)) delete cells[col.id]; else cells[col.id] = v; };
  set(c.due, task.due_date ? String(task.due_date).slice(0, 10) : null);
  set(c.start, hhmm(task.due_time || ''));
  set(c.end, hhmm(task.end_time || ''));
  set(c.team, task.team ? [task.team] : null);
  set(c.location, task.location || '');
  if (c.status) {
    const current = labelOf(c.status, prevCells?.[c.status.id]);
    // Okno zadania nie zmienia statusu — nowy element dostaje „Do zrobienia”, istniejący zachowuje swój.
    if (!current) set(c.status, statusIdForTitle(c.status, task.status));
  }
  if (task.assignee_touched) set(c.people, task.assignee ? [task.assignee] : null);
  return { name: String(task.title || '').trim(), description: task.description || null, cells };
}

// Kalendarzowa tablica zadań: { board, columns, items, groupId } albo null (brak dostępu/błąd).
// Brak tablicy → jednorazowy import tabeli `tasks` na serwerze (współdzielony między montowaniami).
let importing = null;
export async function loadCalendarTaskBoard() {
  const findBoard = async () => {
    const { data, error } = await supabase.from('boards').select('*').eq('source_kind', CALENDAR_TASKS_SOURCE)
      .order('created_at', { ascending: true }).limit(1);
    if (error) throw error;
    return data?.[0] || null;
  };
  let board = await findBoard();
  if (!board) {
    if (!importing) importing = importLegacyTasks({ sourceKind: CALENDAR_TASKS_SOURCE, title: 'Zadania' }).finally(() => { importing = null; });
    const res = await importing;
    const { data } = await supabase.from('boards').select('*').eq('id', res.boardId).limit(1);
    board = data?.[0] || null;
    if (!board) return null;
  }
  const [cols, items, groups] = await Promise.all([
    supabase.from('board_columns').select('*').eq('board_id', board.id).order('display_order'),
    supabase.from('board_items').select('*').eq('board_id', board.id).is('parent_item_id', null).order('display_order'),
    supabase.from('board_groups').select('id, display_order').eq('board_id', board.id).order('display_order').limit(1),
  ]);
  if (cols.error || items.error) throw (cols.error || items.error);
  return { board, columns: cols.data || [], items: items.data || [], groupId: groups.data?.[0]?.id || null };
}

// Brak uprawnień (403/401) — kalendarz po prostu nie pokazuje zadań, bez komunikatu o błędzie.
export const isAccessError = (e) => ['401', '403'].includes(String(e?.status ?? e?.code ?? ''));

// Zapis zadania z okna kalendarza jako element tablicy. → { error }
export async function saveCalendarTask(taskBoard, task, { userEmail = null, userName = null } = {}) {
  const { board, columns, items, groupId } = taskBoard;
  if (task.id) {
    // Świeże komórki z bazy — inne kolumny mogły się zmienić w tablicy od wczytania kalendarza.
    const { data: fresh, error: readErr } = await supabase.from('board_items').select('id, cells').eq('id', task.id).maybeSingle();
    if (readErr) return { error: readErr };
    const base = fresh?.cells || items.find((i) => i.id === task.id)?.cells || {};
    const { name, description, cells } = taskToBoardItem(task, columns, base);
    const { error } = await supabase.from('board_items').update({ name, description, cells }).eq('id', task.id);
    return { error };
  }
  const { name, description, cells } = taskToBoardItem(task, columns, {});
  const maxOrder = items.reduce((m, it) => Math.max(m, Number(it.display_order) || 0), -1);
  const { data, error } = await supabase.from('board_items').insert({
    board_id: board.id, group_id: groupId, name, description, cells, display_order: maxOrder + 1, created_by: userEmail,
  }).select().single();
  if (!error && data?.id) {
    // Dziennik aktywności jak przy dodaniu w tablicy (best-effort — nie blokuje zapisu).
    supabase.from('board_item_activity').insert({
      item_id: data.id, board_id: board.id, actor_email: userEmail, actor_name: userName, action: 'created',
    }).then(() => {}, () => {});
  }
  return { error };
}

export async function deleteCalendarTask(taskId) {
  const { error } = await supabase.from('board_items').delete().eq('id', taskId);
  return { error };
}

// Elementy innych tablic z terminem, do których jestem przypisany (tylko odczyt w kalendarzu).
export async function loadMyAssignedItems({ excludeBoardId } = {}) {
  try {
    const { data, error } = await supabase.functions.invoke('my-board-items', {
      body: excludeBoardId ? { exclude_board_id: excludeBoardId } : {}, silent: true,
    });
    if (error) return [];
    return Array.isArray(data?.items) ? data.items : [];
  } catch { return []; } // brak sieci — kalendarz bez tych wpisów
}
