-- 064: Komunikator „WhatsApp dla kościoła" — schemat pod VPS.
--
-- Adaptacja z migrations/komunikator_whatsapp_schema.sql, który był pisany pod SUPABASE
-- (polityki RLS z auth.jwt(), ALTER PUBLICATION supabase_realtime, DB-triggery). Na czystym
-- Postgresie VPS te części padają — dlatego schemat nie wszedł tenant-migracjami. Tu jest
-- SAMO DDL (kolumny/tabele/indeksy/ograniczenia). Dostęp egzekwuje API (dataapi/registry),
-- realtime i push obsługuje warstwa API — NIE ma tu RLS, ALTER PUBLICATION ani triggerów.
-- W pełni idempotentne (IF NOT EXISTS / guardy pg_constraint) i bezpieczne na częściowym
-- stanie (część kolumn mogła już powstać ręcznie).

-- 1. conversations: opis, polityka pisania, typ 'announcement' (kanał ogłoszeń)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS posting_policy TEXT DEFAULT 'everyone';
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversations_posting_policy_check') THEN
        ALTER TABLE conversations ADD CONSTRAINT conversations_posting_policy_check
            CHECK (posting_policy IN ('everyone', 'admins'));
    END IF;
END $$;
DO $$
BEGIN
    ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_type_check;
    ALTER TABLE conversations ADD CONSTRAINT conversations_type_check
        CHECK (type IN ('direct', 'group', 'ministry', 'announcement'));
END $$;

-- 2. conversation_participants: przypięte rozmowy (per użytkownik)
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT false;

-- 3. messages: typ wiadomości, metadane (ankieta/modlitwa/wydarzenie), wzmianki (@)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS mentions JSONB DEFAULT '[]'::jsonb;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_message_type_check') THEN
        ALTER TABLE messages ADD CONSTRAINT messages_message_type_check
            CHECK (message_type IN ('text', 'poll', 'prayer', 'event', 'system'));
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_messages_mentions ON messages USING GIN (mentions);

-- 4. message_read_receipts: doręczenie (delivered) obok przeczytania (ptaszki WhatsApp)
ALTER TABLE message_read_receipts ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
UPDATE message_read_receipts SET delivered_at = read_at WHERE delivered_at IS NULL AND read_at IS NOT NULL;

-- 5. Głosowania (ankiety w czacie). Definicja w messages.metadata, głosy tutaj.
CREATE TABLE IF NOT EXISTS poll_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    option_id TEXT NOT NULL,
    user_email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (message_id, option_id, user_email)
);
CREATE INDEX IF NOT EXISTS idx_poll_votes_message ON poll_votes(message_id);

-- 6. Prośby o modlitwę — odpowiedź „🙏 Modlę się".
CREATE TABLE IF NOT EXISTS prayer_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (message_id, user_email)
);
CREATE INDEX IF NOT EXISTS idx_prayer_responses_message ON prayer_responses(message_id);

-- 7. Kanoniczne (email-owe) reakcje/przypięcia — na schwro już istnieją (migr. 012),
--    IF NOT EXISTS zostawia istniejące; na tenantach bez nich tworzy.
CREATE TABLE IF NOT EXISTS message_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    emoji TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (message_id, user_email, emoji)
);
CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id);

CREATE TABLE IF NOT EXISTS pinned_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    pinned_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (conversation_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_pinned_messages_conversation ON pinned_messages(conversation_id);

-- Uwaga: dostęp do poll_votes/prayer_responses trzeba zarejestrować w
-- packages/api/src/dataapi/registry.js (fail-closed allowlist) — patrz osobna zmiana.
-- RLS/realtime/publikacje/triggery świadomie pominięte (architektura VPS: API, nie Supabase).
