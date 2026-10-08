-- 090: Narzędzia grafiku — zapisane składy (szablony) + przypomnienia o służbie.
-- Samo DDL, w pełni idempotentne. Dostęp: registry.js (T(null)) + sharedWrites.js
-- (zapis tylko z dostępem do modułu zespołu); przypomnienia: worker fn/schedule-reminders.js.

-- Zapisane składy zespołu („Skład niedzielny A”) do szybkiego wstawienia w grafik wydarzenia.
-- lineup: { "<role_key>": ["Imię Nazwisko", ...] } — imiona jak w events.assignments.
CREATE TABLE IF NOT EXISTS schedule_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_type TEXT NOT NULL,
    name TEXT NOT NULL,
    lineup JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_schedule_templates_team_090 ON schedule_templates (team_type);

-- Stemple workera: przypomnienie przed służbą (potwierdzeni) i ponaglenie (bez odpowiedzi).
-- Każde wysyłane najwyżej raz na przypisanie.
ALTER TABLE schedule_assignments ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
ALTER TABLE schedule_assignments ADD COLUMN IF NOT EXISTS nudge_sent_at TIMESTAMPTZ;
