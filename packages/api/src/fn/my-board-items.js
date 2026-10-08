// Kalendarz: elementy tablic Z TERMINEM, do których jestem przypisany (kolumna „Osoby”).
// Tylko tablice, które widzę: nie-archiwalne, nie-prywatne (albo moje/edytor — ta sama reguła co
// /api/db, boardsScope) i z modułu, do którego mam dostęp (tablica modułu → uprawnienie modułu,
// Projekty → module:boards).
//
// Body: { from?: 'YYYY-MM-DD', to?: 'YYYY-MM-DD', exclude_board_id?: uuid }
// → { items: [{ id, board_id, board_name, module_key, module_path, source_kind, name, date, end,
//               status: { title, color } | null, done, link }] }
//   link: zadanie w module → <ścieżka modułu>?item=<id> (ModuleBoard otwiera je z zakładki Zadania),
//         Projekty → /projekty?board=<id>&item=<id>.
import { boardScope } from '../dataapi/boardsScope.js';
import { callerAccess } from './board-import-legacy.js';

export const name = 'my-board-items';
export const method = 'POST';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const LIMIT = 1500;

// Termin elementu z pierwszej kolumny daty (albo osi czasu). Czyste — testy.
export function itemDates(cells, columns) {
  const dateCol = columns.find((c) => c.type === 'date' && c.settings?.role === 'due')
    || columns.find((c) => c.type === 'date')
    || columns.find((c) => c.type === 'timeline');
  if (!dateCol) return null;
  const v = cells?.[dateCol.id];
  if (!v) return null;
  if (dateCol.type === 'timeline') {
    const start = typeof v?.start === 'string' ? v.start.slice(0, 10) : null;
    const end = typeof v?.end === 'string' ? v.end.slice(0, 10) : null;
    if (!start && !end) return null;
    return { date: start || end, end: end && end !== (start || end) ? end : null };
  }
  const d = String(v).slice(0, 10);
  return YMD.test(d) ? { date: d, end: null } : null;
}

// Tylko tablica zadań modułu (source_kind *_tasks) otwiera się z ?item= na stronie modułu —
// ta sama reguła co powiadomienia (dataapi/boardNotify.js itemLink) i pulpit (myBoardTasks.js).
export function itemLink(item, board, modulePath) {
  if (board.module_key && modulePath && /_tasks$/.test(String(board.source_kind || ''))) return `${modulePath}${modulePath.includes('?') ? '&' : '?'}item=${item.id}`;
  return `/projekty?board=${board.id}&item=${item.id}`;
}

// Elementy z terminem przypisane do `email` na tablicach, które ta osoba widzi.
// can(capability) — jak w callerAccess (admin → zawsze true). Do użycia także np. w ical.js.
export async function listMyBoardItems({ db, email, can, from = null, to = null, excludeBoardId = null }) {
  const me = String(email || '').toLowerCase();
  if (!me) return [];
  const params = [me];
  const push = (v) => { params.push(v); return params.length; };
  const visible = boardScope('boards', { email: me }).select('b', push);
  const { rows } = await db.query(
    `SELECT i.id, i.board_id, i.name, i.cells
       FROM board_items i
       JOIN boards b ON b.id = i.board_id
      WHERE i.parent_item_id IS NULL
        AND coalesce(b.is_archived, false) = false
        AND coalesce(b.is_template, false) = false
        AND ${visible}
        AND EXISTS (
          SELECT 1 FROM board_columns c
           WHERE c.board_id = i.board_id AND c.type = 'people'
             AND EXISTS (
               SELECT 1 FROM jsonb_array_elements(
                 CASE WHEN jsonb_typeof(i.cells -> (c.id::text)) = 'array' THEN i.cells -> (c.id::text) ELSE '[]'::jsonb END
               ) p_ WHERE jsonb_typeof(p_) = 'object' AND lower(p_ ->> 'email') = $1))
      LIMIT ${LIMIT}`,
    params);
  if (!rows.length) return [];

  const boardIds = [...new Set(rows.map((r) => String(r.board_id)))].filter((id) => id !== excludeBoardId);
  if (!boardIds.length) return [];
  const [{ rows: boards }, { rows: cols }, { rows: mods }] = await Promise.all([
    db.query('SELECT id, name, module_key, source_kind FROM boards WHERE id::text = ANY($1::text[])', [boardIds]),
    db.query(`SELECT id, board_id, type, settings, display_order FROM board_columns
               WHERE board_id::text = ANY($1::text[]) AND type IN ('date', 'timeline', 'status') ORDER BY display_order`, [boardIds]),
    db.query('SELECT key, path, resource_key FROM app_modules').catch(() => ({ rows: [] })),
  ]);
  const modByKey = new Map(mods.map((m) => [m.key, m]));
  const boardById = new Map();
  for (const b of boards) {
    // Tablica modułu → dostęp do modułu; Projekty → module:boards.
    const cap = b.module_key ? (modByKey.get(b.module_key)?.resource_key || `module:${b.module_key}`) : 'module:boards';
    if (can(cap)) boardById.set(String(b.id), b);
  }
  const colsByBoard = new Map();
  for (const c of cols) {
    const k = String(c.board_id);
    if (!colsByBoard.has(k)) colsByBoard.set(k, []);
    colsByBoard.get(k).push(c);
  }

  const items = [];
  for (const it of rows) {
    const board = boardById.get(String(it.board_id));
    if (!board) continue;
    const bc = colsByBoard.get(String(it.board_id)) || [];
    const when = itemDates(it.cells, bc);
    if (!when) continue;
    const last = when.end || when.date;
    if (from && last < from) continue;
    if (to && when.date > to) continue;
    const statusCol = bc.find((c) => c.type === 'status');
    const label = statusCol ? (statusCol.settings?.labels || []).find((l) => l.id === it.cells?.[statusCol.id]) : null;
    const modulePath = board.module_key ? modByKey.get(board.module_key)?.path || null : null;
    items.push({
      id: it.id, board_id: board.id, board_name: board.name, module_key: board.module_key || null, module_path: modulePath,
      source_kind: board.source_kind || null, name: it.name || '', date: when.date, end: when.end,
      status: label ? { title: label.title, color: label.color } : null,
      done: !!label && /gotow|done|zrobion|ukończ|ukoncz/i.test(label.title || ''),
      link: itemLink(it, board, modulePath),
    });
  }
  return items;
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
