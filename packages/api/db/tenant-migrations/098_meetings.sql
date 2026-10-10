-- 098: Spotkania online (audio/wideo) z zaproszeniami — jak spotkania w Teams.
-- Spotkanie = rozmowa w Komunikatorze typu 'meeting' (czat spotkania + połączenie LiveKit z 096)
-- z terminem i listą zaproszonych:
--   • członkowie — PO KONCIE: uczestnicy rozmowy, powiadomienie w aplikacji + push, odpowiedź
--     „Wezmę udział / Może / Nie wezmę udziału”;
--   • goście — PO ADRESIE E-MAIL: mail z osobistym linkiem /rozmowa/<token> (call_guest_links z 097,
--     z przypisanym spotkaniem, zaproszeniem i imieniem) i załącznikiem kalendarza (.ics).
-- Zakłada, zmienia i odwołuje spotkanie wyłącznie serwer (fn meeting-*); /api/db tylko odczyt
-- wierszy spotkań, w których jestem (komunikator.js — CONV_TABLES). E-maile gości widzi organizator
-- (fn meeting-get), pozostali uczestnicy — tylko imiona. W pełni idempotentne.

-- Typ rozmowy 'meeting' (ograniczenie z 064 przebudowane jak messages_message_type_check w 096:
-- znane typy + wszystkie już obecne w bazie).
DO $$
DECLARE
    types TEXT[];
BEGIN
    SELECT array_agg(DISTINCT t ORDER BY t) INTO types FROM (
        SELECT unnest(ARRAY['direct', 'group', 'ministry', 'announcement', 'meeting']) AS t
        UNION
        SELECT DISTINCT type FROM conversations WHERE type IS NOT NULL
    ) s;
    ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_type_check;
    EXECUTE format('ALTER TABLE conversations ADD CONSTRAINT conversations_type_check CHECK (type = ANY (%L::text[]))', types);
END $$;

CREATE TABLE IF NOT EXISTS meetings (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id   UUID NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
    title             TEXT NOT NULL,
    description       TEXT,
    starts_at         TIMESTAMPTZ NOT NULL,
    ends_at           TIMESTAMPTZ NOT NULL,
    kind              TEXT NOT NULL DEFAULT 'video',
    organizer_email   TEXT NOT NULL,
    guests_auto_admit BOOLEAN NOT NULL DEFAULT false,  -- false = goście czekają w poczekalni
    status            TEXT NOT NULL DEFAULT 'scheduled',
    sequence          INTEGER NOT NULL DEFAULT 0,      -- SEQUENCE w .ics (zmiana terminu)
    reminder_sent_at  TIMESTAMPTZ,
    cancelled_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meetings_kind_check') THEN
        ALTER TABLE meetings ADD CONSTRAINT meetings_kind_check CHECK (kind IN ('audio', 'video'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meetings_status_check') THEN
        ALTER TABLE meetings ADD CONSTRAINT meetings_status_check CHECK (status IN ('scheduled', 'cancelled'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meetings_time_check') THEN
        ALTER TABLE meetings ADD CONSTRAINT meetings_time_check CHECK (ends_at > starts_at);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_meetings_starts_098 ON meetings (starts_at) WHERE status = 'scheduled';

CREATE TABLE IF NOT EXISTS meeting_invites (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id       UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    kind             TEXT NOT NULL,                  -- 'member' (konto) | 'guest' (e-mail)
    email            TEXT NOT NULL,                  -- małymi literami
    name             TEXT,
    response         TEXT NOT NULL DEFAULT 'pending',
    responded_at     TIMESTAMPTZ,
    guest_link_id    UUID REFERENCES call_guest_links(id) ON DELETE SET NULL,
    invited_by_email TEXT NOT NULL,
    email_sent_at    TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (meeting_id, email)
);
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meeting_invites_kind_check') THEN
        ALTER TABLE meeting_invites ADD CONSTRAINT meeting_invites_kind_check CHECK (kind IN ('member', 'guest'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meeting_invites_response_check') THEN
        ALTER TABLE meeting_invites ADD CONSTRAINT meeting_invites_response_check
            CHECK (response IN ('pending', 'accepted', 'tentative', 'declined'));
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_meeting_invites_email_098 ON meeting_invites (email);
-- Limit zaproszeń e-mail na osobę na dobę (ochrona przed wysyłką spamu z domeny kościoła).
CREATE INDEX IF NOT EXISTS idx_meeting_invites_guest_by_098 ON meeting_invites (invited_by_email, created_at) WHERE kind = 'guest';

-- Osobisty link gościa: spotkanie, zaproszenie i imię z zaproszenia (strona gościa ma je wpisane).
ALTER TABLE call_guest_links ADD COLUMN IF NOT EXISTS meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE;
ALTER TABLE call_guest_links ADD COLUMN IF NOT EXISTS invite_id  UUID;
ALTER TABLE call_guest_links ADD COLUMN IF NOT EXISTS guest_name TEXT;
CREATE INDEX IF NOT EXISTS idx_call_guest_links_meeting_098 ON call_guest_links (meeting_id) WHERE meeting_id IS NOT NULL;
