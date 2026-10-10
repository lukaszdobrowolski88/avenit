-- 099: Wydarzenia stacjonarne / online / hybrydowe.
-- events.format: 'in_person' (miejsce, jak dotąd) | 'online' (spotkanie audio/wideo) | 'hybrid'
-- (miejsce + spotkanie). Wydarzenie online/hybrydowe ma spotkanie z 098 (meetings.event_id):
-- czat + połączenie LiveKit, osobiste linki gości z zapisów, przypomnienia. Spotkanie zakłada
-- i uzgadnia serwer po zapisie wydarzenia (src/meetings/events.js) — niezależnie od tego, który
-- formularz (web, mobilka) zmienił wydarzenie.
-- meetings.event_id jako TEXT bez klucza obcego: events.id to w części tenantów integer,
-- w szablonie — uuid. meetings.source: skąd spotkanie — 'meeting' (Komunikator; wydarzenie jest
-- jego odbiciem w kalendarzu) albo 'event' (Kalendarz; źródłem prawdy jest wydarzenie).
-- Segment widoczności {type:'meeting'} — uczestnicy rozmowy spotkania (eventVisibilityClause).
-- W pełni idempotentne.

ALTER TABLE events ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT 'in_person';
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_format_check') THEN
        ALTER TABLE events ADD CONSTRAINT events_format_check CHECK (format IN ('in_person', 'online', 'hybrid'));
    END IF;
END $$;

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS event_id TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'meeting';
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meetings_source_check') THEN
        ALTER TABLE meetings ADD CONSTRAINT meetings_source_check CHECK (source IN ('meeting', 'event'));
    END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_meetings_event_099 ON meetings (event_id) WHERE event_id IS NOT NULL;
