-- =====================================================
-- KIDS CHECK-IN SYSTEM - Migracja tabel
-- =====================================================

-- Tabela gospodarstw domowych (rodzin)
CREATE TABLE IF NOT EXISTS households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_name VARCHAR(255) NOT NULL,
  phone_last_four VARCHAR(4) NOT NULL,
  phone_full VARCHAR(50),
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeks dla szybkiego wyszukiwania po ostatnich 4 cyfrach
CREATE INDEX IF NOT EXISTS idx_households_phone_last_four ON households(phone_last_four);

-- Tabela kontaktów rodziców/opiekunów
CREATE TABLE IF NOT EXISTS parent_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(255),
  relationship VARCHAR(50) DEFAULT 'Rodzic',
  is_primary BOOLEAN DEFAULT FALSE,
  can_pickup BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parent_contacts_household ON parent_contacts(household_id);

-- Modyfikacja tabeli kids_students - dodanie powiązania z household
DO $$
BEGIN
  -- Dodaj kolumnę household_id jeśli nie istnieje
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'kids_students' AND column_name = 'household_id'
  ) THEN
    ALTER TABLE kids_students ADD COLUMN household_id UUID REFERENCES households(id) ON DELETE SET NULL;
  END IF;

  -- Dodaj kolumnę allergies jeśli nie istnieje
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'kids_students' AND column_name = 'allergies'
  ) THEN
    ALTER TABLE kids_students ADD COLUMN allergies TEXT;
  END IF;

  -- Dodaj kolumnę medical_notes jeśli nie istnieje
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'kids_students' AND column_name = 'medical_notes'
  ) THEN
    ALTER TABLE kids_students ADD COLUMN medical_notes TEXT;
  END IF;

  -- Dodaj kolumnę photo_url jeśli nie istnieje
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'kids_students' AND column_name = 'photo_url'
  ) THEN
    ALTER TABLE kids_students ADD COLUMN photo_url TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_kids_students_household ON kids_students(household_id);

-- Tabela lokalizacji/sal check-in
CREATE TABLE IF NOT EXISTS checkin_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  room_number VARCHAR(50),
  min_age INTEGER,
  max_age INTEGER,
  capacity INTEGER,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela sesji check-in
CREATE TABLE IF NOT EXISTS checkin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  session_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  is_active BOOLEAN DEFAULT TRUE,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkin_sessions_date ON checkin_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_checkin_sessions_active ON checkin_sessions(is_active) WHERE is_active = TRUE;

-- Tabela rekordów check-in
-- UWAGA: student_id jest BIGINT bo istniejąca tabela kids_students ma id typu bigint
CREATE TABLE IF NOT EXISTS checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES checkin_sessions(id) ON DELETE CASCADE,
  student_id BIGINT REFERENCES kids_students(id) ON DELETE SET NULL,  -- NULL dla gości, BIGINT bo kids_students.id jest bigint
  location_id UUID NOT NULL REFERENCES checkin_locations(id) ON DELETE RESTRICT,
  household_id UUID REFERENCES households(id) ON DELETE SET NULL,
  security_code VARCHAR(10) NOT NULL,
  checked_in_at TIMESTAMPTZ DEFAULT NOW(),
  checked_out_at TIMESTAMPTZ,
  checked_in_by TEXT,
  checked_out_by TEXT,
  -- Pola dla gości (gdy student_id IS NULL)
  is_guest BOOLEAN DEFAULT FALSE,
  guest_name VARCHAR(255),
  guest_birth_year INTEGER,
  guest_parent_name VARCHAR(255),
  guest_parent_phone VARCHAR(50),
  guest_allergies TEXT,
  guest_notes TEXT
);

-- Indeksy dla checkins
CREATE INDEX IF NOT EXISTS idx_checkins_session ON checkins(session_id);
CREATE INDEX IF NOT EXISTS idx_checkins_student ON checkins(student_id);
CREATE INDEX IF NOT EXISTS idx_checkins_location ON checkins(location_id);
CREATE INDEX IF NOT EXISTS idx_checkins_security_code ON checkins(security_code);
CREATE INDEX IF NOT EXISTS idx_checkins_active ON checkins(session_id) WHERE checked_out_at IS NULL;

-- Unikalne: jedno dziecko = jeden aktywny check-in na sesję (tylko dla zarejestrowanych)
-- student_id jest BIGINT
CREATE UNIQUE INDEX IF NOT EXISTS idx_checkins_unique_student
  ON checkins(session_id, student_id)
  WHERE checked_out_at IS NULL AND student_id IS NOT NULL;

-- =====================================================
-- Funkcja generowania kodu bezpieczeństwa
-- =====================================================
CREATE OR REPLACE FUNCTION generate_security_code(p_session_id UUID, p_household_id UUID)
RETURNS VARCHAR(10) AS $$
DECLARE
  existing_code VARCHAR(10);
  new_code VARCHAR(10);
  letter CHAR(1);
  number VARCHAR(2);
BEGIN
  -- Sprawdź czy rodzina ma już kod w tej sesji
  IF p_household_id IS NOT NULL THEN
    SELECT security_code INTO existing_code
    FROM checkins
    WHERE session_id = p_session_id
      AND household_id = p_household_id
      AND checked_out_at IS NULL
    LIMIT 1;

    IF existing_code IS NOT NULL THEN
      RETURN existing_code;
    END IF;
  END IF;

  -- Generuj nowy unikalny kod (format: A12, B34, etc.)
  LOOP
    -- Losowa litera A-Z
    letter := chr(65 + floor(random() * 26)::int);
    -- Losowa liczba 10-99
    number := lpad((10 + floor(random() * 90)::int)::text, 2, '0');
    new_code := letter || number;

    -- Sprawdź czy kod jest unikalny w tej sesji
    IF NOT EXISTS (
      SELECT 1 FROM checkins
      WHERE session_id = p_session_id
        AND security_code = new_code
        AND checked_out_at IS NULL
    ) THEN
      RETURN new_code;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- RLS (Row Level Security)
-- =====================================================
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkin_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;

-- Polityki RLS - wszyscy zalogowani użytkownicy mają dostęp
CREATE POLICY "households_select_authenticated" ON households
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "households_insert_authenticated" ON households
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "households_update_authenticated" ON households
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "households_delete_authenticated" ON households
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "parent_contacts_select_authenticated" ON parent_contacts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "parent_contacts_insert_authenticated" ON parent_contacts
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "parent_contacts_update_authenticated" ON parent_contacts
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "parent_contacts_delete_authenticated" ON parent_contacts
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "checkin_locations_select_authenticated" ON checkin_locations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "checkin_locations_insert_authenticated" ON checkin_locations
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "checkin_locations_update_authenticated" ON checkin_locations
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "checkin_locations_delete_authenticated" ON checkin_locations
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "checkin_sessions_select_authenticated" ON checkin_sessions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "checkin_sessions_insert_authenticated" ON checkin_sessions
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "checkin_sessions_update_authenticated" ON checkin_sessions
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "checkin_sessions_delete_authenticated" ON checkin_sessions
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "checkins_select_authenticated" ON checkins
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "checkins_insert_authenticated" ON checkins
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "checkins_update_authenticated" ON checkins
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "checkins_delete_authenticated" ON checkins
  FOR DELETE TO authenticated USING (true);

-- =====================================================
-- Włącz Realtime dla tabeli checkins
-- =====================================================
ALTER PUBLICATION supabase_realtime ADD TABLE checkins;

-- =====================================================
-- Trigger dla updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_households_updated_at ON households;
CREATE TRIGGER update_households_updated_at
  BEFORE UPDATE ON households
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
