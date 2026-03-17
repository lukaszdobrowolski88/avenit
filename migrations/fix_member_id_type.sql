-- Migracja naprawiająca typ member_id w team_member_roles
-- Problem: atmosfera_members używa UUID, a team_member_roles ma member_id jako INT
-- Rozwiązanie: zmień member_id na TEXT aby obsługiwać oba typy

-- WAŻNE: Uruchom ten skrypt w Supabase SQL Editor

-- Krok 1: Usuń istniejące ograniczenia i indeksy
DROP INDEX IF EXISTS idx_team_member_roles_member;
ALTER TABLE team_member_roles DROP CONSTRAINT IF EXISTS team_member_roles_member_id_member_table_role_id_key;

-- Krok 2: Zmień typ kolumny member_id z INT na TEXT
ALTER TABLE team_member_roles
  ALTER COLUMN member_id TYPE TEXT USING member_id::TEXT;

-- Krok 3: Odtwórz indeks i ograniczenie unikalności
CREATE INDEX IF NOT EXISTS idx_team_member_roles_member ON team_member_roles(member_id, member_table);
ALTER TABLE team_member_roles ADD CONSTRAINT team_member_roles_member_id_member_table_role_id_key UNIQUE(member_id, member_table, role_id);

-- Krok 4: Upewnij się że polityki RLS są poprawne
DROP POLICY IF EXISTS "Allow full access for authenticated users on team_member_roles" ON team_member_roles;
DROP POLICY IF EXISTS "Enable read access for authenticated users on team_member_roles" ON team_member_roles;
DROP POLICY IF EXISTS "Enable insert access for authenticated users on team_member_roles" ON team_member_roles;
DROP POLICY IF EXISTS "Enable update access for authenticated users on team_member_roles" ON team_member_roles;
DROP POLICY IF EXISTS "Enable delete access for authenticated users on team_member_roles" ON team_member_roles;

ALTER TABLE team_member_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for authenticated users on team_member_roles" ON team_member_roles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Enable insert access for authenticated users on team_member_roles" ON team_member_roles
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable update access for authenticated users on team_member_roles" ON team_member_roles
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Enable delete access for authenticated users on team_member_roles" ON team_member_roles
  FOR DELETE TO authenticated USING (true);
