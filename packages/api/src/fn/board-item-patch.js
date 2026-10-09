// Zmiana elementu tablicy po stronie serwera — scalanie komórek pod blokadą wiersza.
//
// Do 2026-10 klient wysyłał przez /api/db CAŁE board_items.cells złożone z własnej (często
// nieaktualnej) kopii. Dwie osoby zmieniające naraz różne kolumny tego samego zadania nadpisywały
// sobie zmiany („zniknął mi status”). Tu klient wysyła tylko zmienione komórki, a serwer scala je
// z aktualnym stanem pod SELECT … FOR UPDATE.
//
// Body: { item_id, cells?: { [columnId]: wartość | null }, name?, description?, group_id?,
//         parent_item_id?, event_id? }
//   cells — tylko podane klucze; null usuwa klucz; kolumny muszą należeć do tablicy elementu.
//   group_id — grupa tej samej tablicy (null tylko dla podelementu).
//   parent_item_id — element tej samej tablicy (bez cykli) albo null.
//   event_id — wydarzenie (events.id) albo null (kolumna z migracji 094).
// → { item } — pełny wiersz po zmianie.
// Błędy: 400 (dane), 403 (brak prawa zapisu elementów), 404 (brak elementu albo poza zasięgiem).
//
// Dostęp — te same reguły co update board_items przez /api/db: registry.canAccess(update,
// allowModuleScope) → prawo globalne (Projekty) albo „w zakresie służby” (zawężenie moduleScope.js),
// do tego prywatne tablice (boardsScope.js). Po zapisie: realtime (odbiorcy jak w /api/db) i
// powiadomienia o nowo przypisanych osobach (boardNotify.js).
import { canAccess } from '../dataapi/registry.js';
import { ApiError } from '../dataapi/querybuilder.js';
import { boardScope, boardAudience } from '../dataapi/boardsScope.js';
import { applyModuleScope } from '../dataapi/moduleScope.js';
import { hasPeopleLike, notifyBoardAssignees } from '../dataapi/boardNotify.js';
import { filterUserContent } from '../lib/moderation.js';
import { emitChange } from '../realtime/hub.js';
import { fieldColumns } from '@avenit/shared/src/permissions/catalog.js';

export const name = 'board-item-patch';
export const method = 'POST';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CELLS_BYTES = 256 * 1024;
const MAX_NAME = 2000;
const MAX_DESCRIPTION = 100_000;

export const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const bad = (msg) => new ApiError(400, msg);

// ── Wspólne dla fn tablic (board-items-reorder, board-comment) ─────────────────────────────
// Konto wołającego (kontekst jak w /api/db: rola, superadmin, kampus) — null, gdy brak konta.
export async function actorOf(req) {
  const { rows } = await req.db.query(
    `SELECT id, email, role, is_super_admin, campus_id, full_name, name FROM app_users WHERE id = $1`, [req.user.id]);
  const u = rows[0];
  if (!u) return null;
  return { ...req.user, ...u, email: u.email || req.user.email, role: u.role ?? req.user.role };
}

// Prawo do (table, op) jak w /api/db + zakres wierszy: prywatne tablice i — przy prawie „w zakresie
// służby” — tylko tablice tych służb. Rzuca ApiError(403). Zwraca { access, q } (q.__ownerScope gotowe).
export async function boardWriteScope(req, user, q) {
  const access = await canAccess({ pool: req.db, dbName: req.tenant.db_name, table: q.table, op: q.op, user, allowModuleScope: true });
  if (!access.ok) throw new ApiError(403, access.reason || 'Brak uprawnień');
  // Pola chronione (macierz uprawnień) — jak „Egzekwowanie pól przy zapisie” w /api/db.
  if (access.resolver && q.values) {
    for (const c of fieldColumns(q.table)) {
      if (c in q.values && !access.resolver.fieldWritable(q.table, c)) throw new ApiError(403, `Brak uprawnienia do edycji pola '${c}'`);
    }
  }
  q.__ownerScope = boardScope(q.table, req.user);
  if (access.moduleScope) await applyModuleScope(q, req, access.moduleScope);
  return { access, q };
}

// SQL zakresu (alias, rodzaj) dla zapytań pisanych ręcznie. push(v) → numer parametru.
export function scopeSql(q, kind, alias, push) {
  const fn = q.__ownerScope?.[kind];
  return typeof fn === 'function' ? fn(alias, push) : 'TRUE';
}

export function sendFnError(reply, err, req, label) {
  if (err instanceof ApiError) return reply.code(err.status).send({ error: err.message });
  req.log?.error?.(err, label);
  return reply.code(500).send({ error: 'Nie udało się zapisać zmian' });
}

// Kolumny board_items w tej bazie (description, event_id bywają nieobecne przed migracjami) —
// pamięć podręczna per pula na 5 min.
const colsCache = new WeakMap();
export async function boardItemColumns(db) {
  const hit = colsCache.get(db);
  if (hit && Date.now() - hit.at < 300_000) return hit.cols;
  const { rows } = await db.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'board_items'`);
  const cols = new Set(rows.map((r) => r.column_name));
  try { colsCache.set(db, { cols, at: Date.now() }); } catch { /* db nie jest obiektem */ }
  return cols;
}

// ── Walidacja wejścia (czyste — testy) ───────────────────────────────────────────────────
// → { itemId, cells: {…}|null, fields: { name?, description?, group_id?, parent_item_id?, event_id? } }
export function parsePatch(body) {
  const b = isPlainObject(body) ? body : {};
  if (!isUuid(b.item_id)) throw bad('Brak albo nieprawidłowe item_id');
  const fields = {};
  let cells = null;
  if ('cells' in b && b.cells != null) {
    if (!isPlainObject(b.cells)) throw bad('cells musi być obiektem { idKolumny: wartość }');
    for (const k of Object.keys(b.cells)) if (!isUuid(k)) throw bad(`Nieprawidłowy identyfikator kolumny: ${k}`);
    if (Buffer.byteLength(JSON.stringify(b.cells)) > MAX_CELLS_BYTES) throw bad('Za dużo danych w komórkach');
    cells = b.cells;
  }
  if ('name' in b) {
    if (b.name != null && typeof b.name !== 'string') throw bad('name musi być tekstem');
    fields.name = String(b.name ?? '').slice(0, MAX_NAME);
  }
  if ('description' in b) {
    if (b.description != null && typeof b.description !== 'string') throw bad('description musi być tekstem');
    fields.description = b.description == null ? null : b.description.slice(0, MAX_DESCRIPTION);
  }
  for (const k of ['group_id', 'parent_item_id']) {
    if (!(k in b)) continue;
    if (b[k] != null && !isUuid(b[k])) throw bad(`Nieprawidłowe ${k}`);
    fields[k] = b[k] ?? null;
  }
  if ('event_id' in b) {
    const v = b.event_id;
    if (v != null && !((typeof v === 'string' && /^[0-9a-zA-Z-]{1,64}$/.test(v)) || Number.isInteger(v))) throw bad('Nieprawidłowe event_id');
    fields.event_id = v ?? null;
  }
  if (!cells && !Object.keys(fields).length) throw bad('Brak zmian');
  return { itemId: b.item_id, cells, fields };
}

// Scalenie komórek: podane klucze nadpisują, null usuwa. Nie mutuje wejścia.
export function mergeCells(current, patch) {
  const base = isPlainObject(current) ? current : (() => {
    if (typeof current === 'string') { try { const o = JSON.parse(current); return isPlainObject(o) ? o : {}; } catch { return {}; } }
    return {};
  })();
  const next = { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    if (v === null) delete next[k];
    else next[k] = v;
  }
  return next;
}

// Kształt wartości dla typu kolumny (minimum, które psuje widoki): „Osoby” to lista osób.
export function checkCellValue(column, value) {
  if (value === null) return;
  if (column.type === 'people') {
    if (!Array.isArray(value)) throw bad(`Kolumna „${column.name || column.id}”: oczekiwano listy osób`);
    for (const p of value) {
      const ok = (typeof p === 'string' && p.includes('@')) || (isPlainObject(p) && typeof p.email === 'string' && p.email.includes('@'));
      if (!ok) throw bad(`Kolumna „${column.name || column.id}”: każda osoba musi mieć e-mail`);
    }
  }
}

export default async function handler(req, reply) {
  if (!req.db || !req.tenant) return reply.code(404).send({ error: 'Nieznany tenant' });
  if (!req.user?.id) return reply.code(401).send({ error: 'Brak sesji' });

  let client = null;
  let before = null;
  let item = null;
  try {
    const { itemId, cells, fields } = parsePatch(req.body);
    const user = await actorOf(req);
    if (!user) return reply.code(403).send({ error: 'Brak konta' });

    const values = { ...fields, ...(cells ? { cells } : {}) };
    filterUserContent({ table: 'board_items', op: 'update', values });
    for (const k of ['name', 'description']) if (k in fields) fields[k] = values[k];
    const { q } = await boardWriteScope(req, user, {
      table: 'board_items', op: 'update', values, filters: [{ type: 'eq', column: 'id', value: itemId }],
    });

    const have = await boardItemColumns(req.db);
    if ('description' in fields && !have.has('description')) delete fields.description;
    if ('event_id' in fields && !have.has('event_id')) throw bad('Powiązanie z wydarzeniem jest jeszcze niedostępne (migracja 094)');

    client = await req.db.connect();
    await client.query('BEGIN');
    const params = [itemId];
    const push = (v) => { params.push(v); return params.length; };
    const { rows: locked } = await client.query(
      `SELECT i.* FROM board_items i WHERE i.id = $1 AND ${scopeSql(q, 'update', 'i', push)} FOR UPDATE OF i`, params);
    before = locked[0];
    if (!before) {
      await client.query('ROLLBACK');
      return reply.code(404).send({ error: 'Nie znaleziono zadania albo brak do niego dostępu' });
    }

    const sets = [];
    const vals = [itemId];
    const set = (col, v, cast = '') => { vals.push(v); sets.push(`"${col}" = $${vals.length}${cast}`); };

    if (cells) {
      const { rows: cols } = await client.query(
        `SELECT id, name, type FROM board_columns WHERE board_id = $1`, [before.board_id]);
      const byId = new Map(cols.map((c) => [String(c.id).toLowerCase(), c]));
      const patch = {};
      for (const [k, v] of Object.entries(cells)) {
        const col = byId.get(String(k).toLowerCase());
        if (!col) throw bad(`Kolumna ${k} nie należy do tej tablicy`);
        checkCellValue(col, v);
        patch[String(col.id)] = v; // klucz w pisowni z bazy (bez duplikatów różniących się wielkością liter)
      }
      set('cells', JSON.stringify(mergeCells(before.cells, patch)), '::jsonb');
    }
    if ('name' in fields) set('name', fields.name);
    if ('description' in fields) set('description', fields.description);

    const parentId = 'parent_item_id' in fields ? fields.parent_item_id : before.parent_item_id;
    if ('parent_item_id' in fields && fields.parent_item_id != null) {
      if (String(fields.parent_item_id) === String(before.id)) throw bad('Element nie może być swoim podelementem');
      const { rows: chain } = await client.query(
        `WITH RECURSIVE up AS (
           SELECT id, parent_item_id, board_id, 1 AS depth FROM board_items WHERE id = $1
           UNION ALL
           SELECT b.id, b.parent_item_id, b.board_id, up.depth + 1 FROM board_items b JOIN up ON b.id = up.parent_item_id
            WHERE up.depth < 50)
         SELECT id, board_id FROM up`, [fields.parent_item_id]);
      if (!chain.length || String(chain[0].board_id) !== String(before.board_id)) throw bad('Element nadrzędny musi być na tej samej tablicy');
      if (chain.some((r) => String(r.id) === String(before.id))) throw bad('Takie przeniesienie utworzyłoby pętlę podelementów');
    }
    if ('parent_item_id' in fields) set('parent_item_id', fields.parent_item_id);

    if ('group_id' in fields) {
      if (fields.group_id == null) {
        if (parentId == null) throw bad('Element musi należeć do grupy');
      } else {
        const { rows: g } = await client.query(
          `SELECT 1 FROM board_groups WHERE id = $1 AND board_id = $2`, [fields.group_id, before.board_id]);
        if (!g.length) throw bad('Grupa nie należy do tej tablicy');
      }
      set('group_id', fields.group_id);
    }

    if ('event_id' in fields) {
      if (fields.event_id != null) {
        // Typ events.id różni się między bazami (INTEGER/UUID) — zły format = brak wydarzenia,
        // bez psucia transakcji (savepoint).
        let found = [];
        await client.query('SAVEPOINT ev');
        try {
          ({ rows: found } = await client.query(`SELECT 1 FROM events WHERE id = $1`, [String(fields.event_id)]));
          await client.query('RELEASE SAVEPOINT ev');
        } catch {
          await client.query('ROLLBACK TO SAVEPOINT ev').catch(() => {});
          found = [];
        }
        if (!found.length) throw bad('Nie ma takiego wydarzenia');
      }
      set('event_id', fields.event_id);
    }

    if (!sets.length) throw bad('Brak zmian');
    const { rows: [updated] } = await client.query(
      `UPDATE board_items SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, vals);
    await client.query('COMMIT');
    item = updated;
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return sendFnError(reply, err, req, '[board-item-patch]');
  } finally {
    client?.release?.();
  }

  // Realtime: inne karty tej tablicy (prywatna tablica — tylko właściciel i edytorzy).
  try {
    const audience = await boardAudience(req.db, 'board_items', [item]).catch(() => new Set());
    emitChange(req.tenant.slug, 'board_items', 'update', [item], audience ? { audience } : {});
  } catch { /* realtime nieobowiązkowy */ }

  // Nowo przypisani w kolumnach „Osoby”: wpis + push. Fire-and-forget.
  if (hasPeopleLike(item.cells)) {
    const prep = {
      op: 'update', values: [{ cells: item.cells }],
      before: new Map([[String(before.id), { id: before.id, board_id: before.board_id, name: before.name, cells: before.cells }]]),
    };
    notifyBoardAssignees({ db: req.db, tenant: req.tenant, prep, data: [item], rowCount: 1, actor: req.user, log: req.log })
      .catch((err) => req.log?.error?.({ err }, '[board-item-patch] powiadomienia'));
  }
  return { item };
}
