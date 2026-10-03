-- „Przeczytane/doręczone" w komunikatorze — kod (web + mobile) upsertuje po user_email
-- z onConflict (message_id, user_email), ale żywa tabela miała tylko user_id → upsert/select
-- waliły się („column user_email does not exist"). Dodajemy user_email + unikalny indeks
-- (message_id, user_email), żeby ON CONFLICT działał. user_id zostaje (nullable, FK) dla
-- zgodności wstecz. VPS-safe: ADD COLUMN IF NOT EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS.
-- NULL-e w user_email (stare wiersze user_id) są w indeksie unikalnym traktowane jako różne,
-- więc nie kolidują.

ALTER TABLE message_read_receipts ADD COLUMN IF NOT EXISTS user_email text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_message_read_receipts_msg_email
  ON message_read_receipts (message_id, user_email);
