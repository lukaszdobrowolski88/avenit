-- 015: *_events modułów służb — brakujące kolumny start_date/event_type/max_participants.
-- Szablon tenant_schema.sql definiuje media/worship/atmosfera/kids/homegroups _events
-- DWUKROTNIE (duplikat CREATE TABLE IF NOT EXISTS z różnym schematem) → istniejące
-- tenanty dostały PIERWSZY wariant (date/start_time/end_time), a wspólny komponent
-- src/modules/shared/EventsTab.jsx odpytuje/zapisuje DRUGI (start_date TIMESTAMPTZ,
-- event_type, max_participants). Skutek: błąd „column start_date does not exist",
-- który klient BŁĘDNIE interpretował jako „tabela nie istnieje" (ekran z SQL Supabase).
-- (mlodziezowka_events ma już nowy schemat — pomijamy.)
--
-- Dodajemy brakujące kolumny i backfillujemy start_date z legacy date+start_time.
-- Idempotentnie (ADD COLUMN IF NOT EXISTS + guard na backfill).

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['media_events','worship_events','atmosfera_events','kids_events','homegroups_events']
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS event_type TEXT', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS max_participants INTEGER', t);
    -- Backfill: złóż start_date z istniejących date + start_time (dla starych wierszy).
    EXECUTE format(
      'UPDATE %I SET start_date = (date + COALESCE(start_time, ''00:00''::time))::timestamptz
       WHERE start_date IS NULL AND date IS NOT NULL', t);
  END LOOP;
END $$;
