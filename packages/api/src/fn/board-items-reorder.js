// Kolejność elementów w grupie tablicy — JEDNO zapytanie zamiast N osobnych update przez /api/db
// (przeciąganie w Tabeli/Kanbanie wysyłało update każdego elementu grupy; część potrafiła się nie
// zapisać i po odświeżeniu kolejność się mieszała).
//
// Body: { board_id, group_id, ordered_ids: [uuid, …] }
//   ordered_ids — elementy grupy w nowej kolejności; każdy dostaje display_order = pozycja (od 0)
//   i group_id = group_id (przeniesienie między grupami w tym samym kroku).
// → { ok: true, updated } — liczba zmienionych elementów.
// Błędy: 400 (dane / grupa spoza tablicy), 403 (brak prawa zapisu elementów), 404 (żaden element
// nie pasuje — tablica niewidoczna albo elementy z innej tablicy).
// Dostęp jak update board_items przez /api/db (registry.canAccess + prywatne tablice + zakres służby).
import { ApiError } from '../dataapi/querybuilder.js';
import { boardAudience } from '../dataapi/boardsScope.js';
import { emitChange } from '../realtime/hub.js';
import { actorOf, boardWriteScope, scopeSql, sendFnError, isUuid } from './board-item-patch.js';

export const name = 'board-items-reorder';
export const method = 'POST';

const MAX_IDS = 2000;

export function parseReorder(body) {
  const b = body && typeof body === 'object' ? body : {};
  if (!isUuid(b.board_id)) throw new ApiError(400, 'Brak albo nieprawidłowe board_id');
  if (!isUuid(b.group_id)) throw new ApiError(400, 'Brak albo nieprawidłowe group_id');
  if (!Array.isArray(b.ordered_ids) || !b.ordered_ids.length) throw new ApiError(400, 'ordered_ids musi być niepustą listą');
  if (b.ordered_ids.length > MAX_IDS) throw new ApiError(400, 'Za dużo elementów naraz');
  if (!b.ordered_ids.every(isUuid)) throw new ApiError(400, 'Nieprawidłowy identyfikator elementu');
  const ids = b.ordered_ids.map((x) => x.toLowerCase());
  if (new Set(ids).size !== ids.length) throw new ApiError(400, 'Powtórzony element na liście');
  return { boardId: b.board_id, groupId: b.group_id, ids };
}

// Jedno UPDATE … FROM unnest(…) WITH ORDINALITY — pozycja z listy, tylko elementy tej tablicy
// i w zakresie wołającego (q.__ownerScope: prywatne tablice + zakres służby).
export function reorderSql(q, { boardId, groupId, ids }) {
  const params = [boardId, groupId, ids];
  const push = (v) => { params.push(v); return params.length; };
  const scope = scopeSql(q, 'update', 't', push);
  const sql = `UPDATE board_items AS t
      SET display_order = (o.ord - 1)::int, group_id = $2
     FROM unnest($3::uuid[]) WITH ORDINALITY AS o(id, ord)
    WHERE t.id = o.id AND t.board_id = $1 AND ${scope}
    RETURNING t.*`;
  return { sql, params };
}

export default async function handler(req, reply) {
  if (!req.db || !req.tenant) return reply.code(404).send({ error: 'Nieznany tenant' });
  if (!req.user?.id) return reply.code(401).send({ error: 'Brak sesji' });
  let rows;
  try {
    const input = parseReorder(req.body);
    const user = await actorOf(req);
    if (!user) return reply.code(403).send({ error: 'Brak konta' });
    const { q } = await boardWriteScope(req, user, {
      table: 'board_items', op: 'update', values: { display_order: 0, group_id: input.groupId },
      filters: [{ type: 'eq', column: 'board_id', value: input.boardId }],
    });
    const { rows: g } = await req.db.query(
      `SELECT 1 FROM board_groups WHERE id = $1 AND board_id = $2`, [input.groupId, input.boardId]);
    if (!g.length) throw new ApiError(400, 'Grupa nie należy do tej tablicy');
    const { sql, params } = reorderSql(q, input);
    ({ rows } = await req.db.query(sql, params));
    if (!rows.length) return reply.code(404).send({ error: 'Nie znaleziono elementów albo brak dostępu do tablicy' });
  } catch (err) {
    return sendFnError(reply, err, req, '[board-items-reorder]');
  }
  try {
    const audience = await boardAudience(req.db, 'board_items', rows).catch(() => new Set());
    emitChange(req.tenant.slug, 'board_items', 'update', rows, audience ? { audience } : {});
  } catch { /* realtime nieobowiązkowy */ }
  return { ok: true, updated: rows.length };
}
