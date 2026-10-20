-- 110: Powiadomienia o wiadomościach znikają po przeczytaniu rozmowy.
-- Wiersze notifications (type 'message'/'mention') tworzy trigger create_message_notification przy
-- każdej wiadomości, ale nic ich nie oznaczało — po przeczytaniu rozmowy (web albo mobilka)
-- dalej wisiały w Powiadomieniach i licznikach. Teraz przesunięcie conversation_participants
-- .last_read_at oznacza powiadomienia tej rozmowy (do chwili przeczytania) jako przeczytane —
-- jedno miejsce dla wszystkich klientów. Obie kolumny: `read` (web/mobilka) i starsze `is_read`.

CREATE OR REPLACE FUNCTION mark_message_notifications_read()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.last_read_at IS NULL OR NEW.last_read_at IS NOT DISTINCT FROM OLD.last_read_at THEN
    RETURN NEW;
  END IF;
  UPDATE notifications
     SET read = true, is_read = true
   WHERE lower(user_email) = lower(NEW.user_email)
     AND type IN ('message', 'mention')
     AND data->>'conversation_id' = NEW.conversation_id::text
     AND created_at <= NEW.last_read_at
     AND (read IS NOT TRUE OR is_read IS NOT TRUE);
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('conversation_participants') IS NULL OR to_regclass('notifications') IS NULL THEN RETURN; END IF;
  DROP TRIGGER IF EXISTS trigger_mark_message_notifications_read ON conversation_participants;
  CREATE TRIGGER trigger_mark_message_notifications_read
    AFTER UPDATE OF last_read_at ON conversation_participants
    FOR EACH ROW EXECUTE FUNCTION mark_message_notifications_read();

  -- Zaległe: wszystko, co przeczytano już przed tą migracją.
  UPDATE notifications n
     SET read = true, is_read = true
    FROM conversation_participants p
   WHERE n.type IN ('message', 'mention')
     AND (n.read IS NOT TRUE OR n.is_read IS NOT TRUE)
     AND n.data->>'conversation_id' = p.conversation_id::text
     AND lower(n.user_email) = lower(p.user_email)
     AND p.last_read_at IS NOT NULL
     AND n.created_at <= p.last_read_at;
END $$;
