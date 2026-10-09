// Zadania przypięte do wydarzenia (board_items.event_id) — zakładka „Zadania” na stronie wydarzenia.
//
// Zadanie żyje na tablicy zadań modułu wydarzenia (Media → media_tasks, moduł własny →
// custom_<key>_tasks…); wydarzenie ogólne albo moduł bez zakładki „Zadania” (Uwielbienie, Dzieci…)
// → tablica zadań Kalendarza (source_kind 'tasks'). Szablony zadań per tablica modułu:
// boards.settings.event_task_templates = [{ name, offset_days, people? }] — „Dodaj z szablonu”
// tworzy wszystkie pozycje z terminem = data wydarzenia + przesunięcie (dni, ujemne = przed).
import { pickSourceBoard } from '@avenit/shared/src/lib/taskLinks.js';
import { supabase } from '../../lib/supabase';
import { tr } from '../../i18n';
import { sliceResource, moduleForTasksSource } from '@avenit/shared/src/permissions/moduleScope.js';
import { isDoneLabel } from '@avenit/shared/src/lib/boardStatus.js';
import { importLegacyTasks } from '../Boards/lib/legacyImport';
import { loadCalendarTaskBoard, calendarColumns, CALENDAR_TASKS_SOURCE } from '../Boards/lib/calendarTasks';

const YMD = /^(\d{4})-(\d{2})-(\d{2})/;
const pad2 = (n) => String(n).padStart(2, '0');
const isForbidden = (r) => r?.status === 403 || String(r?.error?.code || '') === '403';

// Źródło tablicy zadań dla modułu wydarzenia ('' / null / 'general' → Kalendarz).
export function eventTasksSource(moduleKey) {
  const key = moduleKey && moduleKey !== 'general' ? String(moduleKey) : 'calendar';
  return sliceResource(key, 'tasks') || CALENDAR_TASKS_SOURCE;
}

// Moduł, w którego zakresie są uprawnienia do tej tablicy (jak boardModuleKey na serwerze).
export const eventTasksModule = (moduleKey) => moduleForTasksSource(eventTasksSource(moduleKey)) || 'calendar';

// 'YYYY-MM-DD' + n dni (kalendarzowo, bez przesunięć strefy). Brak daty → null.
export function addDaysYmd(ymd, days) {
  const m = YMD.exec(String(ymd || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + (Number(days) || 0));
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Szablony z ustawień tablicy — oczyszczone (bez pustych nazw, przesunięcie jako liczba całkowita).
export function normalizeTemplates(list) {
  return (Array.isArray(list) ? list : [])
    .map((t) => ({
      name: String(t?.name || '').trim(),
      offset_days: Number.isFinite(Number(t?.offset_days)) ? Math.trunc(Number(t.offset_days)) : 0,
      people: Array.isArray(t?.people) ? t.people.filter((p) => p && p.email).map((p) => ({ email: p.email, name: p.name || p.email, ...(p.avatar_url ? { avatar_url: p.avatar_url } : {}) })) : [],
    }))
    .filter((t) => t.name);
}

export const templatesOf = (board) => normalizeTemplates(board?.settings?.event_task_templates);

// Szablony → wiersze do utworzenia: { name, due, people }.
export function templateRows(templates, eventDate) {
  return normalizeTemplates(templates).map((t) => ({ name: t.name, due: addDaysYmd(eventDate, t.offset_days), people: t.people }));
}

// Kolumny tablicy, do których wpisujemy termin / osoby / status nowego zadania.
export function taskColumns(columns = []) {
  const cal = calendarColumns(columns);
  return { due: cal.due, people: cal.people, status: cal.status };
}

// Pierwsza etykieta „do zrobienia” (id 'todo' albo pierwsza nie-„gotowe”).
export function todoLabelId(statusCol) {
  const labels = statusCol?.settings?.labels || [];
  return (labels.find((l) => l?.id === 'todo') || labels.find((l) => !isDoneLabel(l)) || null)?.id ?? null;
}

// Komórki nowego zadania: termin, osoby, status „do zrobienia”.
export function newTaskCells(columns, { due = null, people = [] } = {}) {
  const c = taskColumns(columns);
  const cells = {};
  if (c.due && due) cells[c.due.id] = due;
  if (c.people && people?.length) cells[c.people.id] = people;
  const todo = todoLabelId(c.status);
  if (c.status && todo != null) cells[c.status.id] = todo;
  return cells;
}

// Zadania wydarzenia, które widzę (zakres wierszy pilnuje serwer: tablice prywatne, zakres służby).
// → { boards, columns, items, forbidden }
export async function loadEventTasks(eventId) {
  const empty = { boards: [], columns: [], items: [], forbidden: false };
  const r = await supabase.from('board_items').select('id, board_id, name, cells, parent_item_id, event_id')
    .eq('event_id', eventId).order('created_at', { ascending: true });
  if (isForbidden(r)) return { ...empty, forbidden: true };
  if (r.error) throw r.error;
  const items = r.data || [];
  const ids = [...new Set(items.map((i) => String(i.board_id)))];
  if (!ids.length) return empty;
  const [b, c] = await Promise.all([
    supabase.from('boards').select('id, name, module_key, source_kind, is_template').in('id', ids),
    supabase.from('board_columns').select('id, board_id, type, name, settings, display_order').in('board_id', ids),
  ]);
  if (b.error && !isForbidden(b)) throw b.error;
  if (c.error && !isForbidden(c)) throw c.error;
  return { boards: b.data || [], columns: c.data || [], items, forbidden: false };
}

// Tablica zadań modułu (bez tworzenia) → { board, columns, groupId } | null.
async function readTaskBoard(sourceKind) {
  const res = await supabase.from('boards').select('*').eq('source_kind', sourceKind)
    .order('created_at', { ascending: true }).limit(10);
  if (isForbidden(res)) return null;
  if (res.error) throw res.error;
  const board = pickSourceBoard(res.data);
  if (!board) return null;
  const [cols, groups] = await Promise.all([
    supabase.from('board_columns').select('*').eq('board_id', board.id).order('display_order'),
    supabase.from('board_groups').select('id, display_order').eq('board_id', board.id).order('display_order').limit(1),
  ]);
  if (cols.error) throw cols.error;
  return { board, columns: cols.data || [], groupId: groups.data?.[0]?.id || null };
}

// Tablica docelowa dla wydarzenia. create=false → tylko istniejąca (podgląd szablonów);
// create=true → w razie braku tworzy ją serwer (jak przy pierwszym wejściu w zakładkę „Zadania”).
export async function resolveEventTaskBoard(moduleKey, { create = false, title = null } = {}) {
  const source = eventTasksSource(moduleKey);
  if (source === CALENDAR_TASKS_SOURCE) {
    if (!create) return readTaskBoard(source);
    const cal = await loadCalendarTaskBoard();
    return cal ? { board: cal.board, columns: cal.columns, groupId: cal.groupId } : null;
  }
  const found = await readTaskBoard(source);
  if (found || !create) return found;
  const res = await importLegacyTasks({ sourceKind: source, title: title || tr('Zadania') });
  const { data } = await supabase.from('boards').select('*').eq('id', res.boardId).limit(1);
  if (!data?.[0]) return null;
  return readTaskBoard(source);
}

// Tworzy zadania wydarzenia na tablicy docelowej. rows: [{ name, due, people }]. → { items, error }
export async function createEventTasks(target, eventId, rows, { userEmail = null, userName = null } = {}) {
  const { board, columns, groupId } = target;
  const list = (rows || []).filter((r) => String(r?.name || '').trim());
  if (!list.length) return { items: [], error: null };
  const { data: last } = await supabase.from('board_items').select('display_order').eq('board_id', board.id)
    .order('display_order', { ascending: false }).limit(1);
  const base = Number(last?.[0]?.display_order) || 0;
  const payload = list.map((r, i) => ({
    board_id: board.id,
    group_id: groupId,
    name: String(r.name).trim(),
    cells: newTaskCells(columns, { due: r.due || null, people: r.people || [] }),
    display_order: base + i + 1,
    created_by: userEmail,
    event_id: eventId,
  }));
  const { data, error } = await supabase.from('board_items').insert(payload).select();
  if (error) return { items: [], error };
  const items = Array.isArray(data) ? data : (data ? [data] : []);
  // Dziennik aktywności jak przy dodaniu w tablicy (best-effort).
  if (items.length) {
    supabase.from('board_item_activity').insert(items.map((it) => ({
      item_id: it.id, board_id: board.id, actor_email: userEmail, actor_name: userName, action: 'created',
    }))).then(() => {}, () => {});
  }
  return { items, error: null };
}

// Zapis szablonów w ustawieniach tablicy — świeże settings z bazy, żeby nie nadpisać innych kluczy.
export async function saveEventTaskTemplates(boardId, templates) {
  const { data: fresh, error: readErr } = await supabase.from('boards').select('id, settings').eq('id', boardId).maybeSingle();
  if (readErr) return { error: readErr, settings: null };
  const settings = { ...(fresh?.settings && typeof fresh.settings === 'object' ? fresh.settings : {}), event_task_templates: normalizeTemplates(templates) };
  const { error } = await supabase.from('boards').update({ settings }).eq('id', boardId);
  return { error, settings: error ? null : settings };
}
