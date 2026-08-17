-- 017: unifikacja wydarzeń modułów służb w JEDNĄ tabelę module_events (team_type).
-- Dotąd worship/media/atmosfera/kids/homegroups _events to 5 identycznych tabel
-- (+ dynamiczne custom_<key>_events), obsługiwanych jednym EventsTab i ręcznie
-- sklejanych w CalendarModule. Konsolidujemy do module_events z dyskryminatorem
-- team_type (jak equipment/materials/finance). NIEDESTRUKCYJNIE: kopiujemy dane,
-- tabele źródłowe ZOSTAJĄ (rollback / stopniowe wygaszenie).
--
-- Idempotentnie: kopiuje dane danego team_type tylko jeśli jeszcze ich nie ma.

CREATE TABLE IF NOT EXISTS module_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT,
  start_date TIMESTAMPTZ,
  end_time TEXT,   -- web (EventsTab): godzina zakończenia jako tekst
  end_date TIMESTAMPTZ, -- mobile: znacznik zakończenia
  location TEXT,
  max_participants INTEGER,
  campus_id INTEGER,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_module_events_team ON module_events(team_type);
CREATE INDEX IF NOT EXISTS idx_module_events_start ON module_events(start_date);

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('worship', 'worship_events'), ('media', 'media_events'), ('atmosfera', 'atmosfera_events'),
    ('kids', 'kids_events'), ('homegroups', 'homegroups_events')
  ) AS v(team, tbl)
  LOOP
    BEGIN
      IF to_regclass('public.' || r.tbl) IS NULL THEN CONTINUE; END IF;
      IF EXISTS (SELECT 1 FROM module_events WHERE team_type = r.team) THEN CONTINUE; END IF;
      EXECUTE format(
        'INSERT INTO module_events (team_type, title, description, event_type, start_date, end_time, location, max_participants, campus_id, created_by, created_at)
         SELECT %L, title, description, event_type, start_date, end_time, location, max_participants, campus_id, created_by, created_at FROM %I',
        r.team, r.tbl);
    EXCEPTION WHEN others THEN
      RAISE NOTICE '017_unify_module_events: pominięto kopię % (%)', r.tbl, SQLERRM;
    END;
  END LOOP;
END $$;
