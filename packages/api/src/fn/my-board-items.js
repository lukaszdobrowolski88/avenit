// Kalendarz / pulpit / iCal: elementy tablic Z TERMINEM, do których jestem przypisany (kolumna „Osoby”).
// Tylko tablice, które widzę: nie-archiwalne, nie-szablony, nie-prywatne (albo moje/edytor — ta sama
// reguła co /api/db, boardsScope) i z modułu, do którego mam dostęp (tablica służby → moduł służby,
// także tablica z importu po source_kind; Projekty → module:boards).
//
// Body: { from?: 'YYYY-MM-DD', to?: 'YYYY-MM-DD', exclude_board_id?: uuid }
// → { items: [{ id, board_id, board_name, module_key, module_path, source_kind, name, date, end,
//               status: { title, color } | null, done, link }] }  — posortowane po terminie.
//   link — jedna reguła taskItemLink (packages/shared/src/lib/taskLinks.js).
//   done — isDoneLabel (packages/shared/src/lib/boardStatus.js).
//
// „Przypisany” = board_items.assignee_emails (text[] z triggera, migracja 094; indeks GIN) — bez
// przeglądania cells każdego elementu. Wszystkie filtry (tablice, uprawnienia, zakres dat,
// exclude_board_id) są w SQL PRZED limitem; termin liczony w SQL z kolumny daty tablicy.
import { boardScope } from '../dataapi/boardsScope.js';
import { callerAccess } from './board-import-legacy.js';
import { taskItemLink, modulePathFor } from '@avenit/shared/src/lib/taskLinks.js';
import { isDoneLabel } from '@avenit/shared/src/lib/boardStatus.js';
import { boardModuleKey } from '@avenit/shared/src/permissions/moduleScope.js';

export const name = 'my-board-items';
export const method = 'POST';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const LIMIT = 1500;

// „Przypisany do $p” — natywnie (assignee_emails) albo, w bazie sprzed migracji 094, skanem komórek.
export function assignedPredicate(alias, p, native = true) {
  if (native) return `${alias}.assignee_emails @> ARRAY[$${p}::text]`;
  return `EXISTS (
          SELECT 1 FROM board_columns c_
           WHERE c_.board_id = ${alias}.board_id AND c_.type = 'people'
             AND EXISTS (
               SELECT 1 FROM jsonb_array_elements(
                 CASE WHEN jsonb_typeof(${alias}.cells -> (c_.id::text)) = 'array' THEN ${alias}.cells -> (c_.id::text) ELSE '[]'::jsonb END
               ) p_ WHERE lower(CASE jsonb_typeof(p_) WHEN 'object' THEN p_ ->> 'email' ELSE p_ #>> '{}' END) = $${p}))`;
}

// Kolumna terminu tablicy (pierwsza „data” z rolą due, potem dowolna data, potem oś czasu) i termin
// elementu: due = dzień (YYYY-MM-DD), due_end = koniec osi czasu (albo NULL). Użycie:
//   FROM board_items i ${DUE_COLUMN_LATERAL('i')} … SELECT ${DUE_COLUMNS('i')}
export const DUE_COLUMN_LATERAL = (i) => `JOIN LATERAL (
      SELECT c.id, c.type FROM board_columns c
       WHERE c.board_id = ${i}.board_id AND c.type IN ('date', 'timeline')
       ORDER BY (c.type = 'date' AND c.settings ->> 'role' = 'due') DESC, (c.type = 'date') DESC,
                c.display_order NULLS LAST, c.id
       LIMIT 1) dc ON true`;
export const DUE_COLUMNS = (i) => `CASE WHEN dc.type = 'timeline'
           THEN coalesce(left(${i}.cells -> (dc.id::text) ->> 'start', 10), left(${i}.cells -> (dc.id::text) ->> 'end', 10))
           ELSE left(${i}.cells ->> (dc.id::text), 10) END AS due,
         CASE WHEN dc.type = 'timeline' THEN left(${i}.cells -> (dc.id::text) ->> 'end', 10) END AS due_end`;

// Uprawnienie potrzebne, by otworzyć element tablicy: tablica służby (module_key albo tablica
// z importu po source_kind, Kalendarz: 'tasks') → moduł służby (app_modules.resource_key), Projekty → module:boards.
export function boardCapability(board, modByKey = new Map()) {
  const key = boardModuleKey(board);
  if (!key) return 'module:boards';
  return modByKey.get(key)?.resource_key || `module:${key}`;
}

// Zapytania (czyste — testy). Krok 1: tablice kandydujące (widoczne, aktywne, z moimi elementami).
export function candidateBoardsSql({ email, excludeBoardId = null, native = true }) {
  const params = [email];
  const push = (v) => { params.push(v); return params.length; };
  const visible = boardScope('boards', { email }).select('b', push);
  const ex = excludeBoardId ? ` AND b.id <> $${push(excludeBoardId)}::uuid` : '';
  const sql = `SELECT b.id, b.name, b.module_key, b.source_kind
       FROM boards b
      WHERE coalesce(b.is_archived, false) = false
        AND coalesce(b.is_template, false) = false
        AND ${visible}${ex}
        AND EXISTS (SELECT 1 FROM board_items i WHERE i.board_id = b.id AND i.parent_item_id IS NULL AND ${assignedPredicate('i', 1, native)})`;
  return { sql, params };
}

// Krok 2: moje elementy z terminem na dozwolonych tablicach — zakres dat przed limitem, po terminie.
export function myItemsSql({ email, boardIds, from = null, to = null, native = true, limit = LIMIT }) {
  const params = [email, boardIds];
  const push = (v) => { params.push(v); return params.length; };
  const range = [
    from ? `coalesce(x.due_end, x.due) >= $${push(from)}` : null,
    to ? `x.due <= $${push(to)}` : null,
  ].filter(Boolean).map((c) => ` AND ${c}`).join('');
  const sql = `SELECT x.* FROM (
      SELECT i.id, i.board_id, i.name, i.cells, ${DUE_COLUMNS('i')}
        FROM board_items i
        ${DUE_COLUMN_LATERAL('i')}
       WHERE i.board_id = ANY($2::uuid[]) AND i.parent_item_id IS NULL
         AND ${assignedPredicate('i', 1, native)}
    ) x
   WHERE x.due ~ '^\\d{4}-\\d{2}-\\d{2}$'${range}
   ORDER BY x.due, x.due_end NULLS FIRST, x.name, x.id
   LIMIT ${Number(limit) || LIMIT}`;
  return { sql, params };
}

// Etykieta statusu elementu: pierwsza kolumna statusu tablicy.
export function statusOf(cells, statusCol) {
  if (!statusCol) return null;
  const v = cells?.[statusCol.id];
  return (statusCol.settings?.labels || []).find((l) => l?.id === v) || null;
}

// Czy baza ma board_items.assignee_emails (migracja 094) — pamięć per pula. Bez kolumny (42703)
// zapytanie wraca do skanu komórek, więc kolejność wdrożenia API i migracji nie ma znaczenia.
let nativeKnown = new WeakMap();
export async function queryAssigned(db, build) {
  if (nativeKnown.get(db) !== false) {
    try {
      const { sql, params } = build(true);
      return await db.query(sql, params);
    } catch (err) {
      if (err?.code !== '42703') throw err;
      try { nativeKnown.set(db, false); } catch { /* db nie jest obiektem */ }
    }
  }
  const { sql, params } = build(false);
  return db.query(sql, params);
}
export function _resetAssignedCache() { nativeKnown = new WeakMap(); }

// Elementy z terminem przypisane do `email` na tablicach, które ta osoba widzi.
// can(capability) — jak w callerAccess (admin → zawsze true). Używane też przez ical.js.
export async function listMyBoardItems({ db, email, can, from = null, to = null, excludeBoardId = null }) {
  const me = String(email || '').trim().toLowerCase();
  if (!me) return [];
  const exclude = excludeBoardId && UUID_RE.test(String(excludeBoardId)) ? String(excludeBoardId) : null;

  const { rows: candidates } = await queryAssigned(db, (native) => candidateBoardsSql({ email: me, excludeBoardId: exclude, native }));
  if (!candidates.length) return [];
  const { rows: mods } = await db.query('SELECT key, path, resource_key FROM app_modules').catch(() => ({ rows: [] }));
  const modByKey = new Map(mods.map((m) => [m.key, m]));
  const paths = Object.fromEntries(mods.filter((m) => m.path).map((m) => [m.key, m.path]));
  const boards = candidates.filter((b) => can(boardCapability(b, modByKey)));
  if (!boards.length) return [];
  const boardById = new Map(boards.map((b) => [String(b.id), b]));
  const boardIds = [...boardById.keys()];

  const [{ rows }, { rows: statusCols }] = await Promise.all([
    queryAssigned(db, (native) => myItemsSql({ email: me, boardIds, from, to, native })),
    db.query(`SELECT id, board_id, settings FROM board_columns
               WHERE board_id = ANY($1::uuid[]) AND type = 'status' ORDER BY display_order NULLS LAST, id`, [boardIds]),
  ]);
  const statusByBoard = new Map();
  for (const c of statusCols) if (!statusByBoard.has(String(c.board_id))) statusByBoard.set(String(c.board_id), c);

  return rows.filter((it) => boardById.has(String(it.board_id))).map((it) => {
    const board = boardById.get(String(it.board_id));
    const label = statusOf(it.cells, statusByBoard.get(String(it.board_id)));
    const key = boardModuleKey(board);
    return {
      id: it.id, board_id: board.id, board_name: board.name, module_key: board.module_key || key || null,
      module_path: key ? modulePathFor(key, paths) : null,
      source_kind: board.source_kind || null, name: it.name || '',
      date: it.due, end: it.due_end && it.due_end !== it.due ? it.due_end : null,
      status: label ? { title: label.title, color: label.color } : null,
      done: isDoneLabel(label),
      link: taskItemLink(board, it.id, paths),
    };
  });
}

export default async function handler(req, reply) {
  if (!req.db || !req.tenant) return reply.code(404).send({ error: 'Nieznany tenant' });
  if (!req.user?.id) return reply.code(401).send({ error: 'Brak sesji' });
  const from = YMD.test(String(req.body?.from || '')) ? req.body.from : null;
  const to = YMD.test(String(req.body?.to || '')) ? req.body.to : null;
  const excludeBoardId = req.body?.exclude_board_id ? String(req.body.exclude_board_id) : null;

  const access = await callerAccess(req);
  if (!access) return reply.code(403).send({ error: 'Brak konta' });
  try {
    const items = await listMyBoardItems({ db: req.db, email: access.me.email, can: access.can, from, to, excludeBoardId });
    return { items };
  } catch (err) {
    req.log?.error?.(err, '[my-board-items]');
    return reply.code(500).send({ error: 'Nie udało się wczytać zadań z tablic' });
  }
}
