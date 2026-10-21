-- 116: Tłumaczenie na żywo przy wydarzeniu (src/interpretation).
-- Tłumacz mówi do mikrofonu w aplikacji, słuchacze na sali słuchają w słuchawkach z telefonu —
-- przez publiczny link/QR (bez konta) albo zalogowani z aplikacji. Jeden pokój LiveKit na kanał
-- językowy (avi_<slug>_<id kanału>) + opcjonalny kanał „Oryginał” (avi_<slug>_<id sesji>), którym
-- tłumacze słyszą nagłośnienie z miksera. Bez nagrywania.
--   interpretation_sessions     — jedna na wydarzenie (events.id jako TEXT: integer na produkcji,
--                                 uuid w szablonie), publiczny token linku, stan idle/live/ended;
--   interpretation_channels     — kanały językowe; aktywny tłumacz (zmiana tłumacza w trakcie);
--   interpretation_interpreters — przypisani tłumacze kanału (konta, wielu na kanał).
-- Dostęp: WYŁĄCZNIE funkcje serwera (fn interp-*) — tabele celowo POZA rejestrem /api/db
-- (public_token zna tylko zarządzający; przypisania i stany zmienia tylko serwer).
-- Idempotentnie (IF NOT EXISTS); bez RLS/triggerów (architektura VPS: API).

CREATE TABLE IF NOT EXISTS interpretation_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL UNIQUE,
    public_token TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'live', 'ended')),
    original_enabled BOOLEAN NOT NULL DEFAULT false,
    original_room_name TEXT NOT NULL UNIQUE,
    original_status TEXT NOT NULL DEFAULT 'idle' CHECK (original_status IN ('idle', 'live')),
    original_last_active_at TIMESTAMPTZ,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_interp_sessions_status_116 ON interpretation_sessions (status) WHERE status <> 'ended';

CREATE TABLE IF NOT EXISTS interpretation_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES interpretation_sessions(id) ON DELETE CASCADE,
    lang_code TEXT NOT NULL,
    label TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    room_name TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'live')),
    active_interpreter_email TEXT,
    started_at TIMESTAMPTZ,
    last_active_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (session_id, lang_code)
);
CREATE INDEX IF NOT EXISTS idx_interp_channels_session_116 ON interpretation_channels (session_id, sort);

CREATE TABLE IF NOT EXISTS interpretation_interpreters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES interpretation_channels(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (channel_id, user_email)
);
CREATE INDEX IF NOT EXISTS idx_interp_interpreters_email_116 ON interpretation_interpreters (user_email);

-- Uprawnienie „Zarządzaj tłumaczeniem na żywo” (catalog.js: action:calendar:manage_interpretation).
-- Lider ma już action:calendar:* (005). Administratorzy — zawsze (bypass ról is_admin).
