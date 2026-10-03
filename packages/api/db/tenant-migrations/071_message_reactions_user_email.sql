-- 071: message_reactions — kolumna user_email (jak 069 dla message_read_receipts).
-- 064 tworzyło tabelę z user_email przez CREATE TABLE IF NOT EXISTS, ale na tenantach
-- przeniesionych z Supabase tabela już istniała z user_id (uuid) — więc się nie zmieniła.
-- Web (useReactions.js) i mobile (messenger/api.ts) czytają i zapisują user_email,
-- przez co reakcje nie działały nigdzie (select → 42703, insert → błąd).
-- user_id jest nullable, a tabela na schwro pusta — dodanie kolumny jest bezpieczne.

ALTER TABLE message_reactions ADD COLUMN IF NOT EXISTS user_email text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_message_reactions_msg_email_emoji
  ON message_reactions (message_id, user_email, emoji);
