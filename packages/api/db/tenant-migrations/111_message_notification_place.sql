-- 111: Powiadomienie o wiadomości zawsze pokazuje, gdzie napisano (web, mobilka — lista Powiadomień).
-- Grupa / kanał służby / spotkanie: tytuł = nazwa rozmowy (bez nazwy — etykieta typu), treść =
-- „Nadawca: wiadomość”. Rozmowa prywatna: tytuł = nadawca, treść = wiadomość. Tak samo jak pushe
-- (push-hooks.js messagePushText). Wcześniej w grupie brakowało nadawcy w treści.

CREATE OR REPLACE FUNCTION create_message_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    participant RECORD;
    conv_type TEXT;
    conv_name TEXT;
    sender_name TEXT;
    place TEXT;
    preview TEXT;
BEGIN
    SELECT type, NULLIF(trim(name), '') INTO conv_type, conv_name FROM conversations WHERE id = NEW.conversation_id;

    SELECT COALESCE(NULLIF(full_name, ''), NULLIF(name, '')) INTO sender_name
      FROM app_users WHERE lower(email) = lower(NEW.sender_email) LIMIT 1;
    IF sender_name IS NULL THEN
        sender_name := NEW.sender_email;
    END IF;

    place := CASE
        WHEN conv_type IS NULL OR conv_type = 'direct' THEN NULL
        ELSE COALESCE(conv_name, CASE conv_type
            WHEN 'ministry' THEN 'Kanał służby'
            WHEN 'meeting' THEN 'Spotkanie'
            WHEN 'announcement' THEN 'Ogłoszenia'
            ELSE 'Rozmowa grupowa' END)
    END;
    preview := COALESCE(NULLIF(LEFT(NEW.content, 100), ''), 'Nowa wiadomość');

    FOR participant IN
        SELECT user_email FROM conversation_participants
        WHERE conversation_id = NEW.conversation_id
        AND lower(user_email) <> lower(NEW.sender_email)
    LOOP
        INSERT INTO notifications (user_email, type, title, body, link, data)
        VALUES (
            participant.user_email,
            'message',
            COALESCE(place, sender_name),
            CASE WHEN place IS NULL THEN preview ELSE sender_name || ': ' || preview END,
            '/komunikator?conversation=' || NEW.conversation_id::text,
            jsonb_build_object(
                'conversation_id', NEW.conversation_id,
                'message_id', NEW.id,
                'sender_email', NEW.sender_email,
                'sender_name', sender_name,
                'conversation_name', place
            )
        );
    END LOOP;

    RETURN NEW;
END;
$$;
