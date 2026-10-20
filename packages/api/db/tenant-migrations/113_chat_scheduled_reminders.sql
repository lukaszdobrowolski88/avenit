-- 113: Komunikator — zaplanowane wiadomości i „Przypomnij mi”.
--
-- scheduled_messages: wiadomość napisana teraz, wysłana później. Wysyła worker (co minutę,
-- fn chat-scheduled) jako nadawca — tą samą ścieżką co zwykła wysyłka (uczestnictwo, kanał
-- „tylko administratorzy”, blokady, @wszyscy, push, realtime). Nie da się wysłać (np. nadawca
-- opuścił rozmowę) → status 'failed' z powodem w `error`.
-- message_reminders: „Przypomnij mi” o wiadomości — o remind_at push + wpis w Powiadomieniach
-- (typ 'reminder'); kto opuścił rozmowę albo wiadomość zniknęła — przypomnienie przepada.
-- Obie tabele osobiste: wiersze widzi i zmienia tylko właściciel (ownership.js); zapis wyłącznie
-- przez fn chat-scheduled / chat-reminders (registry: readOnly).

CREATE TABLE IF NOT EXISTS scheduled_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_email text NOT NULL,
  content text NOT NULL DEFAULT '',
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  mentions jsonb NOT NULL DEFAULT '[]'::jsonb,
  reply_to_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  send_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled', 'failed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  message_id uuid REFERENCES messages(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_due ON scheduled_messages (send_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_sender ON scheduled_messages (lower(sender_email), conversation_id);

CREATE TABLE IF NOT EXISTS message_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL,
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  remind_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_message_reminders_due ON message_reminders (remind_at) WHERE status = 'pending';
-- Jedno aktywne przypomnienie o danej wiadomości na osobę (ponowne „Przypomnij mi” zmienia termin).
CREATE UNIQUE INDEX IF NOT EXISTS uq_message_reminders_pending
  ON message_reminders (lower(user_email), message_id) WHERE status = 'pending';

-- Nowy typ powiadomienia 'reminder'. Najstarszy wariant szablonu miał CHECK na notifications.type
-- (message/mention/task/event/system) — tam, gdzie przetrwał, nie wpuściłby przypomnienia (ani
-- 'meeting'/'call', używanych od dawna). Zdejmujemy tylko ograniczenia typu bez 'reminder'.
DO $$
DECLARE c record;
BEGIN
  IF to_regclass('notifications') IS NULL THEN RETURN; END IF;
  FOR c IN
    SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
     WHERE conrelid = 'notifications'::regclass AND contype = 'c'
  LOOP
    IF c.def ILIKE '%type%' AND c.def NOT ILIKE '%reminder%' THEN
      EXECUTE format('ALTER TABLE notifications DROP CONSTRAINT %I', c.conname);
    END IF;
  END LOOP;
END $$;
