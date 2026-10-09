// Projekty (Boards): prywatne tablice i spójność wierszy po stronie serwera.
//
// Tablica z visibility='private' jest dla właściciela (owner_email) i osób z listy editors.
// Do audytu 2026-10 filtr był tylko w kliencie (useBoards) — przez /api/db i realtime każdy
// z dostępem do modułu Projekty widział prywatne tablice i ich elementy.
// Tu: zakres wierszy dla boards i tabel podrzędnych (board_id) + odbiorcy realtime, a także
// (audyt 2026-10, runda 3):
//  • board_id wierszy podrzędnych wyprowadzany/sprawdzany z elementu/grupy (item_id,
//    parent_item_id, group_id muszą należeć do tej samej tablicy); wiersz bez tablicy nie jest
//    widoczny dla wszystkich; zmiana nie przeniesie wiersza do tablicy, której nie widzę,
//  • komentarze (board_item_updates): autor stemplowany przez serwer, zmiana/usunięcie tylko
//    przez autora (polubienia — każdy, kto widzi) albo osobę zarządzającą tablicami,
//  • tablice: udostępnianie i formularz (owner_email, visibility, editors, form_*) zmienia
//    tylko właściciel albo admin; source_kind ustawia wyłącznie serwer (import zadań).
import { ApiError, buildWhere } from './querybuilder.js';
import { allowedModules, boardModuleKey } from '@avenit/shared/src/permissions/moduleScope.js';

const CHILD_TABLES = new Set([
  'board_items', 'board_groups', 'board_columns', 'board_views', 'board_automations',
  'board_automation_runs', 'board_item_activity', 'board_item_updates',
]);

export const isBoardTable = (table) => table === 'boards' || CHILD_TABLES.has(table);

const lower = (v) => String(v ?? '').toLowerCase();
const rowsOf = (q) => (Array.isArray(q.values) ? q.values : [q.values]).filter(Boolean);

// Komentarze i dziennik mają board_id NULL-owalne (starsze wpisy) — tablica wtedy przez element.
const VIA_ITEM = new Set(['board_item_updates', 'board_item_activity']);

// Wyrażenie SQL: id tablicy, do której należy wiersz tabeli podrzędnej (alias a). Gdy nic nie
// pasuje — NULL, więc EXISTS (… b.id = NULL) jest fałszywe: wiersz bez tablicy jest niewidoczny
// (wcześniej `board_id IS NULL OR …` pokazywało go wszystkim).
export function boardIdExpr(table, a) {
  if (VIA_ITEM.has(table)) {
    return `COALESCE(${a}."board_id", (SELECT bi_."board_id" FROM board_items bi_ WHERE bi_."id" = ${a}."item_id"))`;
  }
  if (table === 'board_automation_runs') {
    return `COALESCE(${a}."board_id", (SELECT ba_."board_id" FROM board_automations ba_ WHERE ba_."id" = ${a}."automation_id"))`;
  }
  return `${a}."board_id"`;
}

// Tablica widoczna dla mnie: nie-prywatna, moja (właściciel; awaryjnie twórca) albo jestem edytorem.
function visibleBoard(b, p) {
  return `(coalesce(${b}."visibility", 'workspace') <> 'private'`
    + ` OR lower(coalesce(${b}."owner_email", ${b}."created_by")) = $${p}`
    + ` OR EXISTS (SELECT 1 FROM unnest(coalesce(${b}."editors", '{}'::text[])) e_ WHERE lower(e_) = $${p}))`;
}

export function boardScope(table, user) {
  const email = lower(user.email);
  const rule = table === 'boards'
    ? (a, push) => visibleBoard(a, push(email))
    : (a, push) => {
      const p = push(email);
      return `EXISTS (SELECT 1 FROM boards b_ WHERE b_."id" = ${boardIdExpr(table, a)} AND ${visibleBoard('b_', p)})`;
    };
  return { select: rule, update: rule, delete: rule, upsertGuard: rule };
}

// Referencje wiersza podrzędnego do innych wierszy tablic: kolumna → tabela (jej board_id).
const REFS = {
  board_items: { group_id: 'board_groups', parent_item_id: 'board_items' },
  board_item_updates: { item_id: 'board_items' },
  board_item_activity: { item_id: 'board_items' },
  board_automation_runs: { automation_id: 'board_automations', item_id: 'board_items' },
};
// Referencje tylko informacyjne: element mógł już zniknąć (przebieg automatyzacji po usunięciu).
const OPTIONAL_REFS = new Set(['board_automation_runs.item_id']);
// Kolumn tych tabel nie da się zmienić (wpis należy do elementu na stałe).
const FIXED_ON_UPDATE = {
  board_item_updates: ['item_id', 'board_id', 'parent_update_id'],
  board_item_activity: ['item_id', 'board_id'],
};

const deny = (msg) => { throw new ApiError(403, msg); };

// id → board_id dla wskazanych wierszy tabeli (String → String|null).
async function boardsOf(db, table, ids) {
  const list = [...new Set(ids.filter((v) => v != null).map(String))];
  if (!list.length) return new Map();
  const { rows } = await db.query(`SELECT id, board_id FROM ${table} WHERE id::text = ANY($1::text[])`, [list]);
  return new Map(rows.map((r) => [String(r.id), r.board_id == null ? null : String(r.board_id)]));
}

async function loadRefs(db, table, rows) {
  const found = {};
  for (const [col, refTable] of Object.entries(REFS[table] || {})) {
    const map = await boardsOf(db, refTable, rows.map((r) => r[col]));
    found[refTable] = found[refTable] ? new Map([...found[refTable], ...map]) : map;
  }
  return found;
}

// Tablica wyznaczona przez referencje wiersza (+ jawne board_id). Rzuca, gdy wskazują różne
// tablice albo referencja nie istnieje. Zwraca id tablicy albo null (brak referencji i board_id).
function boardFromRefs(table, row, found) {
  const boards = new Set();
  if (row.board_id != null) boards.add(String(row.board_id));
  for (const [col, refTable] of Object.entries(REFS[table] || {})) {
    if (row[col] == null) continue;
    const b = found[refTable]?.get(String(row[col]));
    if (b === undefined && OPTIONAL_REFS.has(`${table}.${col}`)) continue;
    if (b === undefined) throw new ApiError(400, 'Nie znaleziono wskazanego elementu tablicy');
    if (b != null) boards.add(b);
  }
  if (boards.size > 1) deny('Element, grupa i tablica muszą należeć do tej samej tablicy');
  return boards.size ? [...boards][0] : null;
}

// Insert/upsert: board_id z referencji (wstawiany, gdy brak), niezgodność → 403, brak tablicy → 403.
// Update: zmiana referencji (np. grupa) tylko w obrębie tablicy zmienianych wierszy; przeniesienie
// do innej tablicy wyłącznie jawnie (board_id) i — dla elementu — razem z grupą tej tablicy.
// Zwraca listę tablic docelowych (do sprawdzenia widoczności).
async function deriveBoardIds(q, req) {
  const rows = rowsOf(q);
  if (!rows.length) return [];
  const refCols = Object.keys(REFS[q.table] || {});
  if (q.op === 'update') {
    const v = rows[0];
    for (const c of FIXED_ON_UPDATE[q.table] || []) {
      if (c in v) deny('Nie można przenieść tego wpisu do innego elementu ani tablicy');
    }
    const touches = 'board_id' in v || refCols.some((c) => c in v);
    if (!touches) return [];
    if ('board_id' in v && v.board_id == null) deny('Wiersz musi należeć do tablicy');
    const found = await loadRefs(req.db, q.table, [v]);
    const target = boardFromRefs(q.table, v, found);
    if (target == null) return [];
    const params = [];
    const where = buildWhere(q.filters, params, 't', []);
    if (!where) throw new ApiError(400, 'Zmiana wymaga wskazania konkretnych wierszy');
    const { rows: cur } = await req.db.query(
      `SELECT DISTINCT (${boardIdExpr(q.table, 't')})::text AS board_id FROM ${q.table} t${where}`, params
    );
    if (cur.some((r) => r.board_id !== target)) {
      if (!('board_id' in v)) deny('Grupa i element muszą należeć do tej samej tablicy');
      if (q.table === 'board_items' && !('group_id' in v)) deny('Przenosząc element, wskaż grupę w tablicy docelowej');
    }
    return [target];
  }
  // insert / upsert
  const found = await loadRefs(req.db, q.table, rows);
  const targets = [];
  for (const r of rows) {
    const b = boardFromRefs(q.table, r, found);
    if (b == null) deny('Wiersz musi należeć do tablicy');
    if (r.board_id == null) r.board_id = b;
    targets.push(b);
  }
  return targets;
}

// Czy wszystkie wskazane tablice są dla mnie widoczne.
async function assertVisibleBoards(db, email, ids) {
  const list = [...new Set(ids.filter((v) => v != null).map(String))];
  if (!list.length) return;
  const { rows: found } = await db.query(
    `SELECT count(*)::int AS n FROM boards b WHERE b.id::text = ANY($1::text[]) AND ${visibleBoard('b', 2)}`,
    [list, email]
  );
  if (found[0].n !== list.length) deny('Brak dostępu do tej tablicy');
}

// ── Tablice: pola właściciela i źródło ───────────────────────────────────────
// Udostępnianie i formularz publiczny — tylko właściciel (owner_email, awaryjnie twórca) albo admin.
export const BOARD_OWNER_FIELDS = ['owner_email', 'created_by', 'visibility', 'editors', 'form_enabled', 'form_token'];

const norm = (col, v) => {
  if (v === undefined || v === null || v === '') return null;
  if (col === 'editors') return JSON.stringify((Array.isArray(v) ? v : [v]).map((e) => lower(e)).sort());
  if (col === 'owner_email' || col === 'created_by') return lower(v);
  if (col === 'form_enabled') return String(v === true || v === 'true');
  return String(v);
};

async function enforceBoardsOwnerWrite(q, req, { isAdmin = false, isSuperAdmin = false } = {}) {
  if (!['insert', 'upsert', 'update'].includes(q.op) || !q.values) return;
  const rows = rowsOf(q);
  if (!rows.length) return;
  const me = lower(req.user?.email);

  // source_kind (powiązanie z importem starych zadań) — wyłącznie serwer (fn board-import-legacy).
  if (!isSuperAdmin) {
    if (q.op !== 'update') {
      if (rows.some((r) => r.source_kind != null)) deny('Źródło tablicy ustawia serwer (import zadań)');
    } else if ('source_kind' in rows[0]) {
      const params = [];
      const where = buildWhere(q.filters, params, 't', []);
      if (!where) throw new ApiError(400, 'Zmiana wymaga wskazania konkretnych wierszy');
      params.push(rows[0].source_kind ?? null);
      const { rows: diff } = await req.db.query(
        `SELECT count(*)::int AS n FROM boards t${where} AND t."source_kind" IS DISTINCT FROM $${params.length}::text`, params
      );
      if (diff[0].n > 0) deny('Źródło tablicy ustawia serwer (import zadań)');
    }
  }
  if (isAdmin) return;

  if (q.op === 'upsert' && !q.ignoreDuplicates) deny('Tablicę zapisuj przez dodanie albo zmianę, nie upsert');
  if (q.op !== 'update') {
    // Nowa tablica: właścicielem jestem ja.
    for (const r of rows) {
      for (const c of ['owner_email', 'created_by']) {
        if (r[c] != null && r[c] !== '' && lower(r[c]) !== me) deny('Tablicę zakładasz jako jej właściciel');
      }
      if (r.created_by == null || r.created_by === '') r.created_by = req.user.email;
    }
    return;
  }
  const v = rows[0];
  const touched = BOARD_OWNER_FIELDS.filter((c) => c in v);
  if (!touched.length) return;
  const params = [];
  const where = buildWhere(q.filters, params, 't', []);
  if (!where) throw new ApiError(400, 'Zmiana wymaga wskazania konkretnych wierszy');
  const { rows: cur } = await req.db.query(
    `SELECT t."owner_email", t."created_by", t."visibility", t."editors", t."form_enabled", t."form_token" FROM boards t${where}`, params
  );
  for (const b of cur) {
    if (me && lower(b.owner_email || b.created_by) === me) continue;
    // Nie-właściciel: te pola wolno tylko odesłać bez zmiany (np. zapis całego obiektu tablicy).
    if (touched.some((c) => norm(c, v[c]) !== norm(c, b[c]))) {
      deny('Udostępnianie i formularz tablicy zmienia tylko jej właściciel');
    }
  }
}

// ── Komentarze (board_item_updates) ──────────────────────────────────────────
const LIKE_COLUMNS = new Set(['likes', 'updated_at']);

// Imię i nazwisko z konta (kolumny różnią się między tenantami — wiersz jako JSON).
async function accountName(db, user) {
  try {
    const { rows } = await db.query('SELECT to_jsonb(u) AS u FROM app_users u WHERE u.id = $1 LIMIT 1', [user.id]);
    const u = rows[0]?.u || {};
    const n = u.full_name || u.display_name || u.name || [u.first_name, u.last_name].filter(Boolean).join(' ');
    if (n && String(n).trim()) return String(n).trim().slice(0, 200);
  } catch { /* brak tabeli/kolumn — e-mail */ }
  return String(user.email || '').trim() || null;
}

// Zarządzający komentarzami globalnie: admin/legacy (resolver null) albo prawo usuwania komentarzy
// RAZEM z prawem do struktury tablic (res:boards:delete) — samo res:board_item_updates:delete ma
// też członek (migracja 093), ale tylko do własnych wpisów.
export function canModerateComments(resolver) {
  return !resolver || (resolver.can('res:board_item_updates:delete') && resolver.can('res:boards:delete'));
}

export async function enforceBoardCommentWrite(q, req, { resolver = null, moduleKeys = [] } = {}) {
  if (q.table !== 'board_item_updates' || q.op === 'select') return;
  const me = lower(req.user?.email);

  if (q.op === 'insert' || q.op === 'upsert') {
    if (q.op === 'upsert' && !q.ignoreDuplicates) deny('Komentarz dodajesz, a zmieniasz osobno');
    const rows = rowsOf(q);
    const name = rows.length ? await accountName(req.db, req.user) : null;
    for (const r of rows) {
      if (r.author_email != null && r.author_email !== '' && lower(r.author_email) !== me) deny('Komentarz dodajesz pod własnym kontem');
      r.author_email = req.user.email;
      r.author_name = name;
    }
    return;
  }

  if (q.op === 'update') {
    const v = rowsOf(q)[0] || {};
    const cols = Object.keys(v);
    if (cols.length && cols.every((c) => LIKE_COLUMNS.has(c))) return; // polubienie — każdy, kto widzi
    if ('author_email' in v && lower(v.author_email) !== me) deny('Nie możesz przepisać komentarza na inną osobę');
    if ('author_name' in v) deny('Podpis komentarza ustawia serwer');
  }

  if (canModerateComments(resolver)) return;
  // Lider służby zarządza komentarzami na tablicach swojej służby (prawo usuwania komentarzy zadań).
  const modules = resolver ? allowedModules(resolver.can, 'board_item_updates', 'delete', moduleKeys) : [];
  const params = [];
  const where = buildWhere(q.filters, params, 't', []);
  if (!where) throw new ApiError(400, 'Zmiana wymaga wskazania konkretnych wierszy');
  const { rows } = await req.db.query(
    `SELECT t."author_email", b."module_key", b."source_kind"
       FROM board_item_updates t LEFT JOIN boards b ON b."id" = ${boardIdExpr('board_item_updates', 't')}${where}`,
    params
  );
  const ok = rows.every((r) => (me && lower(r.author_email) === me) || modules.includes(boardModuleKey(r) || ''));
  if (!ok) deny('Zmieniać i usuwać można tylko własne komentarze');
  if (!modules.length) {
    // Bez prawa zarządzania: także w SQL tylko własne wpisy (wiersze dopisane po sprawdzeniu).
    const own = (a, push) => `lower(${a}."author_email") = $${push(me)}`;
    const base = q.__ownerScope || {};
    const both = (k) => (typeof base[k] === 'function' ? (a, push) => `(${base[k](a, push)} AND ${own(a, push)})` : own);
    q.__ownerScope = { ...base, update: both('update'), delete: both('delete') };
  }
}

// Zapis w tabelach Projektów: spójność tablicy, widoczność tablicy docelowej, komentarze, pola
// właściciela. opts: { isAdmin, isSuperAdmin, resolver, moduleKeys } (z routes.js).
export async function enforceBoardWrite(q, req, opts = {}) {
  if (q.table === 'boards') return enforceBoardsOwnerWrite(q, req, opts);
  if (!CHILD_TABLES.has(q.table) || q.op === 'select') return;
  if (q.table === 'board_item_updates') await enforceBoardCommentWrite(q, req, opts);
  if (q.op === 'delete' || !q.values) return;
  const targets = await deriveBoardIds(q, req);
  await assertVisibleBoards(req.db, lower(req.user.email), targets);
}

// Realtime: zmiana w prywatnej tablicy idzie tylko do właściciela i edytorów. null = bez ograniczeń.
// Wiersz, którego tablicy nie da się ustalić (NULL board_id, brak elementu) — nikt (fail-closed).
export async function boardAudience(db, table, rows) {
  if (!isBoardTable(table)) return null;
  const boards = [];
  if (table === 'boards') boards.push(...(rows || []).filter(Boolean));
  else {
    const list = (rows || []).filter(Boolean);
    const missing = list.filter((r) => r.board_id == null);
    const viaItem = new Map();
    if (missing.length) {
      if (!VIA_ITEM.has(table) || missing.some((r) => r.item_id == null)) return new Set();
      const itemIds = [...new Set(missing.map((r) => String(r.item_id)))];
      const { rows: items } = await db.query('SELECT id, board_id FROM board_items WHERE id::text = ANY($1::text[])', [itemIds]);
      for (const it of items) viaItem.set(String(it.id), it.board_id);
      if (missing.some((r) => viaItem.get(String(r.item_id)) == null)) return new Set();
    }
    const ids = [...new Set(list.map((r) => (r.board_id != null ? r.board_id : viaItem.get(String(r.item_id)))).map(String))];
    if (!ids.length) return null;
    const { rows: found } = await db.query(
      'SELECT id, visibility, owner_email, created_by, editors FROM boards WHERE id::text = ANY($1::text[])', [ids]
    );
    boards.push(...found);
  }
  // Gdy w paczce jest choć jedna prywatna tablica — ograniczamy całą paczkę (bezpieczniej
  // spóźnić odświeżenie wspólnej tablicy niż wysłać prywatny wiersz wszystkim).
  if (!boards.some((b) => b.visibility === 'private')) return null;
  const aud = new Set();
  for (const b of boards.filter((x) => x.visibility === 'private')) {
    const owner = lower(b.owner_email || b.created_by);
    if (owner) aud.add(owner);
    for (const e of b.editors || []) aud.add(lower(e));
  }
  return aud;
}
