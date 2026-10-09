-- 096: Połączenia audio/wideo w Komunikatorze (LiveKit SFU na VPS).
-- Rozmowa 1:1 i grupowa w istniejącej rozmowie (conversations). Stan połączenia trzyma serwer:
-- fn call-start/join/decline/cancel/leave, webhook LiveKit (/api/calls/livekit-webhook) i worker
-- (call-sweep: dzwonienie > 45 s → nieodebrane). Klient czyta przez /api/db wyłącznie wiersze
-- rozmów, w których uczestniczy (komunikator.js), zapis przez /api/db zablokowany (readOnly).
-- Bez grantów: tabele w registry mają resource null (zakres uczestnika jak message_reports).
-- Ślad w czacie: wiadomość messages.message_type = 'call' z metadata {call_id, kind, status, ...}.
-- W pełni idempotentne.

CREATE TABLE IF NOT EXISTS calls (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id  UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    room_name        TEXT NOT NULL UNIQUE,
    kind             TEXT NOT NULL DEFAULT 'audio',
    is_group         BOOLEAN NOT NULL DEFAULT false,
    started_by_email TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'ringing',
    started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    answered_at      TIMESTAMPTZ,
    ended_at         TIMESTAMPTZ,
    duration_sec     INTEGER,
    message_id       UUID REFERENCES messages(id) ON DELETE SET NULL,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calls_kind_check') THEN
        ALTER TABLE calls ADD CONSTRAINT calls_kind_check CHECK (kind IN ('audio', 'video'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calls_status_check') THEN
        ALTER TABLE calls ADD CONSTRAINT calls_status_check
            CHECK (status IN ('ringing', 'active', 'ended', 'missed', 'declined', 'cancelled'));
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_calls_conversation_096 ON calls (conversation_id, started_at DESC);
-- Sweep: dzwoniące/trwające połączenia.
CREATE INDEX IF NOT EXISTS idx_calls_live_096 ON calls (status, started_at) WHERE status IN ('ringing', 'active');
-- Najwyżej jedno trwające połączenie w rozmowie — dwa jednoczesne „Zadzwoń” łączą się w jedno.
CREATE UNIQUE INDEX IF NOT EXISTS uq_calls_one_live_per_conversation_096
    ON calls (conversation_id) WHERE status IN ('ringing', 'active');

-- Uczestnicy połączenia (e-mail małymi literami). Wiersz powstaje przy odebraniu/odrzuceniu
-- (fn) albo wejściu do pokoju (webhook LiveKit) — nie dla każdego członka dużego kanału.
CREATE TABLE IF NOT EXISTS call_participants (
    call_id    UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    joined_at  TIMESTAMPTZ,
    left_at    TIMESTAMPTZ,
    response   TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (call_id, user_email)
);
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'call_participants_response_check') THEN
        ALTER TABLE call_participants ADD CONSTRAINT call_participants_response_check
            CHECK (response IS NULL OR response IN ('accepted', 'declined'));
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_call_participants_user_096 ON call_participants (lower(user_email));

-- Typ wiadomości 'call'. Ograniczenie z 064 przebudowane: znane typy + wszystkie typy już
-- obecne w bazie (produkcja mogła mieć inną listę — nie wywracamy migracji na starych wierszach).
DO $$
DECLARE
    types TEXT[];
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = current_schema() AND table_name = 'messages' AND column_name = 'message_type') THEN
        SELECT array_agg(DISTINCT t ORDER BY t) INTO types FROM (
            SELECT unnest(ARRAY['text', 'poll', 'prayer', 'event', 'system', 'call']) AS t
            UNION
            SELECT DISTINCT message_type FROM messages WHERE message_type IS NOT NULL
        ) s;
        ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
        EXECUTE format('ALTER TABLE messages ADD CONSTRAINT messages_message_type_check CHECK (message_type = ANY (%L::text[]))', types);
    END IF;
END $$;
