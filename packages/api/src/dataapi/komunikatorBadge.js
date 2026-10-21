// Plakietka na ikonie aplikacji mobilnej: liczba rozmów z nieprzeczytanymi wiadomościami.
// Ta sama reguła co lista rozmów w aplikacji (filtr „Nieprzeczytane”, unreadConversationsBadge
// w packages/mobile/src/features/messenger/logic.ts): rozmowa nie w archiwum, w której jest
// cudza, nieusunięta, niesystemowa wiadomość nowsza niż moje „przeczytane” (last_read_at; bez
// niego — dołączenie). Wysyłana w każdym pushu wiadomości (badge) i przez fn chat-badge.
export const UNREAD_BADGE_SQL = `
  SELECT count(*)::int AS n
    FROM conversation_participants cp
   WHERE lower(cp.user_email) = lower($1)
     AND COALESCE(cp.archived, false) = false
     AND EXISTS (
       SELECT 1 FROM messages m
        WHERE m.conversation_id = cp.conversation_id
          AND m.deleted_at IS NULL
          AND lower(m.sender_email) <> lower($1)
          AND COALESCE(m.message_type, 'text') <> 'system'
          AND m.created_at > COALESCE(cp.last_read_at, cp.joined_at, '-infinity'::timestamptz))`;

// Liczba (0 przy błędzie — plakietka nie może zepsuć powiadomienia).
export async function unreadBadgeCount(db, email) {
  if (!email) return 0;
  try {
    const { rows } = await db.query(UNREAD_BADGE_SQL, [String(email)]);
    return Math.max(0, Number(rows[0]?.n) || 0);
  } catch {
    return 0;
  }
}
