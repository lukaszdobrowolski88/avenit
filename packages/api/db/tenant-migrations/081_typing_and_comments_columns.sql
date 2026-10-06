-- 081: kolumny używane przez kod, których brakowało w bazie (wykryte statycznym testem zgodności).
-- Komunikator: wskaźnik „pisze…” zapisuje user_email + started_at (upsert po conversation_id,user_email);
-- tabela miała tylko user_id/is_typing, więc każdy zapis kończył się błędem.
ALTER TABLE typing_status
  ADD COLUMN IF NOT EXISTS user_email TEXT,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT NOW();
CREATE UNIQUE INDEX IF NOT EXISTS typing_status_conversation_user_email_key ON typing_status (conversation_id, user_email);

-- Grupy domowe: komentarze do zadań zapisują autora jako tekst.
ALTER TABLE home_group_task_comments ADD COLUMN IF NOT EXISTS author_name TEXT;
