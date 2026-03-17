-- Tabela służb dla zespołów (Uwielbienia, Media, Atmosfera)
CREATE TABLE IF NOT EXISTS team_roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  team_type VARCHAR(50) NOT NULL, -- 'worship', 'media', 'atmosfera'
  description TEXT,
  field_key VARCHAR(100), -- klucz pola w programs.zespol/produkcja/atmosfera_team (np. 'piano', 'naglosnienie')
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indeks dla szybkiego wyszukiwania po typie zespołu
CREATE INDEX IF NOT EXISTS idx_team_roles_team_type ON team_roles(team_type);

-- Tabela łącząca służby z członkami zespołu
CREATE TABLE IF NOT EXISTS team_member_roles (
  id SERIAL PRIMARY KEY,
  member_id INT NOT NULL,
  member_table VARCHAR(50) NOT NULL, -- 'worship_team', 'media_team', 'atmosfera_members'
  role_id INT NOT NULL REFERENCES team_roles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(member_id, member_table, role_id)
);

-- Indeks dla szybkiego wyszukiwania po członku
CREATE INDEX IF NOT EXISTS idx_team_member_roles_member ON team_member_roles(member_id, member_table);

-- RLS (Row Level Security)
ALTER TABLE team_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_member_roles ENABLE ROW LEVEL SECURITY;

-- Polityki pozwalające na pełny dostęp dla uwierzytelnionych użytkowników
CREATE POLICY "Allow full access for authenticated users on team_roles" ON team_roles
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow full access for authenticated users on team_member_roles" ON team_member_roles
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Wstępne dane dla zespołu uwielbienia
INSERT INTO team_roles (name, team_type, field_key, display_order) VALUES
  ('Lider Uwielbienia', 'worship', 'lider', 1),
  ('Piano', 'worship', 'piano', 2),
  ('Gitara Akustyczna', 'worship', 'gitara_akustyczna', 3),
  ('Gitara Elektryczna', 'worship', 'gitara_elektryczna', 4),
  ('Gitara Basowa', 'worship', 'bas', 5),
  ('Wokale', 'worship', 'wokale', 6),
  ('Cajon / Perkusja', 'worship', 'cajon', 7);

-- Wstępne dane dla produkcji/media
INSERT INTO team_roles (name, team_type, field_key, display_order) VALUES
  ('Nagłośnienie', 'media', 'naglosnienie', 1),
  ('ProPresenter', 'media', 'propresenter', 2),
  ('Social Media', 'media', 'social', 3),
  ('Host wydarzenia', 'media', 'host', 4);

-- Wstępne dane dla atmosfera team
INSERT INTO team_roles (name, team_type, field_key, display_order) VALUES
  ('Przygotowanie', 'atmosfera', 'przygotowanie', 1),
  ('Witanie', 'atmosfera', 'witanie', 2);
