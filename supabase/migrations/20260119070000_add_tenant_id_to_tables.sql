-- =====================================================
-- DODANIE TENANT_ID DO ISTNIEJĄCYCH TABEL
-- =====================================================

-- Modyfikacja tabeli app_users (zawsze istnieje - tworzymy w 000)
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS tenant_role VARCHAR(20) DEFAULT 'user';

CREATE INDEX IF NOT EXISTS idx_app_users_tenant ON app_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_app_users_super_admin ON app_users(is_super_admin) WHERE is_super_admin = TRUE;

-- Dodanie tenant_id do members (zawsze istnieje - tworzymy w 000)
ALTER TABLE members ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_members_tenant ON members(tenant_id);

-- Dodanie tenant_id do groups (zawsze istnieje - tworzymy w 000)
ALTER TABLE groups ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_groups_tenant ON groups(tenant_id);

-- Dodanie tenant_id do events (zawsze istnieje - tworzymy w 000)
ALTER TABLE events ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_events_tenant ON events(tenant_id);

-- Dodanie tenant_id do households (zawsze istnieje - tworzymy w 000)
ALTER TABLE households ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_households_tenant ON households(tenant_id);

-- Dodanie tenant_id do group_members (zawsze istnieje - tworzymy w 000)
ALTER TABLE group_members ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_group_members_tenant ON group_members(tenant_id);

-- Dodanie tenant_id do kids_students (opcjonalne)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'kids_students') THEN
    ALTER TABLE kids_students ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_kids_students_tenant ON kids_students(tenant_id);
  END IF;
END $$;

-- Dodanie tenant_id do kids_groups (opcjonalne)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'kids_groups') THEN
    ALTER TABLE kids_groups ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_kids_groups_tenant ON kids_groups(tenant_id);
  END IF;
END $$;

-- Dodanie tenant_id do checkin_sessions (opcjonalne)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'checkin_sessions') THEN
    ALTER TABLE checkin_sessions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_checkin_sessions_tenant ON checkin_sessions(tenant_id);
  END IF;
END $$;

-- Dodanie tenant_id do checkin_locations (opcjonalne)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'checkin_locations') THEN
    ALTER TABLE checkin_locations ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_checkin_locations_tenant ON checkin_locations(tenant_id);
  END IF;
END $$;

-- Dodanie tenant_id do checkins (opcjonalne)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'checkins') THEN
    ALTER TABLE checkins ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_checkins_tenant ON checkins(tenant_id);
  END IF;
END $$;

-- Dodanie tenant_id do parent_contacts (opcjonalne)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'parent_contacts') THEN
    ALTER TABLE parent_contacts ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_parent_contacts_tenant ON parent_contacts(tenant_id);
  END IF;
END $$;

-- Dodanie tenant_id do home_groups (opcjonalne)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'home_groups') THEN
    ALTER TABLE home_groups ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_home_groups_tenant ON home_groups(tenant_id);
  END IF;
END $$;

-- Dodanie tenant_id do expenses (opcjonalne)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'expenses') THEN
    ALTER TABLE expenses ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_expenses_tenant ON expenses(tenant_id);
  END IF;
END $$;

-- Dodanie tenant_id do expense_categories (opcjonalne)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'expense_categories') THEN
    ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_expense_categories_tenant ON expense_categories(tenant_id);
  END IF;
END $$;

-- Dodanie tenant_id do forms (opcjonalne)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'forms') THEN
    ALTER TABLE forms ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_forms_tenant ON forms(tenant_id);
  END IF;
END $$;

-- Dodanie tenant_id do form_submissions (opcjonalne)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'form_submissions') THEN
    ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_form_submissions_tenant ON form_submissions(tenant_id);
  END IF;
END $$;

-- Dodanie tenant_id do mail_accounts (opcjonalne)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mail_accounts') THEN
    ALTER TABLE mail_accounts ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_mail_accounts_tenant ON mail_accounts(tenant_id);
  END IF;
END $$;

-- Dodanie tenant_id do schedule_assignments (opcjonalne)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'schedule_assignments') THEN
    ALTER TABLE schedule_assignments ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_schedule_assignments_tenant ON schedule_assignments(tenant_id);
  END IF;
END $$;

-- Dodanie tenant_id do ical_subscriptions (opcjonalne)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ical_subscriptions') THEN
    ALTER TABLE ical_subscriptions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_ical_subscriptions_tenant ON ical_subscriptions(tenant_id);
  END IF;
END $$;

-- Dodanie tenant_id do materials_folders (opcjonalne)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'materials_folders') THEN
    ALTER TABLE materials_folders ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_materials_folders_tenant ON materials_folders(tenant_id);
  END IF;
END $$;

-- Dodanie tenant_id do materials_files (opcjonalne)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'materials_files') THEN
    ALTER TABLE materials_files ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_materials_files_tenant ON materials_files(tenant_id);
  END IF;
END $$;

-- Funkcja pomocnicza do pobierania tenant_id aktualnego użytkownika
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM app_users WHERE auth_user_id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER;

-- Funkcja sprawdzająca czy użytkownik jest super adminem
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT is_super_admin FROM app_users WHERE auth_user_id = auth.uid()),
    FALSE
  );
$$ LANGUAGE SQL SECURITY DEFINER;

-- Komentarz
COMMENT ON FUNCTION get_current_tenant_id IS 'Zwraca tenant_id aktualnie zalogowanego użytkownika';
COMMENT ON FUNCTION is_super_admin IS 'Sprawdza czy aktualnie zalogowany użytkownik jest super adminem';
