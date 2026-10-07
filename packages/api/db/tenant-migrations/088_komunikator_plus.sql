-- 088: Komunikator+ — wyciszanie na czas, podglądy linków, tłumaczenia, zgłoszenia, blokady.
-- Samo DDL (dostęp egzekwuje API: registry.js / komunikatorPlus.js / ownership.js).
-- W pełni idempotentne (IF NOT EXISTS / guardy) — bezpieczne przy ponownym uruchomieniu.

-- K4: wyciszenie rozmowy do określonego czasu (muted = true — „zawsze”).
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS muted_until TIMESTAMPTZ;

-- K2: cache podglądów linków (tylko przez fn link-preview; poza /api/db).
CREATE TABLE IF NOT EXISTS link_previews (
    url TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_link_previews_fetched_088 ON link_previews (fetched_at);

-- K3: cache tłumaczeń wiadomości (tylko przez fn translate-message; poza /api/db).
CREATE TABLE IF NOT EXISTS message_translations (
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    lang TEXT NOT NULL,
    text TEXT NOT NULL,
    source_lang TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (message_id, lang)
);
ALTER TABLE message_translations ADD COLUMN IF NOT EXISTS source_lang TEXT;

-- K10: zgłoszenia wiadomości. Treść i nadawca kopiowane przy zgłoszeniu (moderator nie jest
-- uczestnikiem rozmowy, a autor mógłby wiadomość zmienić albo usunąć).
CREATE TABLE IF NOT EXISTS message_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    reporter_email TEXT NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    message_sender_email TEXT,
    message_content TEXT,
    resolution_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_by TEXT,
    resolved_at TIMESTAMPTZ
);
ALTER TABLE message_reports ADD COLUMN IF NOT EXISTS message_sender_email TEXT;
ALTER TABLE message_reports ADD COLUMN IF NOT EXISTS message_content TEXT;
ALTER TABLE message_reports ADD COLUMN IF NOT EXISTS resolution_note TEXT;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'message_reports_status_check') THEN
        ALTER TABLE message_reports ADD CONSTRAINT message_reports_status_check
            CHECK (status IN ('open', 'resolved'));
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_message_reports_status_088 ON message_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_reports_reporter_088 ON message_reports (lower(reporter_email));
CREATE INDEX IF NOT EXISTS idx_message_reports_message_088 ON message_reports (message_id);

-- K10: blokady osób (tabela osobista — właściciel blocker_email; API zapisuje małymi literami).
CREATE TABLE IF NOT EXISTS user_blocks (
    blocker_email TEXT NOT NULL,
    blocked_email TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_email, blocked_email)
);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked_088 ON user_blocks (lower(blocked_email));
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker_088 ON user_blocks (lower(blocker_email));

-- K4: ciche godziny — klienci zapisują push_user_preferences upsertem po user_email; wymaga
-- unikalności. W szablonie user_email jest kluczem głównym — gdyby w starszej bazie go nie było,
-- dokładamy indeks unikalny (przy duplikatach tylko komunikat, migracja nie pada).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_index i
          JOIN pg_class t ON t.oid = i.indrelid
          JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(i.indkey)
         WHERE t.relname = 'push_user_preferences' AND i.indisunique AND i.indnatts = 1 AND a.attname = 'user_email'
    ) THEN
        BEGIN
            CREATE UNIQUE INDEX IF NOT EXISTS uq_push_user_preferences_email_088 ON push_user_preferences (user_email);
        EXCEPTION WHEN others THEN
            RAISE NOTICE '088: push_user_preferences.user_email nie jest unikalne — upsert cichych godzin wymaga porządków';
        END;
    END IF;
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE '088: brak tabeli push_user_preferences';
END $$;

-- Wydajność Komunikatora: zakres uczestnika (lower(email) per rozmowa), stronicowanie historii
-- po created_at (K11), galeria (wiadomości z załącznikami).
CREATE INDEX IF NOT EXISTS idx_cp_conv_lower_email_088 ON conversation_participants (conversation_id, lower(user_email));
CREATE INDEX IF NOT EXISTS idx_cp_lower_email_088 ON conversation_participants (lower(user_email));
CREATE INDEX IF NOT EXISTS idx_messages_conv_created_088 ON messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_ministry_key_088 ON conversations (ministry_key) WHERE type = 'ministry';
