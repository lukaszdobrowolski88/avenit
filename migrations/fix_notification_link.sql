-- Aktualizacja funkcji tworzenia powiadomień - dodanie conversation_id do linku
-- Uruchom tę migrację, żeby powiadomienia z triggera kierowały do konkretnej konwersacji

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
