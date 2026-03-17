-- Migracja naprawiająca polityki RLS dla team_member_roles
-- Uruchom ten skrypt w Supabase SQL Editor

-- Najpierw usuń istniejące polityki (jeśli istnieją)
DROP POLICY IF EXISTS "Allow full access for authenticated users on team_member_roles" ON team_member_roles;
DROP POLICY IF EXISTS "Allow full access for authenticated users on team_roles" ON team_roles;

-- Upewnij się że RLS jest włączone
ALTER TABLE team_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_member_roles ENABLE ROW LEVEL SECURITY;

-- Utwórz nowe polityki z poprawną składnią dla Supabase
-- Dla team_roles
CREATE POLICY "Enable read access for authenticated users on team_roles" ON team_roles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Enable insert access for authenticated users on team_roles" ON team_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Enable update access for authenticated users on team_roles" ON team_roles
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Enable delete access for authenticated users on team_roles" ON team_roles
  FOR DELETE
  TO authenticated
  USING (true);

-- Dla team_member_roles
CREATE POLICY "Enable read access for authenticated users on team_member_roles" ON team_member_roles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Enable insert access for authenticated users on team_member_roles" ON team_member_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Enable update access for authenticated users on team_member_roles" ON team_member_roles
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Enable delete access for authenticated users on team_member_roles" ON team_member_roles
  FOR DELETE
  TO authenticated
  USING (true);

-- Sprawdź czy tabela atmosfera_members istnieje, jeśli nie - utwórz ją
CREATE TABLE IF NOT EXISTS atmosfera_members (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(100) DEFAULT 'Atmosfera',
  email VARCHAR(255),
  phone VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS dla atmosfera_members
ALTER TABLE atmosfera_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for authenticated users on atmosfera_members" ON atmosfera_members
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Enable insert access for authenticated users on atmosfera_members" ON atmosfera_members
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Enable update access for authenticated users on atmosfera_members" ON atmosfera_members
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Enable delete access for authenticated users on atmosfera_members" ON atmosfera_members
  FOR DELETE
  TO authenticated
  USING (true);
