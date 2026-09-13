-- Per-event override: które służby pojawiają się na wydarzeniu (zakładka „Służby" + grafik).
-- CSV kluczy team_type (np. 'worship, media'). NULL = użyj domyślnych (reguła event_type_teams
-- lub moduł-służba). Pusty string '' = jawnie brak służb. Prosty text (bez jsonb/array).
ALTER TABLE events ADD COLUMN IF NOT EXISTS team_types text;
