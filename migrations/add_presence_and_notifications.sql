-- ============================================
-- Tabele dla statusu użytkowników i powiadomień
-- ============================================

-- ============================================
-- 1. Tabela user_presence (status online/away/offline)
-- ============================================
CREATE TABLE IF NOT EXISTS user_presence (
    user_email TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'away', 'offline')),
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeks dla szybkiego wyszukiwania
CREATE INDEX IF NOT EXISTS idx_user_presence_status ON user_presence(status);
CREATE INDEX IF NOT EXISTS idx_user_presence_last_seen ON user_presence(last_seen);

-- RLS
ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY;

-- Każdy może widzieć status innych użytkowników
DROP POLICY IF EXISTS "Anyone can view presence" ON user_presence;
CREATE POLICY "Anyone can view presence"
ON user_presence FOR SELECT
USING (true);

-- Użytkownik może aktualizować tylko swój status
DROP POLICY IF EXISTS "Users can update own presence" ON user_presence;
CREATE POLICY "Users can update own presence"
ON user_presence FOR UPDATE
USING (user_email = auth.jwt() ->> 'email');

-- Użytkownik może dodać swój status
DROP POLICY IF EXISTS "Users can insert own presence" ON user_presence;
CREATE POLICY "Users can insert own presence"
ON user_presence FOR INSERT
WITH CHECK (user_email = auth.jwt() ->> 'email');

-- Realtime dla presence
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'user_presence'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE user_presence;
    END IF;
END $$;

-- ============================================
-- 2. Tabela notifications (powiadomienia)
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('message', 'mention', 'task', 'event', 'system')),
    title TEXT NOT NULL,
    body TEXT,
    link TEXT,                              -- URL do przekierowania
    data JSONB DEFAULT '{}',                -- Dodatkowe dane (np. conversation_id, sender)
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeksy
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_email, read) WHERE read = false;

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Użytkownik widzi tylko swoje powiadomienia
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
CREATE POLICY "Users can view own notifications"
ON notifications FOR SELECT
USING (user_email = auth.jwt() ->> 'email');

-- System może tworzyć powiadomienia dla wszystkich
DROP POLICY IF EXISTS "Anyone can create notifications" ON notifications;
CREATE POLICY "Anyone can create notifications"
ON notifications FOR INSERT
WITH CHECK (true);

-- Użytkownik może aktualizować (oznaczać jako przeczytane) swoje powiadomienia
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications"
ON notifications FOR UPDATE
USING (user_email = auth.jwt() ->> 'email');

-- Użytkownik może usuwać swoje powiadomienia
DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;
CREATE POLICY "Users can delete own notifications"
ON notifications FOR DELETE
USING (user_email = auth.jwt() ->> 'email');

-- Realtime dla notifications
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
    END IF;
END $$;

-- ============================================
-- 3. Funkcja do automatycznego tworzenia powiadomienia o nowej wiadomości
-- ============================================
CREATE OR REPLACE FUNCTION create_message_notification()
RETURNS TRIGGER AS $$
DECLARE
    participant RECORD;
    conv_name TEXT;
    sender_name TEXT;
BEGIN
    -- Pobierz nazwę konwersacji
    SELECT name INTO conv_name FROM conversations WHERE id = NEW.conversation_id;

    -- Pobierz imię nadawcy
    SELECT full_name INTO sender_name FROM app_users WHERE email = NEW.sender_email;
    IF sender_name IS NULL THEN
        sender_name := NEW.sender_email;
    END IF;

    -- Utwórz powiadomienia dla wszystkich uczestników oprócz nadawcy
    FOR participant IN
        SELECT user_email FROM conversation_participants
        WHERE conversation_id = NEW.conversation_id
        AND user_email != NEW.sender_email
    LOOP
        INSERT INTO notifications (user_email, type, title, body, link, data)
        VALUES (
            participant.user_email,
            'message',
            COALESCE(conv_name, sender_name),
            LEFT(NEW.content, 100),
            '/komunikator?conversation=' || NEW.conversation_id::text,
            jsonb_build_object(
                'conversation_id', NEW.conversation_id,
                'message_id', NEW.id,
                'sender_email', NEW.sender_email,
                'sender_name', sender_name
            )
        );
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger dla nowych wiadomości
DROP TRIGGER IF EXISTS trigger_message_notification ON messages;
CREATE TRIGGER trigger_message_notification
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION create_message_notification();

-- ============================================
-- 4. Funkcja do czyszczenia starych powiadomień (opcjonalna)
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS void AS $$
BEGIN
    -- Usuń przeczytane powiadomienia starsze niż 30 dni
    DELETE FROM notifications
    WHERE read = true AND created_at < NOW() - INTERVAL '30 days';

    -- Usuń nieprzeczytane powiadomienia starsze niż 90 dni
    DELETE FROM notifications
    WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. Funkcja do ustawiania użytkowników jako offline po czasie nieaktywności
-- ============================================
CREATE OR REPLACE FUNCTION set_users_offline()
RETURNS void AS $$
BEGIN
    -- Ustaw jako offline użytkowników nieaktywnych przez 5 minut
    UPDATE user_presence
    SET status = 'offline', updated_at = NOW()
    WHERE status != 'offline'
    AND last_seen < NOW() - INTERVAL '5 minutes';

    -- Ustaw jako away użytkowników nieaktywnych przez 2 minuty
    UPDATE user_presence
    SET status = 'away', updated_at = NOW()
    WHERE status = 'online'
    AND last_seen < NOW() - INTERVAL '2 minutes';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
