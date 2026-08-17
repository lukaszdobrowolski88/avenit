-- 019: Naprawa dryfu schematu funkcji Check-in dzieci („Małe SchWro"/Kids).
-- Tabele check-in były prowizorką i nigdy nie dostały pełnego schematu na produkcji
-- (checkin_locations/checkin_sessions/checkins = 0 wierszy). Klient (LocationManager/
-- SessionManager/useCheckin/NotifyParentButton) czyta i zapisuje kolumny, których w
-- żywych tabelach nie ma → 400 „column t.sort_order does not exist" + błędy zapisu sal,
-- sesji i check-inów. Niedestrukcyjne, idempotentne — wyrównuje schemat do klienta
-- (jedyny konsument tych tabel; mobilka nie ma check-in).

-- 1) Sale (checkin_locations): kolumny formularza sal (numer, przedział wieku, pojemność, kolejność).
ALTER TABLE checkin_locations ADD COLUMN IF NOT EXISTS room_number text;
ALTER TABLE checkin_locations ADD COLUMN IF NOT EXISTS min_age    integer;
ALTER TABLE checkin_locations ADD COLUMN IF NOT EXISTS max_age    integer;
ALTER TABLE checkin_locations ADD COLUMN IF NOT EXISTS capacity   integer;
ALTER TABLE checkin_locations ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- 2) Sesje (checkin_sessions): klient używa nazwy `session_date`, a żywa kolumna to `date`
--    (nikt inny jej nie czyta) → zmień nazwę; dołóż `created_by`.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='checkin_sessions' AND column_name='date')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='checkin_sessions' AND column_name='session_date')
  THEN
    ALTER TABLE checkin_sessions RENAME COLUMN date TO session_date;
  END IF;
END $$;
ALTER TABLE checkin_sessions ADD COLUMN IF NOT EXISTS created_by text;

-- 3) Check-iny (checkins): pole rodziny, kod bezpieczeństwa oraz dane gościa (check-in bez konta ucznia).
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS household_id       uuid;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS security_code      text;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS is_guest           boolean NOT NULL DEFAULT false;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS guest_name         text;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS guest_birth_year   integer;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS guest_parent_name  text;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS guest_parent_phone text;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS guest_allergies    text;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS guest_notes        text;
