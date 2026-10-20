-- 112: Wątki w Komunikatorze (odpowiedzi w wątku, jak w Slacku).
--
-- • messages.thread_root_id — odpowiedź w wątku wskazuje wiadomość główną (zawsze korzeń: odpowiedź
--   na odpowiedź jest spłaszczana). Odpowiedzi NIE należą do głównej osi rozmowy (serwer /api/db
--   domyślnie dokłada thread_root_id IS NULL do zapytań o wiadomości rozmowy).
-- • messages.thread_reply_count / thread_last_reply_at — liczniki na wiadomości głównej, liczone
--   przez trigger (dodanie, usunięcie miękkie deleted_at, usunięcie twarde). Klient ich nie zapisuje.
-- • message_thread_followers — kto obserwuje wątek (powiadomienia o odpowiedziach): autor wiadomości
--   głównej, każdy odpowiadający i wspomniani są dopisywani automatycznie; following = false to
--   „przestań obserwować” (automat tego nie nadpisuje — tylko własna odpowiedź wraca do obserwowania).
-- • create_message_notification — odpowiedź w wątku: powiadomienie tylko dla obserwujących wątek
--   i wspomnianych (nie dla całej rozmowy). Zwykłe wiadomości — bez zmian względem 111.

ALTER TABLE messages ADD COLUMN IF NOT EXISTS thread_root_id UUID;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS thread_reply_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS thread_last_reply_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS mentions JSONB DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_thread_root_fk') THEN
    ALTER TABLE messages ADD CONSTRAINT messages_thread_root_fk
      FOREIGN KEY (thread_root_id) REFERENCES messages(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_messages_thread_root ON messages (thread_root_id, created_at)
  WHERE thread_root_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS message_thread_followers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  root_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  following BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (root_id, user_email)
);
CREATE INDEX IF NOT EXISTS idx_thread_followers_user ON message_thread_followers (user_email);
CREATE INDEX IF NOT EXISTS idx_thread_followers_conv ON message_thread_followers (conversation_id);

-- Obserwujący: e-mail małymi literami, rozmowa zawsze z wiadomości głównej (nie od klienta),
-- obserwować można tylko wiadomość główną (nie odpowiedź).
CREATE OR REPLACE FUNCTION message_thread_followers_normalize()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  root RECORD;
BEGIN
  NEW.user_email := lower(trim(NEW.user_email));
  SELECT conversation_id, thread_root_id INTO root FROM messages WHERE id = NEW.root_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nie ma takiej wiadomości' USING ERRCODE = '23503';
  END IF;
  IF root.thread_root_id IS NOT NULL THEN
    RAISE EXCEPTION 'Obserwować można tylko wiadomość główną wątku' USING ERRCODE = '23514';
  END IF;
  NEW.conversation_id := root.conversation_id;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_thread_followers_normalize ON message_thread_followers;
CREATE TRIGGER trigger_thread_followers_normalize
  BEFORE INSERT OR UPDATE ON message_thread_followers
  FOR EACH ROW EXECUTE FUNCTION message_thread_followers_normalize();

-- Przed zapisem wiadomości: liczniki tylko z triggera; odpowiedź w wątku — spłaszczenie do korzenia,
-- ta sama rozmowa co wiadomość główna, automatyczne obserwowanie (przed triggerami AFTER, żeby
-- powiadomienie o pierwszej odpowiedzi trafiło już do autora wiadomości głównej).
CREATE OR REPLACE FUNCTION messages_thread_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  root RECORD;
BEGIN
  NEW.thread_reply_count := 0;
  NEW.thread_last_reply_at := NULL;
  IF NEW.thread_root_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id, conversation_id, sender_email, thread_root_id, deleted_at INTO root
    FROM messages WHERE id = NEW.thread_root_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nie ma takiego wątku' USING ERRCODE = '23503';
  END IF;
  IF root.thread_root_id IS NOT NULL THEN
    NEW.thread_root_id := root.thread_root_id;
    SELECT id, conversation_id, sender_email, thread_root_id, deleted_at INTO root
      FROM messages WHERE id = NEW.thread_root_id;
  END IF;
  IF NEW.conversation_id IS DISTINCT FROM root.conversation_id THEN
    RAISE EXCEPTION 'Odpowiedź w wątku musi być w tej samej rozmowie' USING ERRCODE = '23514';
  END IF;
  IF root.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Ta wiadomość została usunięta' USING ERRCODE = '23514';
  END IF;

  -- Autor wiadomości głównej i wspomniani (uczestnicy) — bez nadpisywania „nie obserwuję”.
  INSERT INTO message_thread_followers (root_id, user_email)
  SELECT NEW.thread_root_id, lower(e)
    FROM (
      SELECT root.sender_email AS e
      UNION
      SELECT x FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(NEW.mentions) = 'array' THEN NEW.mentions ELSE '[]'::jsonb END) x
    ) s
   WHERE e IS NOT NULL AND e <> '*' AND lower(e) <> lower(NEW.sender_email)
     AND EXISTS (SELECT 1 FROM conversation_participants cp
                  WHERE cp.conversation_id = NEW.conversation_id AND lower(cp.user_email) = lower(s.e))
  ON CONFLICT (root_id, user_email) DO NOTHING;

  -- Odpowiadający zawsze (także ten, kto wcześniej przestał obserwować — jak w Slacku).
  INSERT INTO message_thread_followers (root_id, user_email, following)
  VALUES (NEW.thread_root_id, lower(NEW.sender_email), true)
  ON CONFLICT (root_id, user_email) DO UPDATE SET following = true, updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_messages_thread_before_insert ON messages;
CREATE TRIGGER trigger_messages_thread_before_insert
  BEFORE INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION messages_thread_before_insert();

-- Liczniki wiadomości głównej (liczone od nowa — odporne na usunięcia i przywrócenia).
CREATE OR REPLACE FUNCTION message_thread_recount(root UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE messages m
     SET thread_reply_count = s.n, thread_last_reply_at = s.last_at
    FROM (SELECT count(*)::int AS n, max(created_at) AS last_at
            FROM messages WHERE thread_root_id = root AND deleted_at IS NULL) s
   WHERE m.id = root
     AND (m.thread_reply_count IS DISTINCT FROM s.n OR m.thread_last_reply_at IS DISTINCT FROM s.last_at);
$$;

CREATE OR REPLACE FUNCTION messages_thread_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.thread_root_id IS NOT NULL THEN
    PERFORM message_thread_recount(NEW.thread_root_id);
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.thread_root_id IS NOT NULL
     AND (TG_OP = 'DELETE' OR OLD.thread_root_id IS DISTINCT FROM NEW.thread_root_id) THEN
    PERFORM message_thread_recount(OLD.thread_root_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trigger_messages_thread_counts ON messages;
CREATE TRIGGER trigger_messages_thread_counts
  AFTER INSERT OR DELETE OR UPDATE OF deleted_at, thread_root_id ON messages
  FOR EACH ROW EXECUTE FUNCTION messages_thread_counts();

-- Powiadomienia (lista Powiadomień). Zwykła wiadomość — jak 111. Odpowiedź w wątku — tylko
-- obserwujący wątek (following) i wspomniani (także @wszyscy), tytuł = miejsce rozmowy (prywatnie:
-- nadawca), treść „Nadawca w wątku: …”, link otwiera wątek (&thread=…).
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
    mention_list TEXT[];
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

    IF NEW.thread_root_id IS NOT NULL THEN
        SELECT COALESCE(array_agg(lower(x)), ARRAY[]::text[]) INTO mention_list
          FROM jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(NEW.mentions) = 'array' THEN NEW.mentions ELSE '[]'::jsonb END) x;

        FOR participant IN
            SELECT cp.user_email FROM conversation_participants cp
             WHERE cp.conversation_id = NEW.conversation_id
               AND lower(cp.user_email) <> lower(NEW.sender_email)
               AND (
                 '*' = ANY (mention_list)
                 OR lower(cp.user_email) = ANY (mention_list)
                 OR EXISTS (SELECT 1 FROM message_thread_followers f
                             WHERE f.root_id = NEW.thread_root_id
                               AND f.user_email = lower(cp.user_email)
                               AND f.following)
               )
        LOOP
            INSERT INTO notifications (user_email, type, title, body, link, data)
            VALUES (
                participant.user_email,
                'message',
                COALESCE(place, sender_name),
                CASE WHEN place IS NULL THEN 'W wątku: ' || preview ELSE sender_name || ' w wątku: ' || preview END,
                '/komunikator?conversation=' || NEW.conversation_id::text || '&thread=' || NEW.thread_root_id::text,
                jsonb_build_object(
                    'conversation_id', NEW.conversation_id,
                    'message_id', NEW.id,
                    'thread_root_id', NEW.thread_root_id,
                    'sender_email', NEW.sender_email,
                    'sender_name', sender_name,
                    'conversation_name', place
                )
            );
        END LOOP;
        RETURN NEW;
    END IF;

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
