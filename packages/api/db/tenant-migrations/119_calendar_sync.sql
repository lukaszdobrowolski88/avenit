-- 119: Integracje Google / Microsoft — Faza 2: dwukierunkowa synchronizacja kalendarza.
--
-- Wszystkie tabele są WYŁĄCZNIE serwerowe (nie ma ich w rejestrze /api/db) — obsługuje je
-- src/integrations/calendarSync.js (fn calendar-sync, workspace-integration i worker co minutę).
--
--   • calendar_sync_targets — kalendarz docelowy połączenia: osobisty ('user' — kalendarz
--                             „Avenit — <kościół>” na koncie osoby) albo kalendarz kościoła ('church' —
--                             skrzynka/zasób Microsoft 365 albo kalendarz administratora Google).
--                             Kursor przyrostowy (Google syncToken / Graph deltaLink), preferencje
--                             wyboru wydarzeń, stan błędu i znaczniki „powiadomiono raz”.
--   • calendar_sync_items   — stałe mapowanie wydarzenie Avenit ↔ wydarzenie u dostawcy (external_id,
--                             etag/changeKey, skrót i pola ostatniego wysłania — wykrywanie własnych
--                             zapisów i zmian użytkownika), hidden = „ukryj u mnie” po usunięciu.
--   • calendar_sync_queue   — kolejka „brudnych” wydarzeń po zapisie (debounce; worker co minutę).
--   • events.external_source / external_id — wydarzenia zaimportowane z kalendarza kościoła.
--
-- Idempotentnie i bezpiecznie dla żywego tenanta.

CREATE TABLE IF NOT EXISTS calendar_sync_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'user' CHECK (kind IN ('user', 'church')),
    provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
    owner_user_id TEXT,                -- konto Avenit: właściciel (osobisty) / administrator, który skonfigurował (kościoła)
    owner_email TEXT,
    enabled BOOLEAN NOT NULL DEFAULT true,
    calendar_id TEXT,                  -- id kalendarza u dostawcy (tworzony przez Avenit)
    calendar_name TEXT,
    mailbox TEXT,                      -- Microsoft, kalendarz kościoła: adres skrzynki/zasobu
    prefs JSONB NOT NULL DEFAULT '{}'::jsonb,   -- wybór wydarzeń / filtr kościoła / import
    sync_cursor TEXT,                      -- Google nextSyncToken albo Graph @odata.deltaLink
    needs_full BOOLEAN NOT NULL DEFAULT true,
    last_full_at TIMESTAMPTZ,
    last_push_at TIMESTAMPTZ,
    last_pull_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error')),
    last_error TEXT,
    error_notified_at TIMESTAMPTZ,     -- jeden e-mail o błędzie połączenia (zerowany po sukcesie)
    revert_notified_at TIMESTAMPTZ,    -- jedno powiadomienie „Zmiany wprowadzaj w Avenit”
    backoff_until TIMESTAMPTZ,         -- 429/503 Retry-After
    lease_until TIMESTAMPTZ,           -- dzierżawa przebiegu (worker vs „Synchronizuj teraz”)
    stats JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_sync_targets_119 ON calendar_sync_targets (connection_id, kind);
CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_sync_targets_church_119 ON calendar_sync_targets (provider) WHERE kind = 'church';

CREATE TABLE IF NOT EXISTS calendar_sync_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_id UUID NOT NULL REFERENCES calendar_sync_targets(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,            -- events.id::text (int albo uuid zależnie od tenanta)
    external_id TEXT,
    etag TEXT,                         -- Google etag / Microsoft changeKey ostatniego NASZEGO zapisu
    last_pushed_hash TEXT,
    pushed_fields JSONB,               -- znormalizowane pola ostatniego wysłania (różnica = zmiana u dostawcy)
    pushed_at TIMESTAMPTZ,
    origin TEXT NOT NULL DEFAULT 'avenit' CHECK (origin IN ('avenit', 'external')),
    hidden BOOLEAN NOT NULL DEFAULT false,   -- osoba usunęła wydarzenie u siebie → nie synchronizujemy
    deleted BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_sync_items_119 ON calendar_sync_items (target_id, event_id);
CREATE INDEX IF NOT EXISTS idx_calendar_sync_items_ext_119 ON calendar_sync_items (target_id, external_id);
CREATE INDEX IF NOT EXISTS idx_calendar_sync_items_event_119 ON calendar_sync_items (event_id);

CREATE TABLE IF NOT EXISTS calendar_sync_queue (
    id BIGSERIAL PRIMARY KEY,
    event_id TEXT,                     -- NULL + target_id = pełne uzgodnienie kalendarza
    target_id UUID,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_calendar_sync_queue_event_119 ON calendar_sync_queue (event_id);

-- Wydarzenia zaimportowane z kalendarza kościoła (Google / Microsoft).
DO $$
BEGIN
  IF to_regclass('public.events') IS NOT NULL THEN
    ALTER TABLE events ADD COLUMN IF NOT EXISTS external_source TEXT;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS external_id TEXT;
    CREATE INDEX IF NOT EXISTS idx_events_external_119 ON events (external_source, external_id) WHERE external_id IS NOT NULL;
  END IF;
END $$;
