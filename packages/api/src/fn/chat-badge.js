// Komunikator — plakietka ikony aplikacji mobilnej.
// POST /api/fn/chat-badge {} → { count } — liczba MOICH rozmów z nieprzeczytanymi wiadomościami
// (src/dataapi/komunikatorBadge.js). Mobilka synchronizuje plakietkę po powrocie na wierzch.
// Czyta wyłącznie wiersze zalogowanej osoby — bez dodatkowego uprawnienia (bez modułu = 0).
import { unreadBadgeCount } from '../dataapi/komunikatorBadge.js';

export const name = 'chat-badge';

export default async function handler(req, reply) {
  const count = await unreadBadgeCount(req.db, req.user?.email);
  return reply.send({ count });
}
