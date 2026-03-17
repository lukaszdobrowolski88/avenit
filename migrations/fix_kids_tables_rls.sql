-- Migracja naprawiająca polityki RLS dla tabel kids_*
-- Uruchom ten skrypt w Supabase SQL Editor

-- Sprawdź i utwórz tabelę kids_teachers jeśli nie istnieje
CREATE TABLE IF NOT EXISTS kids_teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(100) DEFAULT 'Nauczyciel',
  email VARCHAR(255),
  phone VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sprawdź i utwórz tabelę kids_groups jeśli nie istnieje
CREATE TABLE IF NOT EXISTS kids_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  room VARCHAR(100),
  age_range VARCHAR(50),
  teacher_ids UUID[] DEFAULT '{}',
  materials JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sprawdź i utwórz tabelę kids_students jeśli nie istnieje
CREATE TABLE IF NOT EXISTS kids_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(255) NOT NULL,
  birth_year INTEGER,
  parent_info TEXT,
  notes TEXT,
  group_id UUID REFERENCES kids_groups(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Włącz RLS dla wszystkich tabel kids_*
ALTER TABLE kids_teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE kids_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE kids_students ENABLE ROW LEVEL SECURITY;

-- Usuń istniejące polityki (jeśli istnieją)
DROP POLICY IF EXISTS "Enable all for authenticated users on kids_teachers" ON kids_teachers;
DROP POLICY IF EXISTS "Enable read for authenticated on kids_teachers" ON kids_teachers;
DROP POLICY IF EXISTS "Enable insert for authenticated on kids_teachers" ON kids_teachers;
DROP POLICY IF EXISTS "Enable update for authenticated on kids_teachers" ON kids_teachers;
DROP POLICY IF EXISTS "Enable delete for authenticated on kids_teachers" ON kids_teachers;

DROP POLICY IF EXISTS "Enable all for authenticated users on kids_groups" ON kids_groups;
DROP POLICY IF EXISTS "Enable read for authenticated on kids_groups" ON kids_groups;
DROP POLICY IF EXISTS "Enable insert for authenticated on kids_groups" ON kids_groups;
DROP POLICY IF EXISTS "Enable update for authenticated on kids_groups" ON kids_groups;
DROP POLICY IF EXISTS "Enable delete for authenticated on kids_groups" ON kids_groups;

DROP POLICY IF EXISTS "Enable all for authenticated users on kids_students" ON kids_students;
DROP POLICY IF EXISTS "Enable read for authenticated on kids_students" ON kids_students;
DROP POLICY IF EXISTS "Enable insert for authenticated on kids_students" ON kids_students;
DROP POLICY IF EXISTS "Enable update for authenticated on kids_students" ON kids_students;
DROP POLICY IF EXISTS "Enable delete for authenticated on kids_students" ON kids_students;

-- Utwórz nowe polityki dla kids_teachers
CREATE POLICY "Enable read for authenticated on kids_teachers" ON kids_teachers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated on kids_teachers" ON kids_teachers
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated on kids_teachers" ON kids_teachers
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable delete for authenticated on kids_teachers" ON kids_teachers
  FOR DELETE TO authenticated USING (true);

-- Utwórz nowe polityki dla kids_groups
CREATE POLICY "Enable read for authenticated on kids_groups" ON kids_groups
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated on kids_groups" ON kids_groups
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated on kids_groups" ON kids_groups
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable delete for authenticated on kids_groups" ON kids_groups
  FOR DELETE TO authenticated USING (true);

-- Utwórz nowe polityki dla kids_students
CREATE POLICY "Enable read for authenticated on kids_students" ON kids_students
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated on kids_students" ON kids_students
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated on kids_students" ON kids_students
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable delete for authenticated on kids_students" ON kids_students
  FOR DELETE TO authenticated USING (true);
