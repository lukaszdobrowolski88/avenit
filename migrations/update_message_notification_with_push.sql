-- ============================================
-- Aktualizacja funkcji powiadomień o wiadomościach z wysyłaniem push
-- ============================================

-- Funkcja do wysyłania push notification przez Edge Function
-- Używa pg_net do asynchronicznego wywołania HTTP
CREATE OR REPLACE FUNCTION send_push_notification(
    p_user_email TEXT,
    p_title TEXT,
    p_body TEXT,
    p_link TEXT DEFAULT '/'
)
RETURNS void AS $$
DECLARE
    supabase_url TEXT;
    service_key TEXT;
BEGIN
    -- Pobierz konfigurację z ustawień (muszą być ustawione w Supabase Dashboard > Settings > Database > Postgres Settings)
    supabase_url := current_setting('app.settings.supabase_url', true);
    service_key := current_setting('app.settings.service_role_key', true);

    -- Jeśli brak konfiguracji, spróbuj ze zmiennymi środowiskowymi
    IF supabase_url IS NULL THEN
        supabase_url := current_setting('supabase.url', true);
    END IF;

    -- Jeśli nadal brak, pomiń wysyłanie
    IF supabase_url IS NULL OR service_key IS NULL THEN
        RAISE NOTICE 'Push notification skipped - missing configuration (supabase_url or service_key)';
        RETURN;
    END IF;

    -- Sprawdź czy pg_net jest dostępne
    BEGIN
        PERFORM net.http_post(
            url := supabase_url || '/functions/v1/send-push',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || service_key
            ),
            body := jsonb_build_object(
                'user_email', p_user_email,
                'title', p_title,
                'body', p_body,
                'link', p_link,
                'tag', 'message'
            )
        );
    EXCEPTION WHEN OTHERS THEN
        -- pg_net nie jest dostępne lub inny błąd - pomiń
        RAISE NOTICE 'Push notification failed: %', SQLERRM;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Zaktualizowana funkcja tworzenia powiadomień o wiadomościach
CREATE OR REPLACE FUNCTION create_message_notification()
RETURNS TRIGGER AS $$
DECLARE
    participant RECORD;
    conv_name TEXT;
    sender_name TEXT;
    notification_title TEXT;
    notification_body TEXT;
    notification_link TEXT;
BEGIN
    -- Pobierz nazwę konwersacji
    SELECT name INTO conv_name FROM conversations WHERE id = NEW.conversation_id;

    -- Pobierz imię nadawcy
    SELECT full_name INTO sender_name FROM app_users WHERE email = NEW.sender_email;
    IF sender_name IS NULL THEN
        sender_name := NEW.sender_email;
    END IF;

    -- Przygotuj treść powiadomienia
    notification_title := COALESCE(conv_name, sender_name);
    notification_body := LEFT(NEW.content, 100);
    notification_link := '/komunikator?conversation=' || NEW.conversation_id::text;

    -- Utwórz powiadomienia dla wszystkich uczestników oprócz nadawcy
    FOR participant IN
        SELECT cp.user_email, up.status as presence_status
        FROM conversation_participants cp
        LEFT JOIN user_presence up ON cp.user_email = up.user_email
        WHERE cp.conversation_id = NEW.conversation_id
        AND cp.user_email != NEW.sender_email
    LOOP
        -- Wstaw powiadomienie do bazy
        INSERT INTO notifications (user_email, type, title, body, link, data)
        VALUES (
            participant.user_email,
            'message',
            notification_title,
            notification_body,
            notification_link,
            jsonb_build_object(
                'conversation_id', NEW.conversation_id,
                'message_id', NEW.id,
                'sender_email', NEW.sender_email,
                'sender_name', sender_name
            )
        );

        -- Wyślij push notification tylko jeśli użytkownik jest offline lub away
        -- (nie wysyłaj jeśli jest online - zobaczy w aplikacji)
        IF participant.presence_status IS NULL
           OR participant.presence_status IN ('offline', 'away') THEN
            PERFORM send_push_notification(
                participant.user_email,
                notification_title,
                sender_name || ': ' || notification_body,
                notification_link
            );
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Upewnij się że trigger istnieje
DROP TRIGGER IF EXISTS trigger_message_notification ON messages;
CREATE TRIGGER trigger_message_notification
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION create_message_notification();

-- ============================================
-- WAŻNE: Aby push notifications działały, musisz:
-- 1. Włączyć rozszerzenie pg_net w Supabase Dashboard:
--    Database > Extensions > pg_net
--
-- 2. Ustawić zmienne konfiguracyjne w Supabase Dashboard:
--    Database > Postgres Settings (w SQL Editor):
--
--    ALTER DATABASE postgres SET "app.settings.supabase_url" = 'https://your-project.supabase.co';
--    ALTER DATABASE postgres SET "app.settings.service_role_key" = 'your-service-role-key';
--
--    UWAGA: Użyj swojego rzeczywistego URL i klucza service_role!
--    Klucz service_role znajdziesz w: Settings > API > service_role key
-- ============================================
