-- Tabela liderów grup domowych
CREATE TABLE IF NOT EXISTS home_group_leaders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela grup domowych
CREATE TABLE IF NOT EXISTS home_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  leader_id UUID REFERENCES home_group_leaders(id) ON DELETE SET NULL,
  meeting_day TEXT,
  meeting_time TIME,
  location TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela członków grup domowych
CREATE TABLE IF NOT EXISTS home_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  group_id UUID REFERENCES home_groups(id) ON DELETE SET NULL,
  is_leader BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeksy dla lepszej wydajności
CREATE INDEX IF NOT EXISTS idx_home_groups_leader ON home_groups(leader_id);
CREATE INDEX IF NOT EXISTS idx_home_group_members_group ON home_group_members(group_id);

-- RLS (Row Level Security) - opcjonalnie, jeśli używasz RLS
ALTER TABLE home_group_leaders ENABLE ROW LEVEL SECURITY;
ALTER TABLE home_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE home_group_members ENABLE ROW LEVEL SECURITY;

-- Polityki RLS - pozwól na wszystko dla zalogowanych użytkowników
CREATE POLICY "Allow all for authenticated users" ON home_group_leaders
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated users" ON home_groups
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated users" ON home_group_members
  FOR ALL USING (auth.role() = 'authenticated');

-- Funkcja do automatycznej aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggery do automatycznej aktualizacji updated_at
CREATE TRIGGER update_home_group_leaders_updated_at
  BEFORE UPDATE ON home_group_leaders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_home_groups_updated_at
  BEFORE UPDATE ON home_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_home_group_members_updated_at
  BEFORE UPDATE ON home_group_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
