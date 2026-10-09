// Uprawnienia „w zakresie służby” do WSPÓLNYCH tabel — jedno źródło prawdy dla web + api.
//
// Dane służb żyją dziś we wspólnych tabelach: wydarzenia w `events` (kolumna module_key),
// grafik w events.assignments[<służba>] + schedule_assignments (team_type), zadania na tablicach
// board_* (boards.module_key, a dla tablic z importu skryptem — boards.source_kind). Macierz
// uprawnień i przynależność do służb (ministry.js) nadają jednak prawa do STARYCH zasobów modułu
// (media_events, media_tasks…). Tu te stare klucze znaczą „wycinek wspólnej tabeli tej służby”:
//
//   wiersz wspólnej tabeli należący do służby K jest dostępny, gdy
//     • globalnie:  module:<moduł tabeli> + res:<tabela>:<op>   (jak dotąd), ALBO
//     • w zakresie: module:K + res:<zasób K>:<op wg mapy niżej>.
//
// Mapa operacji na tablicach: elementy → CRUD na zadaniach służby; komentarze → komentarze
// zadań (albo zadania), polubienie = zapis komentarza; dziennik/przebiegi → odczyt/tworzenie
// zadań; zmiany STRUKTURY (tablica, grupy, kolumny, widoki, automatyzacje) → USUWANIE zadań
// (poziom „zarządza”: lider służby tak, członek nie). Tablice Projektów (bez modułu) i
// dashboardy — tylko globalnie.
import { MODULES, crudCapability } from './catalog.js';

const STATIC_KEYS = new Set(MODULES.map((m) => m.key));
// module_key wydarzeń kalendarza ogólnego — to nie służby.
const RESERVED_KEYS = new Set(['general', 'program']);
const KEY_RE = /^[a-z0-9_]{1,64}$/;

// Zasoby „wycinka” służb wbudowanych (klucze z katalogu — test spójności w api/test).
// teaching: grafik kazań (events.assignments.teaching) i wydarzenia modułu → nauczania.
export const MODULE_SLICES = {
  worship: { events: 'worship_events' },
  media: { events: 'media_events', tasks: 'media_tasks', task_comments: 'media_task_comments' },
  atmosfera: { events: 'atmosfera_events' },
  kids: { events: 'kids_events' },
  homegroups: { events: 'homegroups_events', tasks: 'home_group_tasks', task_comments: 'home_group_task_comments' },
  mlodziezowka: { events: 'mlodziezowka_events', tasks: 'mlodziezowka_tasks', task_comments: 'mlodziezowka_task_comments' },
  teaching: { events: 'teachings' },
  // Zadania Kalendarza żyją na tablicy (source_kind 'tasks') — prawa jak do dawnej tabeli tasks.
  calendar: { tasks: 'tasks' },
};

// Sekcje grafiku o historycznych nazwach → moduł (Scena / MC = custom_mc_members w Młodzieżówce).
export const TEAM_ALIASES = { mc: 'mlodziezowka' };

// Tabela wspólna → moduł, który daje do niej dostęp GLOBALNY (zgodnie z registry.js).
export const SCOPED_TABLE_MODULE = {
  events: 'calendar',
  schedule_assignments: 'programs',
  boards: 'boards',
  board_groups: 'boards',
  board_columns: 'boards',
  board_items: 'boards',
  board_item_updates: 'boards',
  board_item_activity: 'boards',
  board_views: 'boards',
  board_automations: 'boards',
  board_automation_runs: 'boards',
};

export const isModuleScopedTable = (table) => Object.prototype.hasOwnProperty.call(SCOPED_TABLE_MODULE, table);

// Moduł własny (kreator): klucz spoza katalogu statycznego. Jego zasoby to custom_<key>_<sufiks>.
export function isCustomModuleKey(key) {
  return typeof key === 'string' && KEY_RE.test(key) && !STATIC_KEYS.has(key) && !RESERVED_KEYS.has(key);
}

// Zasób służby danego rodzaju ('events' | 'tasks' | 'task_comments') albo null.
export function sliceResource(moduleKey, kind) {
  if (!moduleKey) return null;
  const s = MODULE_SLICES[moduleKey];
  if (s) return s[kind] || null;
  return isCustomModuleKey(moduleKey) ? `custom_${moduleKey}_${kind}` : null;
}

// Moduł tablicy zadań po source_kind (= stara tabela zadań modułu, np. 'media_tasks').
export function moduleForTasksSource(sourceKind) {
  if (!sourceKind) return null;
  for (const [key, s] of Object.entries(MODULE_SLICES)) if (s.tasks === sourceKind) return key;
  const m = /^custom_([a-z0-9_]+)_tasks$/.exec(String(sourceKind));
  return m && isCustomModuleKey(m[1]) ? m[1] : null;
}

// Moduł, do którego należy tablica (null = tablica Projektów).
export function boardModuleKey(board) {
  if (!board) return null;
  return board.module_key || moduleForTasksSource(board.source_kind) || null;
}

// Klucze sekcji grafiku dla zbioru modułów (z aliasami).
export function teamsForModules(modules) {
  const set = new Set(modules || []);
  for (const [alias, target] of Object.entries(TEAM_ALIASES)) if (set.has(target)) set.add(alias);
  return [...set];
}

const TO_DATA_OP = { read: 'select', create: 'insert' };
const normOp = (op) => TO_DATA_OP[op] || op;
const CRUD_OF = { select: ['read'], insert: ['create'], update: ['update'], delete: ['delete'], upsert: ['create', 'update'] };

// Wymaganie w zakresie służby dla (tabela, op): { kind, ops } albo null (brak ścieżki).
function requirement(table, op) {
  const o = normOp(op);
  const crud = CRUD_OF[o];
  if (!crud) return null;
  switch (table) {
    case 'events':
    case 'schedule_assignments':
      return { kind: 'events', ops: crud };
    case 'board_items':
      return { kind: 'tasks', ops: crud };
    case 'board_item_updates':
      // Polubienie to zmiana wpisu — wystarcza prawo komentowania.
      return { kind: 'comments', ops: o === 'select' ? ['read'] : o === 'delete' ? ['delete'] : ['create'] };
    case 'board_item_activity':
    case 'board_automation_runs':
      return { kind: 'tasks', ops: o === 'select' ? ['read'] : (o === 'insert' || o === 'upsert') ? ['create'] : ['delete'] };
    case 'boards':
    case 'board_groups':
    case 'board_columns':
    case 'board_views':
    case 'board_automations':
      return { kind: 'tasks', ops: o === 'select' ? ['read'] : ['delete'] };
    default:
      return null;
  }
}

// Prawo GLOBALNE (jak registry.canAccess): module:<moduł tabeli> + res:<tabela>:<op>.
export function globalAllows(canFn, table, op) {
  const mod = SCOPED_TABLE_MODULE[table];
  if (!mod) return false;
  return !!canFn(`module:${mod}`) && !!canFn(crudCapability(table, normOp(op)));
}

// Prawo W ZAKRESIE SŁUŻBY moduleKey do wierszy tej służby we wspólnej tabeli.
export function moduleScopedAllows(canFn, moduleKey, table, op) {
  const req = requirement(table, op);
  if (!req || !moduleKey) return false;
  const tasks = sliceResource(moduleKey, 'tasks');
  const res = req.kind === 'comments'
    ? (tasks ? (sliceResource(moduleKey, 'task_comments') || tasks) : null)
    : sliceResource(moduleKey, req.kind);
  if (!res) return false;
  if (!canFn(`module:${moduleKey}`)) return false;
  return req.ops.every((c) => !!canFn(`res:${res}:${c}`));
}

// Sekcja grafiku (events.assignments[team] / schedule_assignments.team_type) — z aliasami.
export function teamAllows(canFn, team, op = 'update') {
  const key = String(team || '');
  const keys = TEAM_ALIASES[key] ? [TEAM_ALIASES[key], key] : [key];
  return keys.some((k) => moduleScopedAllows(canFn, k, 'schedule_assignments', op));
}

// Zmiana grafiku na wydarzeniu (fn event-assignments-patch) w zakresie służb: każda sekcja musi
// należeć do służby, którą osoba może edytować.
export function assignmentsPatchAllowed(canFn, ops) {
  return Array.isArray(ops) && ops.length > 0 && ops.every((o) => o && teamAllows(canFn, o.team, 'update'));
}

// Moderacja komentarzy zadań (usuwanie CUDZYCH wpisów) — ta sama reguła co serwer
// (api/dataapi/boardsScope.js enforceBoardCommentWrite): globalnie res:board_item_updates:delete
// RAZEM z res:boards:delete (samo prawo usuwania komentarzy ma też członek — do własnych wpisów)
// albo lider służby na tablicy swojego modułu (prawo usuwania komentarzy zadań tej służby).
export function canModerateBoardComments(canFn, board) {
  if (canFn('res:board_item_updates:delete') && canFn('res:boards:delete')) return true;
  const key = boardModuleKey(board);
  return !!key && moduleScopedAllows(canFn, key, 'board_item_updates', 'delete');
}

// Klucze modułów, w zakresie których osoba może wykonać op na tabeli (serwer → zawężenie wierszy).
// customKeys: klucze modułów z app_modules (moduły własne).
export function allowedModules(canFn, table, op, customKeys = []) {
  const candidates = new Set([...Object.keys(MODULE_SLICES), ...(customKeys || []).filter(isCustomModuleKey)]);
  return [...candidates].filter((k) => moduleScopedAllows(canFn, k, table, op));
}

// Reguła dla UI: globalnie albo w zakresie służby moduleKey (schedule_assignments: sekcja grafiku).
export function canModuleScoped(canFn, moduleKey, table, op) {
  if (globalAllows(canFn, table, op)) return true;
  if (!moduleKey) return false;
  return table === 'schedule_assignments'
    ? teamAllows(canFn, moduleKey, op)
    : moduleScopedAllows(canFn, moduleKey, table, op);
}
