-- 041: Jeden model wydarzeń — jeden kalendarz + kastomizacja per moduł.
-- Cel (wizja usera): jeden moduł kalendarza; standardowe pola wspólne dla wszystkich;
-- każdy moduł ma swój kalendarz z własnymi TYPAMI wydarzeń i POLAMI własnymi.
--   • standardowe pola          -> kolumny w `events`
--   • typy wydarzeń per moduł   -> app_settings['module_calendar'] (JSON: {moduleKey:{types:[{id,label,color}]}})
--   • pola własne per moduł     -> definicje w `event_custom_fields` (wzór member_custom_fields),
--                                   wartości w `events.custom` (jsonb)
-- Tabele wydarzeń są praktycznie puste → migracja bez ryzyka danych.
-- Idempotentna (IF NOT EXISTS + guardy) — bezpieczna przy ponownym uruchomieniu.

-- 1) Rozszerz wspólną tabelę `events` o pola modelu docelowego.
ALTER TABLE events ADD COLUMN IF NOT EXISTS module_key text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS end_date   date;
ALTER TABLE events ADD COLUMN IF NOT EXISTS custom     jsonb DEFAULT '{}'::jsonb;
ALTER TABLE events ADD COLUMN IF NOT EXISTS created_by text;

-- Istniejące wiersze bez modułu → „kalendarz ogólny" (fallback z dawnej kolumny category).
UPDATE events SET module_key = COALESCE(module_key, NULLIF(category, ''), 'general') WHERE module_key IS NULL;

CREATE INDEX IF NOT EXISTS idx_events_module ON events (module_key);

-- 2) Definicje pól własnych wydarzeń — per moduł (spójne z member_custom_fields / Boards).
CREATE TABLE IF NOT EXISTS event_custom_fields (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL,
  field_key  text NOT NULL,
  label      text,
  field_type text DEFAULT 'text',
  options    jsonb DEFAULT '[]'::jsonb,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (module_key, field_key)
);

-- 3) Backfill jedynej niepustej tabeli modułowej (module_events) → events.
--    Tabele per-zespół (worship_events, media_events, atmosfera_events, kids_events,
--    homegroups_events, mlodziezowka_events, ministry_events, custom_*_events) są puste — pomijamy.
--    Guard NOT EXISTS = brak duplikatów przy ponownym uruchomieniu.
INSERT INTO events (title, description, event_type, module_key, date, time, end_time, end_date, location, max_participants, campus_id, created_by, created_at)
SELECT me.title, me.description, me.event_type, me.team_type,
       (me.start_date AT TIME ZONE 'Europe/Warsaw')::date,
       to_char(me.start_date AT TIME ZONE 'Europe/Warsaw', 'HH24:MI'),
       me.end_time,
       (me.end_date AT TIME ZONE 'Europe/Warsaw')::date,
       me.location, me.max_participants, me.campus_id, me.created_by, me.created_at
FROM module_events me
WHERE me.title IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM events e
    WHERE e.module_key = me.team_type
      AND e.title = me.title
      AND e.created_at = me.created_at
  );
