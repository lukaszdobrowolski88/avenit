-- ============================================
-- Tabele dla modułu Komunikator (Messenger)
-- Wykonaj te polecenia w Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. Tabela conversations
-- ============================================
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('direct', 'group', 'ministry')),
    name TEXT,                        -- NULL dla direct, nazwa dla group/ministry
    ministry_key TEXT,                -- Klucz służby dla type='ministry'
    avatar_url TEXT,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeks dla szybkiego wyszukiwania po typie
CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(type);
CREATE INDEX IF NOT EXISTS idx_conversations_ministry ON conversations(ministry_key) WHERE ministry_key IS NOT NULL;

-- ============================================
-- 2. Tabela conversation_participants
-- ============================================
CREATE TABLE IF NOT EXISTS conversation_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    role TEXT DEFAULT 'member' CHECK (role IN ('member', 'admin')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    last_read_at TIMESTAMPTZ,
    muted BOOLEAN DEFAULT false,
    UNIQUE(conversation_id, user_email)
);

-- Indeksy dla wydajności
CREATE INDEX IF NOT EXISTS idx_participants_conversation ON conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_participants_user ON conversation_participants(user_email);

-- ============================================
-- 3. Tabela messages
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    sender_email TEXT NOT NULL,
    content TEXT NOT NULL,
    attachments JSONB DEFAULT '[]',   -- [{url, name, type, size}]
    reply_to_id UUID REFERENCES messages(id),
    edited_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeksy dla wydajności
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_email);

-- ============================================
-- 4. Funkcja do aktualizacji updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_conversation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE conversations
    SET updated_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger aktualizujący updated_at przy nowej wiadomości
DROP TRIGGER IF EXISTS trigger_update_conversation_on_message ON messages;
CREATE TRIGGER trigger_update_conversation_on_message
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_updated_at();

-- ============================================
-- 5. Włączenie RLS
-- ============================================
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 6. Polityki RLS dla conversations
-- ============================================

-- Usuń istniejące polityki
DROP POLICY IF EXISTS "Users can view their conversations" ON conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON conversations;
DROP POLICY IF EXISTS "Admins can update conversations" ON conversations;

-- Użytkownik widzi konwersacje, w których uczestniczy
CREATE POLICY "Users can view their conversations"
ON conversations FOR SELECT
USING (
    id IN (
        SELECT conversation_id FROM conversation_participants
        WHERE user_email = auth.jwt() ->> 'email'
    )
);

-- Użytkownik może tworzyć konwersacje
CREATE POLICY "Users can create conversations"
ON conversations FOR INSERT
WITH CHECK (
    created_by = auth.jwt() ->> 'email'
);

-- Admini mogą aktualizować konwersacje
CREATE POLICY "Admins can update conversations"
ON conversations FOR UPDATE
USING (
    id IN (
        SELECT conversation_id FROM conversation_participants
        WHERE user_email = auth.jwt() ->> 'email'
        AND role = 'admin'
    )
);

-- ============================================
-- 7. Polityki RLS dla conversation_participants
-- ============================================

DROP POLICY IF EXISTS "Users can view participants of their conversations" ON conversation_participants;
DROP POLICY IF EXISTS "Users can add participants" ON conversation_participants;
DROP POLICY IF EXISTS "Users can update their own participation" ON conversation_participants;
DROP POLICY IF EXISTS "Admins can remove participants" ON conversation_participants;

-- Użytkownik widzi uczestników swoich konwersacji
CREATE POLICY "Users can view participants of their conversations"
ON conversation_participants FOR SELECT
USING (
    conversation_id IN (
        SELECT conversation_id FROM conversation_participants
        WHERE user_email = auth.jwt() ->> 'email'
    )
);

-- Użytkownik może dodawać uczestników (przy tworzeniu konwersacji lub jako admin)
CREATE POLICY "Users can add participants"
ON conversation_participants FOR INSERT
WITH CHECK (
    -- Może dodać uczestników do konwersacji którą sam stworzył
    conversation_id IN (
        SELECT id FROM conversations
        WHERE created_by = auth.jwt() ->> 'email'
    )
    OR
    -- Jest adminem tej konwersacji
    conversation_id IN (
        SELECT conversation_id FROM conversation_participants
        WHERE user_email = auth.jwt() ->> 'email'
        AND role = 'admin'
    )
);

-- Użytkownik może aktualizować swoje uczestnictwo (last_read_at, muted)
CREATE POLICY "Users can update their own participation"
ON conversation_participants FOR UPDATE
USING (
    user_email = auth.jwt() ->> 'email'
);

-- Admini mogą usuwać uczestników
CREATE POLICY "Admins can remove participants"
ON conversation_participants FOR DELETE
USING (
    -- Użytkownik może usunąć siebie
    user_email = auth.jwt() ->> 'email'
    OR
    -- Lub jest adminem konwersacji
    conversation_id IN (
        SELECT conversation_id FROM conversation_participants
        WHERE user_email = auth.jwt() ->> 'email'
        AND role = 'admin'
    )
);

-- ============================================
-- 8. Polityki RLS dla messages
-- ============================================

DROP POLICY IF EXISTS "Users can read messages from their conversations" ON messages;
DROP POLICY IF EXISTS "Users can insert messages in their conversations" ON messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON messages;
DROP POLICY IF EXISTS "Users can delete their own messages" ON messages;

-- Użytkownik może czytać wiadomości ze swoich konwersacji
CREATE POLICY "Users can read messages from their conversations"
ON messages FOR SELECT
USING (
    conversation_id IN (
        SELECT conversation_id FROM conversation_participants
        WHERE user_email = auth.jwt() ->> 'email'
    )
);

-- Użytkownik może wysyłać wiadomości w swoich konwersacjach
CREATE POLICY "Users can insert messages in their conversations"
ON messages FOR INSERT
WITH CHECK (
    conversation_id IN (
        SELECT conversation_id FROM conversation_participants
        WHERE user_email = auth.jwt() ->> 'email'
    )
    AND sender_email = auth.jwt() ->> 'email'
);

-- Użytkownik może edytować swoje wiadomości
CREATE POLICY "Users can update their own messages"
ON messages FOR UPDATE
USING (
    sender_email = auth.jwt() ->> 'email'
);

-- Użytkownik może usuwać swoje wiadomości (soft delete)
CREATE POLICY "Users can delete their own messages"
ON messages FOR DELETE
USING (
    sender_email = auth.jwt() ->> 'email'
);

-- ============================================
-- 9. Włączenie Realtime dla tabel
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE messages;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'conversation_participants'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE conversation_participants;
    END IF;
END $$;

-- ============================================
-- 10. Funkcja pomocnicza do znajdowania istniejącej konwersacji direct
-- ============================================
CREATE OR REPLACE FUNCTION find_direct_conversation(user1_email TEXT, user2_email TEXT)
RETURNS UUID AS $$
DECLARE
    conv_id UUID;
BEGIN
    SELECT c.id INTO conv_id
    FROM conversations c
    WHERE c.type = 'direct'
    AND EXISTS (
        SELECT 1 FROM conversation_participants cp1
        WHERE cp1.conversation_id = c.id AND cp1.user_email = user1_email
    )
    AND EXISTS (
        SELECT 1 FROM conversation_participants cp2
        WHERE cp2.conversation_id = c.id AND cp2.user_email = user2_email
    )
    LIMIT 1;

    RETURN conv_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 11. Funkcja do tworzenia/pobierania konwersacji direct
-- ============================================
CREATE OR REPLACE FUNCTION get_or_create_direct_conversation(other_user_email TEXT)
RETURNS UUID AS $$
DECLARE
    current_user_email TEXT;
    conv_id UUID;
BEGIN
    current_user_email := auth.jwt() ->> 'email';

    -- Sprawdź czy konwersacja już istnieje
    conv_id := find_direct_conversation(current_user_email, other_user_email);

    IF conv_id IS NOT NULL THEN
        RETURN conv_id;
    END IF;

    -- Utwórz nową konwersację
    INSERT INTO conversations (type, created_by)
    VALUES ('direct', current_user_email)
    RETURNING id INTO conv_id;

    -- Dodaj uczestników
    INSERT INTO conversation_participants (conversation_id, user_email, role)
    VALUES
        (conv_id, current_user_email, 'admin'),
        (conv_id, other_user_email, 'admin');

    RETURN conv_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
