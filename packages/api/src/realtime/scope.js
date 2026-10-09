// Realtime: zakres wierszy per subskrybent — te same reguły co odczyt przez /api/db.
//
// Hub wysyła zmianę każdemu, kto ma subskrypcję tabeli. Do audytu 2026-10 (runda 3) oznaczało
// to, że zmiana wydarzenia z ograniczonym audytorium (visibility_segments) trafiała do wszystkich
// z prawem odczytu kalendarza, a osoba z prawem tylko „w zakresie służby” nie mogła w ogóle
// subskrybować (events/board_*), więc nie miała odświeżeń na żywo. Tu filtr zmian per klient:
//  • events — kampus, widoczność (ten sam predykat SQL co SELECT: eventVisibilityClause),
//    zakres służby (module_key),
//  • schedule_assignments / boards / board_* — zakres służby (jak moduleRowScope),
//  • tabele kampusowe — kampus osoby.
// Prywatne tablice i rozmowy mają osobne listy odbiorców (audience w routes.js).
import { CAMPUS_SCOPED_TABLES, eventVisibilityClause } from '../dataapi/querybuilder.js';
import { isRestrictedEvent, loadVisibilityContext } from '../dataapi/eventVisibility.js';
import { sliceResource, teamsForModules } from '@avenit/shared/src/permissions/moduleScope.js';

const BOARD_CHILD = new Set([
  'board_groups', 'board_columns', 'board_items', 'board_item_updates', 'board_item_activity',
  'board_views', 'board_automations', 'board_automation_runs',
]);
const lower = (v) => String(v ?? '').toLowerCase();
const CONTEXT_TTL_MS = 60_000;

// Tablica należy do służb (jak boardsPredicate w dataapi/moduleScope.js).
export function boardInModules(board, modules) {
  if (!board) return false;
  const mods = (modules || []).map(String);
  if (board.module_key != null) return mods.includes(String(board.module_key));
  const srcs = mods.map((k) => sliceResource(k, 'tasks')).filter(Boolean);
  return board.source_kind != null && srcs.includes(String(board.source_kind));
}

// Wydarzenie z ograniczonym audytorium: czy ten klient je widzi. Zapis (insert/update) — predykat SQL
// na bieżącym wierszu; usunięcia (wiersza już nie ma) — tylko autor wydarzenia.
async function visibleEvents(pool, op, rows, getContext) {
  const restricted = rows.filter(isRestrictedEvent);
  if (!restricted.length) return rows;
  const ctx = await getContext();
  let allowed;
  if (op === 'delete') {
    allowed = new Set(restricted.filter((r) => ctx.email && lower(r.created_by) === lower(ctx.email)).map((r) => String(r.id)));
  } else {
    const params = [restricted.map((r) => r.id)];
    const push = (v) => { params.push(v); return params.length; };
    const sql = `SELECT t.id FROM events t WHERE t.id = ANY($1) AND ${eventVisibilityClause(ctx, 't', push)}`;
    const { rows: ok } = await pool.query(sql, params);
    allowed = new Set(ok.map((r) => String(r.id)));
  }
  return rows.filter((r) => !isRestrictedEvent(r) || allowed.has(String(r.id)));
}

// Tablice wierszy podrzędnych (board_id albo — komentarze/dziennik — przez element).
async function boardsForRows(pool, rows) {
  const itemIds = [...new Set(rows.filter((r) => r.board_id == null && r.item_id != null).map((r) => String(r.item_id)))];
  const viaItem = new Map();
  if (itemIds.length) {
    const { rows: items } = await pool.query('SELECT id, board_id FROM board_items WHERE id::text = ANY($1::text[])', [itemIds]);
    for (const it of items) viaItem.set(String(it.id), it.board_id);
  }
  const boardOf = (r) => (r.board_id != null ? r.board_id : viaItem.get(String(r.item_id)));
  const ids = [...new Set(rows.map(boardOf).filter((v) => v != null).map(String))];
  const byId = new Map();
  if (ids.length) {
    const { rows: boards } = await pool.query('SELECT id, module_key, source_kind FROM boards WHERE id::text = ANY($1::text[])', [ids]);
    for (const b of boards) byId.set(String(b.id), b);
  }
  return (r) => byId.get(String(boardOf(r) ?? '')) || null;
}

// Filtr zmian dla klienta (async (op, rows) => rows) albo null, gdy tabela nie wymaga filtrowania.
// user: { email, role, campus_id, member_id }; moduleScope: { modules } z canAccess (allowModuleScope).
export function realtimeRowFilter({ pool, table, user, isAdmin, moduleScope = null }) {
  if (isAdmin) return null;
  const campusId = user?.campus_id ?? null;
  const campusOn = campusId != null && CAMPUS_SCOPED_TABLES.has(table);
  const modules = moduleScope?.modules || null;
  const isEvents = table === 'events';
  const scopedBoards = modules && (table === 'boards' || BOARD_CHILD.has(table));
  if (!campusOn && !isEvents && !modules) return null;

  let ctx = null;
  let ctxAt = 0;
  const getContext = async () => {
    if (!ctx || Date.now() - ctxAt > CONTEXT_TTL_MS) {
      ctx = await loadVisibilityContext(pool, user);
      ctxAt = Date.now();
    }
    return ctx;
  };

  return async (op, rows) => {
    let out = (rows || []).filter(Boolean);
    if (campusOn) out = out.filter((r) => r.campus_id == null || String(r.campus_id) === String(campusId));
    if (modules && isEvents) out = out.filter((r) => modules.includes(String(r.module_key ?? '')));
    if (modules && table === 'schedule_assignments') {
      const teams = teamsForModules(modules);
      out = out.filter((r) => teams.includes(String(r.team_type ?? '')));
    }
    if (scopedBoards && out.length) {
      if (table === 'boards') out = out.filter((b) => boardInModules(b, modules));
      else {
        const boardOf = await boardsForRows(pool, out);
        out = out.filter((r) => boardInModules(boardOf(r), modules));
      }
    }
    if (isEvents && out.length) out = await visibleEvents(pool, op, out, getContext);
    return out;
  };
}
