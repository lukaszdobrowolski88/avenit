-- 074: Schemat check-inu Dzieci zgodny z kodem weba (src/modules/Kids/checkin/**).
-- Szablon tenanta i bazy przeniesione z Supabase mają stary kształt:
--   • parent_contacts bez household_id / full_name / can_pickup / member_id (a `name`
--     NOT NULL) — wyszukiwanie rodziny i kody odbioru nie mogły działać,
--   • checkins.student_id innego typu niż kids_students.id (np. uuid vs integer na
--     schwro) — złączenie i zapis meldowania kończyły się błędem.
-- Wszystko idempotentne; zmiana typu tylko, gdy typy się różnią i nie ma meldowań.

ALTER TABLE parent_contacts ADD COLUMN IF NOT EXISTS household_id uuid;
ALTER TABLE parent_contacts ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE parent_contacts ADD COLUMN IF NOT EXISTS member_id integer;
ALTER TABLE parent_contacts ADD COLUMN IF NOT EXISTS can_pickup boolean DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_parent_contacts_household ON parent_contacts(household_id);

DO $$
BEGIN
  -- Stara kolumna `name` (NOT NULL) blokowałaby zapisy weba, który wysyła full_name.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'parent_contacts' AND column_name = 'name'
  ) THEN
    ALTER TABLE parent_contacts ALTER COLUMN name DROP NOT NULL;
    UPDATE parent_contacts SET full_name = name WHERE full_name IS NULL AND name IS NOT NULL;
  END IF;
END $$;

DO $$
DECLARE
  ks_type text;
  ck_type text;
  fk record;
BEGIN
  SELECT data_type INTO ks_type FROM information_schema.columns
   WHERE table_name = 'kids_students' AND column_name = 'id';
  SELECT data_type INTO ck_type FROM information_schema.columns
   WHERE table_name = 'checkins' AND column_name = 'student_id';
  IF ks_type IS NOT NULL AND ck_type IS NOT NULL AND ks_type <> ck_type
     AND NOT EXISTS (SELECT 1 FROM checkins WHERE student_id IS NOT NULL) THEN
    FOR fk IN
      SELECT c.conname FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.conrelid = 'checkins'::regclass AND c.contype = 'f' AND a.attname = 'student_id'
    LOOP
      EXECUTE format('ALTER TABLE checkins DROP CONSTRAINT %I', fk.conname);
    END LOOP;
    EXECUTE format('ALTER TABLE checkins ALTER COLUMN student_id TYPE %s USING NULL', ks_type);
  END IF;
END $$;
