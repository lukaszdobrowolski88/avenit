-- ============================================
-- TRIGGER DO WYSYŁANIA PUSH NOTIFICATIONS
-- ============================================

-- Funkcja wywoływana przy INSERT do tabeli notifications
CREATE OR REPLACE FUNCTION trigger_send_push_notification()
RETURNS TRIGGER AS $$
DECLARE
    push_url TEXT;
    service_role_key TEXT;
    payload JSONB;
    response RECORD;
BEGIN
    -- Pobierz URL Supabase i service role key z ustawień
    -- UWAGA: Musisz ustawić te wartości w Vault lub jako sekrety
    push_url := current_setting('app.supabase_url', true) || '/functions/v1/send-push';
    service_role_key := current_setting('app.supabase_service_role_key', true);

    -- Jeśli brak konfiguracji, pomiń
    IF push_url IS NULL OR service_role_key IS NULL THEN
        RETURN NEW;
    END IF;

    -- Przygotuj payload
    payload := jsonb_build_object(
        'user_email', NEW.user_email,
        'title', COALESCE(NEW.title, 'Nowe powiadomienie'),
        'body', COALESCE(NEW.message, ''),
        'link', NEW.link,
        'tag', NEW.type
    );

    -- Wywołaj Edge Function asynchronicznie przez pg_net (jeśli zainstalowane)
    -- Alternatywnie: użyj Supabase Database Webhooks w panelu
    BEGIN
        PERFORM net.http_post(
            url := push_url,
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || service_role_key
            ),
            body := payload
        );
    EXCEPTION WHEN OTHERS THEN
        -- Ignoruj błędy - push jest opcjonalny
        RAISE NOTICE 'Błąd wysyłania push: %', SQLERRM;
    END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Utwórz trigger (opcjonalnie - można też użyć Database Webhooks)
-- DROP TRIGGER IF EXISTS trigger_notifications_push ON notifications;
-- CREATE TRIGGER trigger_notifications_push
--     AFTER INSERT ON notifications
--     FOR EACH ROW
--     EXECUTE FUNCTION trigger_send_push_notification();

-- ============================================
-- ALTERNATYWNIE: Użyj Database Webhooks w panelu Supabase
-- ============================================
-- 1. Przejdź do Database > Webhooks
-- 2. Utwórz nowy webhook:
--    - Name: send-push-on-notification
--    - Table: notifications
--    - Events: INSERT
--    - Type: Supabase Edge Function
--    - Function: send-push
--    - HTTP Headers: Authorization: Bearer <service_role_key>
-- ============================================
