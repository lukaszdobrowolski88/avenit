// Egzekwowanie uprawnień „w zakresie służby” na wspólnych tabelach (reguła: shared
// permissions/moduleScope.js). canAccess({ allowModuleScope:true }) zwraca moduleScope
// { modules }, gdy osoba NIE ma prawa globalnego, ale ma je dla swoich służb — tu:
//  • zawężenie wierszy (select/update/delete/upsert) do tych służb — AND z zakresem, który
//    tabela już ma (prywatne tablice z boardsScope.js),
//  • walidacja zapisu: nowe/zmieniane wiersze muszą należeć do tych służb (module_key
//    wydarzenia, team_type grafiku, tablica elementu).
// Prawo globalne → ten plik nie jest używany (zachowanie bez zmian).
import { ApiError } from './querybuilder.js';
import { boardIdExpr } from './boardsScope.js';
import { loadGrants } from './registry.js';
import { makeResolver } from '@avenit/shared/src/permissions/resolve.js';
import { sliceResource, teamsForModules, assignmentsPatchAllowed } from '@avenit/shared/src/permissions/moduleScope.js';

const BOARD_CHILD = new Set([
  'board_groups', 'board_columns', 'board_items', 'board_item_updates', 'board_item_activity',
  'board_views', 'board_automations', 'board_automation_runs',
]);
const SCOPE_KINDS = ['select', 'update', 'delete', 'upsertGuard'];

const rowsOf = (q) => (Array.isArray(q.values) ? q.values : [q.values]).filter(Boolean);
const tasksSources = (modules) => modules.map((k) => sliceResource(k, 'tasks')).filter(Boolean);

// Tablica należy do jednej ze służb: module_key, a tablica z importu bez module_key — po source_kind.
function boardsPredicate(b, push, modules) {
  const pm = push(modules);
  const ps = push(tasksSources(modules));
  return `(${b}."module_key" = ANY($${pm}::text[]) OR (${b}."module_key" IS NULL AND ${b}."source_kind" = ANY($${ps}::text[])))`;
}

// Zakres wierszy (alias, push) => SQL dla tabeli i listy służb; null = tabela spoza mechanizmu.
export function moduleRowScope(table, modules) {
  const mods = [...(modules || [])].map(String);
  let rule;
  if (table === 'events') rule = (a, push) => `${a}."module_key" = ANY($${push(mods)}::text[])`;
  else if (table === 'schedule_assignments') rule = (a, push) => `${a}."team_type" = ANY($${push(teamsForModules(mods))}::text[])`;
  else if (table === 'boards') rule = (a, push) => boardsPredicate(a, push, mods);
  else if (BOARD_CHILD.has(table)) {
    // Tablica wiersza: board_id, a dla komentarzy/dziennika/przebiegów bez board_id — przez element
    // lub automatyzację (boardsScope.boardIdExpr). Wiersz bez tablicy — poza zakresem.
    rule = (a, push) => `EXISTS (SELECT 1 FROM boards mb_ WHERE mb_."id" = ${boardIdExpr(table, a)} AND ${boardsPredicate('mb_', push, mods)})`;
  } else return null;
  return { select: rule, update: rule, delete: rule, upsertGuard: rule };
}

// Złożenie dwóch zakresów wierszy (oba muszą być spełnione). null w danym rodzaju = bez ograniczeń.
export function andScopes(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  const out = {};
  for (const k of SCOPE_KINDS) {
    const fa = a[k];
    const fb = b[k];
    out[k] = fa && fb ? (alias, push) => `(${fa(alias, push)} AND ${fb(alias, push)})` : (fa || fb || null);
  }
  return out;
}

const deny = (msg) => { throw new ApiError(403, msg); };

// Walidacja zapisu w zakresie służb. update: tylko gdy zmienia kolumnę przynależności.
export async function enforceModuleScopedWrite(q, req, modules) {
  if (!['insert', 'upsert', 'update'].includes(q.op) || !q.values) return;
  const mods = [...(modules || [])].map(String);
  const isNew = q.op !== 'update';
  const rows = rowsOf(q);

  if (q.table === 'events') {
    for (const r of rows) {
      if ((isNew || 'module_key' in r) && !mods.includes(String(r.module_key ?? ''))) {
        deny('Wydarzenie możesz zapisać tylko w kalendarzu swojej służby');
      }
    }
    return;
  }
  if (q.table === 'schedule_assignments') {
    const teams = teamsForModules(mods);
    for (const r of rows) {
      if ((isNew || 'team_type' in r) && !teams.includes(String(r.team_type ?? ''))) {
        deny('Grafik możesz zmieniać tylko dla swojej służby');
      }
    }
    return;
  }
  if (q.table === 'boards') {
    const srcs = tasksSources(mods);
    for (const r of rows) {
      const ok = isNew
        ? mods.includes(String(r.module_key ?? '')) || (r.module_key == null && srcs.includes(String(r.source_kind ?? '')))
        : (!('module_key' in r) || mods.includes(String(r.module_key ?? '')))
          && (!('source_kind' in r) || r.source_kind == null || srcs.includes(String(r.source_kind)));
      if (!ok) deny('Tablicę możesz zapisać tylko w module swojej służby');
    }
    return;
  }
  if (BOARD_CHILD.has(q.table)) {
    const touched = rows.filter((r) => isNew || 'board_id' in r);
    if (!touched.length) return;
    if (touched.some((r) => r.board_id == null)) deny('Brak uprawnień do tej tablicy');
    const ids = [...new Set(touched.map((r) => String(r.board_id)))];
    const { rows: found } = await req.db.query(
      `SELECT count(*)::int AS n FROM boards b WHERE b.id::text = ANY($1::text[])
         AND (b.module_key = ANY($2::text[]) OR (b.module_key IS NULL AND b.source_kind = ANY($3::text[])))`,
      [ids, mods, tasksSources(mods)]
    );
    if (found[0].n !== ids.length) deny('Brak uprawnień do tej tablicy');
  }
}

// Wołane z routes.js po ustaleniu pozostałych zakresów tabeli (np. boardScope).
export async function applyModuleScope(q, req, moduleScope) {
  if (!moduleScope) return;
  const scope = moduleRowScope(q.table, moduleScope.modules);
  if (!scope) throw new ApiError(403, 'Brak uprawnień');
  q.__ownerScope = andScopes(q.__ownerScope || null, scope);
  await enforceModuleScopedWrite(q, req, moduleScope.modules);
}

// fn event-assignments-patch: bez globalnej edycji wydarzeń — każda zmieniana sekcja grafiku
// musi należeć do służby, którą osoba może edytować (prawo update na wydarzeniach tej służby).
export async function canPatchTeams({ pool, dbName, user, ops }) {
  const { grants, adminRoles } = await loadGrants(pool, dbName);
  if (user.is_super_admin || adminRoles.has(user.role)) return true;
  if (grants === null) return false; // tryb legacy — tylko prawo globalne
  const resolver = makeResolver(grants, { role: user.role, userId: user.id, isAdmin: false });
  return assignmentsPatchAllowed(resolver.can, ops);
}
