-- 073: checkins — kto meldował / wydał dziecko jako e-mail (tekst).
-- Web (useCheckin.js) i mobile zapisują e-mail osoby, ale na tenantach przeniesionych
-- z Supabase `checked_in_by` było typu uuid (insert → 22P02), a `checked_out_by` nie
-- istniało (update → 42703). Meldowanie i wydawanie dzieci nie działało.
-- Brak FK na checked_in_by; na schwro tabela jest pusta — zmiana typu bezpieczna.

ALTER TABLE checkins ADD COLUMN IF NOT EXISTS checked_out_by text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checkins' AND column_name = 'checked_in_by' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE checkins ALTER COLUMN checked_in_by TYPE text USING checked_in_by::text;
  END IF;
END $$;
