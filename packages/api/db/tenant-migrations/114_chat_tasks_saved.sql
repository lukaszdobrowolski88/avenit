-- 114: Komunikator — „Utwórz zadanie” z wiadomości i zapisane wiadomości (zakładki).
--
-- 1) board_items.source_message_id / source_conversation_id — zadanie utworzone z wiadomości czatu.
--    Panel zadania pokazuje „Z wiadomości” z linkiem do rozmowy (na tę wiadomość), a czat — przy
--    wiadomości — „Zadanie: <nazwa>” ze statusem. Rozmowę ustawia serwer z wiadomości (API sprawdza,
--    że autor zadania jest uczestnikiem tej rozmowy — dataapi/messageTasks.js). Usunięcie wiadomości
--    albo rozmowy nie usuwa zadania (SET NULL).
-- 2) saved_messages — moje zapisane wiadomości (tabela osobista: widzi i zmienia tylko właściciel,
--    ownership.js; API zapisuje user_email małymi literami). Wiadomość usunięta = zakładka znika
--    (CASCADE); wiadomość, do której straciłem dostęp, ukrywa lista (odczyt messages przez /api/db
--    pokazuje tylko rozmowy, w których jestem).
-- Idempotentne; klucze obce tylko, gdy typy kolumn się zgadzają (introspekcja — prod ≠ szablon).

-- ── 1) Zadanie z wiadomości ────────────────────────────────────────────────
ALTER TABLE board_items ADD COLUMN IF NOT EXISTS source_message_id UUID;
ALTER TABLE board_items ADD COLUMN IF NOT EXISTS source_conversation_id UUID;

DO $$
DECLARE
  msg_type text;
  conv_type text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO msg_type
    FROM pg_attribute a WHERE a.attrelid = to_regclass('public.messages') AND a.attname = 'id' AND NOT a.attisdropped;
  SELECT format_type(a.atttypid, a.atttypmod) INTO conv_type
    FROM pg_attribute a WHERE a.attrelid = to_regclass('public.conversations') AND a.attname = 'id' AND NOT a.attisdropped;

  IF msg_type = 'uuid' AND NOT EXISTS (SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.board_items'::regclass AND conname = 'board_items_source_message_fkey') THEN
    BEGIN
      ALTER TABLE board_items ADD CONSTRAINT board_items_source_message_fkey
        FOREIGN KEY (source_message_id) REFERENCES messages(id) ON DELETE SET NULL;
    EXCEPTION WHEN others THEN
      RAISE NOTICE '114: klucz obcy board_items.source_message_id pominięty (%)', SQLERRM;
    END;
  END IF;

  IF conv_type = 'uuid' AND NOT EXISTS (SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.board_items'::regclass AND conname = 'board_items_source_conversation_fkey') THEN
    BEGIN
      ALTER TABLE board_items ADD CONSTRAINT board_items_source_conversation_fkey
        FOREIGN KEY (source_conversation_id) REFERENCES conversations(id) ON DELETE SET NULL;
    EXCEPTION WHEN others THEN
      RAISE NOTICE '114: klucz obcy board_items.source_conversation_id pominięty (%)', SQLERRM;
    END;
  END IF;
END $$;

-- Wskaźnik w czacie pyta paczką o zadania widocznych wiadomości (source_message_id = ANY(...)).
CREATE INDEX IF NOT EXISTS idx_board_items_source_message_114
  ON board_items (source_message_id) WHERE source_message_id IS NOT NULL;

-- ── 2) Zapisane wiadomości ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email TEXT NOT NULL,
    message_id UUID NOT NULL,
    conversation_id UUID,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT saved_messages_user_message_key UNIQUE (user_email, message_id)
);

DO $$
BEGIN
  IF (SELECT format_type(a.atttypid, a.atttypmod) FROM pg_attribute a
        WHERE a.attrelid = to_regclass('public.messages') AND a.attname = 'id' AND NOT a.attisdropped) = 'uuid'
     AND NOT EXISTS (SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.saved_messages'::regclass AND conname = 'saved_messages_message_fkey') THEN
    BEGIN
      ALTER TABLE saved_messages ADD CONSTRAINT saved_messages_message_fkey
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE;
    EXCEPTION WHEN others THEN
      RAISE NOTICE '114: klucz obcy saved_messages.message_id pominięty (%)', SQLERRM;
    END;
  END IF;
  IF (SELECT format_type(a.atttypid, a.atttypmod) FROM pg_attribute a
        WHERE a.attrelid = to_regclass('public.conversations') AND a.attname = 'id' AND NOT a.attisdropped) = 'uuid'
     AND NOT EXISTS (SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.saved_messages'::regclass AND conname = 'saved_messages_conversation_fkey') THEN
    BEGIN
      ALTER TABLE saved_messages ADD CONSTRAINT saved_messages_conversation_fkey
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
    EXCEPTION WHEN others THEN
      RAISE NOTICE '114: klucz obcy saved_messages.conversation_id pominięty (%)', SQLERRM;
    END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_saved_messages_user_114 ON saved_messages (lower(user_email), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_messages_message_114 ON saved_messages (message_id);
