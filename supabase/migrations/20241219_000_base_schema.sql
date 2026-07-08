-- =============================================================================
-- AVENIT - BASE SCHEMA
-- Podstawowa struktura bazy danych dla aplikacji SaaS do zarządzania kościołem
-- =============================================================================

-- =============================================================================
-- 1. TABELA APP_USERS - Użytkownicy aplikacji
-- =============================================================================

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'user',
  is_active BOOLEAN DEFAULT TRUE,
  is_super_admin BOOLEAN DEFAULT FALSE,
  tenant_id UUID,
  tenant_role VARCHAR(20) DEFAULT 'user',
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  avatar_url TEXT,
  phone VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email);
CREATE INDEX IF NOT EXISTS idx_app_users_auth_user_id ON app_users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role);
CREATE INDEX IF NOT EXISTS idx_app_users_tenant ON app_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_app_users_super_admin ON app_users(is_super_admin) WHERE is_super_admin = TRUE;

-- RLS dla app_users
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_users_select_own" ON app_users
  FOR SELECT TO authenticated
  USING (auth.jwt()->>'email' = email);

CREATE POLICY "app_users_select_all_admin" ON app_users
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE email = auth.jwt()->>'email'
      AND role IN ('superadmin', 'rada_starszych', 'koordynator')
    )
  );

CREATE POLICY "app_users_insert_admin" ON app_users
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE email = auth.jwt()->>'email'
      AND role IN ('superadmin', 'rada_starszych')
    )
  );

CREATE POLICY "app_users_update_admin" ON app_users
  FOR UPDATE TO authenticated
  USING (
    auth.jwt()->>'email' = email
    OR EXISTS (
      SELECT 1 FROM app_users
      WHERE email = auth.jwt()->>'email'
      AND role IN ('superadmin', 'rada_starszych')
    )
  );

-- =============================================================================
-- 2. TABELA MEMBERS - Członkowie kościoła
-- =============================================================================

CREATE TABLE IF NOT EXISTS members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  city VARCHAR(100),
  postal_code VARCHAR(20),
  birth_date DATE,
  gender VARCHAR(20),
  membership_status VARCHAR(50) DEFAULT 'active',
  membership_date DATE,
  baptism_date DATE,
  notes TEXT,
  photo_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);
CREATE INDEX IF NOT EXISTS idx_members_status ON members(membership_status);
CREATE INDEX IF NOT EXISTS idx_members_name ON members(last_name, first_name);

ALTER TABLE members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_select_authenticated" ON members
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "members_insert_admin" ON members
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE email = auth.jwt()->>'email'
      AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
    )
  );

CREATE POLICY "members_update_admin" ON members
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE email = auth.jwt()->>'email'
      AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
    )
  );

CREATE POLICY "members_delete_admin" ON members
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE email = auth.jwt()->>'email'
      AND role IN ('superadmin', 'rada_starszych')
    )
  );

-- =============================================================================
-- 3. TABELA GROUPS - Grupy (domowe, służby, itp.)
-- =============================================================================

CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50) DEFAULT 'home_group',
  leader_id UUID REFERENCES members(id) ON DELETE SET NULL,
  meeting_day VARCHAR(20),
  meeting_time TIME,
  meeting_location TEXT,
  max_members INTEGER,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_groups_type ON groups(type);
CREATE INDEX IF NOT EXISTS idx_groups_leader ON groups(leader_id);

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "groups_select_authenticated" ON groups
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "groups_insert_admin" ON groups
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE email = auth.jwt()->>'email'
      AND role IN ('superadmin', 'rada_starszych', 'koordynator')
    )
  );

CREATE POLICY "groups_update_admin" ON groups
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE email = auth.jwt()->>'email'
      AND role IN ('superadmin', 'rada_starszych', 'koordynator')
    )
  );

-- =============================================================================
-- 4. TABELA GROUP_MEMBERS - Członkowie grup
-- =============================================================================

CREATE TABLE IF NOT EXISTS group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_member ON group_members(member_id);

ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_members_select_authenticated" ON group_members
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "group_members_insert_admin" ON group_members
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE email = auth.jwt()->>'email'
      AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
    )
  );

-- =============================================================================
-- 5. TABELA EVENTS - Wydarzenia
-- =============================================================================

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  event_type VARCHAR(50) DEFAULT 'service',
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  location TEXT,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_rule TEXT,
  max_participants INTEGER,
  is_public BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES app_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_start_date ON events(start_date);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_select_authenticated" ON events
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "events_insert_admin" ON events
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE email = auth.jwt()->>'email'
      AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
    )
  );

-- =============================================================================
-- 6. TABELA HOUSEHOLDS - Gospodarstwa domowe
-- =============================================================================

CREATE TABLE IF NOT EXISTS households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  address TEXT,
  city VARCHAR(100),
  postal_code VARCHAR(20),
  phone VARCHAR(50),
  primary_contact_id UUID REFERENCES members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE households ENABLE ROW LEVEL SECURITY;

CREATE POLICY "households_select_authenticated" ON households
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "households_insert_admin" ON households
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE email = auth.jwt()->>'email'
      AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
    )
  );

-- Dodanie household_id do members
ALTER TABLE members ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id) ON DELETE SET NULL;

-- =============================================================================
-- 7. TRIGGER - Automatyczne tworzenie app_user po rejestracji
-- =============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.app_users (email, auth_user_id, name, role)
  VALUES (
    NEW.email,
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
    'user'
  )
  ON CONFLICT (email) DO UPDATE SET
    auth_user_id = EXCLUDED.auth_user_id,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- =============================================================================
-- 8. FUNKCJA AKTUALIZACJI UPDATED_AT
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggery dla updated_at
CREATE TRIGGER update_app_users_updated_at
  BEFORE UPDATE ON app_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_members_updated_at
  BEFORE UPDATE ON members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_groups_updated_at
  BEFORE UPDATE ON groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_households_updated_at
  BEFORE UPDATE ON households
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
