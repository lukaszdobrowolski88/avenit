// Komentarz (aktualizacja) do elementu tablicy — autor i tablica ustawiane przez SERWER.
//
// Do 2026-10 klient wstawiał board_item_updates sam (author_email/author_name z przeglądarki, board_id
// z widoku) i sam tworzył powiadomienia o @wzmiankach — każdemu, kogo wpisał, także osobom bez dostępu
// do tablicy, z linkiem zależnym od strony, na której akurat był.
//
// Body: { item_id, body, parent_id?, mentions?: [email] }
//   parent_id — odpowiedź w wątku: komentarz tego samego elementu.
//   mentions  — @wzmianki: powiadomienie (dzwonek, typ 'mention') + push tylko dla aktywnych kont,
//               które widzą tablicę i mogą czytać jej elementy; bez autora; e-maile małymi literami.
// → { update } — wstawiony wiersz board_item_updates.
// Błędy: 400 (dane), 403 (brak prawa komentowania), 404 (brak elementu).
// Dostęp jak insert board_item_updates przez /api/db: registry.canAccess(insert, allowModuleScope)
// (w zakresie służby: komentarze zadań tej służby), prywatne tablice (enforceBoardWrite).
import { ApiError } from '../dataapi/querybuilder.js';
import { boardAudience, enforceBoardWrite } from '../dataapi/boardsScope.js';
import { boardViewers, deliverNotifications, displayNameOf, modulePathsFor } from '../dataapi/boardNotify.js';
import { filterUserContent } from '../lib/moderation.js';
import { emitChange } from '../realtime/hub.js';
import { taskItemLink } from '@avenit/shared/src/lib/taskLinks.js';
import { actorOf, boardWriteScope, sendFnError, isUuid } from './board-item-patch.js';

export const name = 'board-comment';
export const method = 'POST';

const MAX_BODY = 20_000;
const MAX_MENTIONS = 50;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseComment(body) {
  const b = body && typeof body === 'object' ? body : {};
  if (!isUuid(b.item_id)) throw new ApiError(400, 'Brak albo nieprawidłowe item_id');
  const text = typeof b.body === 'string' ? b.body : '';
  if (!text.trim()) throw new ApiError(400, 'Komentarz jest pusty');
  if (text.length > MAX_BODY) throw new ApiError(400, 'Komentarz jest za długi');
  if (b.parent_id != null && !isUuid(b.parent_id)) throw new ApiError(400, 'Nieprawidłowe parent_id');
  if (b.mentions != null && !Array.isArray(b.mentions)) throw new ApiError(400, 'mentions musi być listą e-maili');
  const mentions = [...new Set((b.mentions || [])
    .map((e) => String(e ?? '').trim().toLowerCase())
    .filter((e) => EMAIL_RE.test(e)))].slice(0, MAX_MENTIONS);
  return { itemId: b.item_id, text, parentId: b.parent_id || null, mentions };
}

// Treść powiadomienia: pierwsze 140 znaków komentarza w jednej linii.
export const mentionPreview = (text) => {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > 140 ? `${t.slice(0, 139)}…` : t;
};

export default async function handler(req, reply) {
  if (!req.db || !req.tenant) return reply.code(404).send({ error: 'Nieznany tenant' });
  if (!req.user?.id) return reply.code(401).send({ error: 'Brak sesji' });
  let update;
  let item;
  let board;
  let input;
  let author;
  try {
    input = parseComment(req.body);
    const user = await actorOf(req);
    if (!user) return reply.code(403).send({ error: 'Brak konta' });

    ({ rows: [item] } = await req.db.query(`SELECT id, board_id, name FROM board_items WHERE id = $1`, [input.itemId]));
    if (!item) return reply.code(404).send({ error: 'Nie znaleziono zadania' });

    author = {
      email: user.email,
      name: String(user.full_name || '').trim() || String(user.name || '').trim() || user.email,
    };
    const values = {
      item_id: item.id, board_id: item.board_id, parent_update_id: input.parentId,
      author_email: author.email, author_name: author.name, body: input.text,
      mentions: input.mentions, likes: [],
    };
    filterUserContent({ table: 'board_item_updates', op: 'insert', values });
    const q = { table: 'board_item_updates', op: 'insert', values };
    await boardWriteScope(req, user, q);   // prawo komentowania (+ zakres służby: tablica tej służby)
    await enforceBoardWrite(q, req);        // prywatna tablica — tylko właściciel i edytorzy

    if (input.parentId) {
      const { rows } = await req.db.query(
        `SELECT 1 FROM board_item_updates WHERE id = $1 AND item_id = $2`, [input.parentId, item.id]);
      if (!rows.length) throw new ApiError(400, 'Odpowiedź musi dotyczyć komentarza tego samego zadania');
    }

    ({ rows: [update] } = await req.db.query(
      `INSERT INTO board_item_updates (item_id, board_id, parent_update_id, author_email, author_name, body, mentions, likes)
       VALUES ($1, $2, $3, $4, $5, $6, $7::text[], '{}'::text[]) RETURNING *`,
      [values.item_id, values.board_id, values.parent_update_id, values.author_email, values.author_name, values.body, values.mentions]));
    ({ rows: [board] } = await req.db.query(
      `SELECT id, name, module_key, source_kind, visibility, owner_email, created_by, editors FROM boards WHERE id = $1`, [item.board_id]));
  } catch (err) {
    return sendFnError(reply, err, req, '[board-comment]');
  }

  try {
    const audience = await boardAudience(req.db, 'board_item_updates', [update]).catch(() => new Set());
    emitChange(req.tenant.slug, 'board_item_updates', 'insert', [update], audience ? { audience } : {});
  } catch { /* realtime nieobowiązkowy */ }

  // @wzmianki — fire-and-forget (błąd powiadomienia nie cofa komentarza).
  if (input.mentions.length && board) {
    notifyMentions({ req, board, item, update, author, mentions: input.mentions })
      .catch((err) => req.log?.error?.({ err }, '[board-comment] wzmianki'));
  }
  return { update };
}

// deps (testy): { canAccess, sendPush, emit }.
export async function notifyMentions({ req, board, item, update, author, mentions, deps = {} }) {
  const db = req.db;
  const viewers = await boardViewers({
    db, tenant: req.tenant, pairs: mentions.map((email) => ({ email, board })), actorEmail: author.email, deps,
  });
  if (!viewers.length) return { sent: 0 };
  const [name, paths] = await Promise.all([displayNameOf(db, author.email), modulePathsFor(db, [board])]);
  const link = taskItemLink(board, item.id, paths);
  const itemName = String(item.name || '').trim() || 'Zadanie';
  const data = { item_id: item.id, board_id: item.board_id, update_id: update.id };
  const entries = viewers.map((v) => ({
    user_email: v.account.email,
    type: 'mention',
    title: `${name || author.name} wspomniał(a) o Tobie`,
    body: mentionPreview(update.body) || itemName,
    link,
    data,
    push: { type: 'task', mention: true, ...data },
  }));
  return deliverNotifications({ db, tenant: req.tenant, entries, deps, log: req.log });
}
