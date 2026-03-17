-- ============================================
-- Tabele dla statusu pisania i potwierdzeń przeczytania
-- ============================================

-- ============================================
-- 1. Tabela typing_status (kto aktualnie pisze)
-- ============================================
CREATE TABLE IF NOT EXISTS typing_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(conversation_id, user_email)
);

-- Indeksy
CREATE INDEX IF NOT EXISTS idx_typing_status_conversation ON typing_status(conversation_id);
CREATE INDEX IF NOT EXISTS idx_typing_status_started ON typing_status(started_at);

-- RLS
ALTER TABLE typing_status ENABLE ROW LEVEL SECURITY;

-- Uczestnicy konwersacji mogą widzieć status pisania
DROP POLICY IF EXISTS "Participants can view typing status" ON typing_status;
CREATE POLICY "Participants can view typing status"
ON typing_status FOR SELECT
USING (
    conversation_id IN (
        SELECT conversation_id FROM conversation_participants
        WHERE user_email = auth.jwt() ->> 'email'
    )
);

-- Użytkownik może dodawać swój status pisania
DROP POLICY IF EXISTS "Users can insert own typing status" ON typing_status;
CREATE POLICY "Users can insert own typing status"
ON typing_status FOR INSERT
WITH CHECK (user_email = auth.jwt() ->> 'email');

-- Użytkownik może usuwać swój status pisania
DROP POLICY IF EXISTS "Users can delete own typing status" ON typing_status;
CREATE POLICY "Users can delete own typing status"
ON typing_status FOR DELETE
USING (user_email = auth.jwt() ->> 'email');

-- Realtime dla typing_status
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'typing_status'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE typing_status;
    END IF;
END $$;

-- ============================================
-- 2. Tabela message_read_receipts (potwierdzenia przeczytania)
-- ============================================
CREATE TABLE IF NOT EXISTS message_read_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    read_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(message_id, user_email)
);

-- Indeksy
CREATE INDEX IF NOT EXISTS idx_read_receipts_message ON message_read_receipts(message_id);
CREATE INDEX IF NOT EXISTS idx_read_receipts_user ON message_read_receipts(user_email);

-- RLS
ALTER TABLE message_read_receipts ENABLE ROW LEVEL SECURITY;

-- Uczestnicy konwersacji mogą widzieć potwierdzenia przeczytania
DROP POLICY IF EXISTS "Participants can view read receipts" ON message_read_receipts;
CREATE POLICY "Participants can view read receipts"
ON message_read_receipts FOR SELECT
USING (
    message_id IN (
        SELECT m.id FROM messages m
        JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id
        WHERE cp.user_email = auth.jwt() ->> 'email'
    )
);

-- Użytkownik może dodawać swoje potwierdzenia przeczytania
DROP POLICY IF EXISTS "Users can insert own read receipts" ON message_read_receipts;
CREATE POLICY "Users can insert own read receipts"
ON message_read_receipts FOR INSERT
WITH CHECK (user_email = auth.jwt() ->> 'email');

-- Realtime dla message_read_receipts
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'message_read_receipts'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE message_read_receipts;
    END IF;
END $$;

-- ============================================
-- 3. Funkcja do automatycznego czyszczenia starych statusów pisania
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_old_typing_status()
RETURNS void AS $$
BEGIN
    -- Usuń statusy pisania starsze niż 10 sekund (użytkownik przestał pisać)
    DELETE FROM typing_status
    WHERE started_at < NOW() - INTERVAL '10 seconds';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
