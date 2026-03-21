-- =====================================================
-- POLITYKI RLS DLA MULTI-TENANCY
-- =====================================================

-- Funkcja pomocnicza do RLS
CREATE OR REPLACE FUNCTION tenant_isolation_policy(row_tenant_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Super admin ma dostęp do wszystkiego
  IF is_super_admin() THEN
    RETURN TRUE;
  END IF;

  -- Użytkownik ma dostęp tylko do danych swojego tenanta
  RETURN row_tenant_id = get_current_tenant_id();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- MEMBERS (zawsze istnieje)
-- =====================================================
DROP POLICY IF EXISTS "Members tenant isolation" ON members;
DROP POLICY IF EXISTS "Members are viewable by tenant users" ON members;
DROP POLICY IF EXISTS "Members are editable by tenant admins" ON members;
DROP POLICY IF EXISTS "members_select_authenticated" ON members;
DROP POLICY IF EXISTS "members_insert_admin" ON members;
DROP POLICY IF EXISTS "members_update_admin" ON members;
DROP POLICY IF EXISTS "members_delete_admin" ON members;

CREATE POLICY "Members tenant isolation"
  ON members FOR ALL
  USING (tenant_isolation_policy(tenant_id));

-- =====================================================
-- GROUPS (zawsze istnieje)
-- =====================================================
DROP POLICY IF EXISTS "Groups tenant isolation" ON groups;
DROP POLICY IF EXISTS "groups_select_authenticated" ON groups;
DROP POLICY IF EXISTS "groups_insert_admin" ON groups;
DROP POLICY IF EXISTS "groups_update_admin" ON groups;

CREATE POLICY "Groups tenant isolation"
  ON groups FOR ALL
  USING (tenant_isolation_policy(tenant_id));

-- =====================================================
-- EVENTS (zawsze istnieje)
-- =====================================================
DROP POLICY IF EXISTS "Events tenant isolation" ON events;
DROP POLICY IF EXISTS "events_select_authenticated" ON events;
DROP POLICY IF EXISTS "events_insert_admin" ON events;

CREATE POLICY "Events tenant isolation"
  ON events FOR ALL
  USING (tenant_isolation_policy(tenant_id));

-- =====================================================
-- HOUSEHOLDS (zawsze istnieje)
-- =====================================================
DROP POLICY IF EXISTS "Households tenant isolation" ON households;
DROP POLICY IF EXISTS "households_select_authenticated" ON households;
DROP POLICY IF EXISTS "households_insert_admin" ON households;

CREATE POLICY "Households tenant isolation"
  ON households FOR ALL
  USING (tenant_isolation_policy(tenant_id));

-- =====================================================
-- GROUP_MEMBERS (zawsze istnieje)
-- =====================================================
DROP POLICY IF EXISTS "Group members tenant isolation" ON group_members;
DROP POLICY IF EXISTS "group_members_select_authenticated" ON group_members;
DROP POLICY IF EXISTS "group_members_insert_admin" ON group_members;

CREATE POLICY "Group members tenant isolation"
  ON group_members FOR ALL
  USING (tenant_isolation_policy(tenant_id));

-- =====================================================
-- APP_USERS (specjalna polityka)
-- =====================================================
DROP POLICY IF EXISTS "Users can view themselves" ON app_users;
DROP POLICY IF EXISTS "Super admins can view all users" ON app_users;
DROP POLICY IF EXISTS "Tenant admins can view tenant users" ON app_users;
DROP POLICY IF EXISTS "Super admins can manage all users" ON app_users;
DROP POLICY IF EXISTS "app_users_select_own" ON app_users;
DROP POLICY IF EXISTS "app_users_select_all_admin" ON app_users;
DROP POLICY IF EXISTS "app_users_insert_admin" ON app_users;
DROP POLICY IF EXISTS "app_users_update_admin" ON app_users;

-- Użytkownicy mogą widzieć siebie
CREATE POLICY "Users can view themselves"
  ON app_users FOR SELECT
  USING (auth_user_id = auth.uid());

-- Super admin widzi wszystkich
CREATE POLICY "Super admins can view all users"
  ON app_users FOR SELECT
  USING (is_super_admin());

-- Admin tenanta widzi użytkowników swojego tenanta
CREATE POLICY "Tenant admins can view tenant users"
  ON app_users FOR SELECT
  USING (
    tenant_id = get_current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM app_users u
      WHERE u.auth_user_id = auth.uid()
      AND u.tenant_role = 'admin'
    )
  );

-- Super admin może wszystko
CREATE POLICY "Super admins can manage all users"
  ON app_users FOR ALL
  USING (is_super_admin());

-- =====================================================
-- DYNAMICZNE POLITYKI DLA OPCJONALNYCH TABEL
-- =====================================================

-- Kids students
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'kids_students') THEN
    DROP POLICY IF EXISTS "Kids students tenant isolation" ON kids_students;
    EXECUTE 'CREATE POLICY "Kids students tenant isolation" ON kids_students FOR ALL USING (tenant_isolation_policy(tenant_id))';
  END IF;
END $$;

-- Kids groups
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'kids_groups') THEN
    DROP POLICY IF EXISTS "Kids groups tenant isolation" ON kids_groups;
    EXECUTE 'CREATE POLICY "Kids groups tenant isolation" ON kids_groups FOR ALL USING (tenant_isolation_policy(tenant_id))';
  END IF;
END $$;

-- Checkin sessions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'checkin_sessions') THEN
    DROP POLICY IF EXISTS "Checkin sessions tenant isolation" ON checkin_sessions;
    EXECUTE 'CREATE POLICY "Checkin sessions tenant isolation" ON checkin_sessions FOR ALL USING (tenant_isolation_policy(tenant_id))';
  END IF;
END $$;

-- Checkin locations
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'checkin_locations') THEN
    DROP POLICY IF EXISTS "Checkin locations tenant isolation" ON checkin_locations;
    EXECUTE 'CREATE POLICY "Checkin locations tenant isolation" ON checkin_locations FOR ALL USING (tenant_isolation_policy(tenant_id))';
  END IF;
END $$;

-- Checkins
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'checkins') THEN
    DROP POLICY IF EXISTS "Checkins tenant isolation" ON checkins;
    EXECUTE 'CREATE POLICY "Checkins tenant isolation" ON checkins FOR ALL USING (tenant_isolation_policy(tenant_id))';
  END IF;
END $$;

-- Parent contacts
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'parent_contacts') THEN
    DROP POLICY IF EXISTS "Parent contacts tenant isolation" ON parent_contacts;
    EXECUTE 'CREATE POLICY "Parent contacts tenant isolation" ON parent_contacts FOR ALL USING (tenant_isolation_policy(tenant_id))';
  END IF;
END $$;

-- Home groups
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'home_groups') THEN
    DROP POLICY IF EXISTS "Home groups tenant isolation" ON home_groups;
    EXECUTE 'CREATE POLICY "Home groups tenant isolation" ON home_groups FOR ALL USING (tenant_isolation_policy(tenant_id))';
  END IF;
END $$;

-- Expenses
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'expenses') THEN
    DROP POLICY IF EXISTS "Expenses tenant isolation" ON expenses;
    EXECUTE 'CREATE POLICY "Expenses tenant isolation" ON expenses FOR ALL USING (tenant_isolation_policy(tenant_id))';
  END IF;
END $$;

-- Expense categories
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'expense_categories') THEN
    DROP POLICY IF EXISTS "Expense categories tenant isolation" ON expense_categories;
    EXECUTE 'CREATE POLICY "Expense categories tenant isolation" ON expense_categories FOR ALL USING (tenant_isolation_policy(tenant_id))';
  END IF;
END $$;

-- Forms
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'forms') THEN
    DROP POLICY IF EXISTS "Forms tenant isolation" ON forms;
    EXECUTE 'CREATE POLICY "Forms tenant isolation" ON forms FOR ALL USING (tenant_isolation_policy(tenant_id))';
  END IF;
END $$;

-- Form submissions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'form_submissions') THEN
    DROP POLICY IF EXISTS "Form submissions tenant isolation" ON form_submissions;
    EXECUTE 'CREATE POLICY "Form submissions tenant isolation" ON form_submissions FOR ALL USING (tenant_isolation_policy(tenant_id))';
  END IF;
END $$;

-- Mail accounts
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mail_accounts') THEN
    DROP POLICY IF EXISTS "Mail accounts tenant isolation" ON mail_accounts;
    EXECUTE 'CREATE POLICY "Mail accounts tenant isolation" ON mail_accounts FOR ALL USING (tenant_isolation_policy(tenant_id))';
  END IF;
END $$;

-- Schedule assignments
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'schedule_assignments') THEN
    DROP POLICY IF EXISTS "Schedule assignments tenant isolation" ON schedule_assignments;
    EXECUTE 'CREATE POLICY "Schedule assignments tenant isolation" ON schedule_assignments FOR ALL USING (tenant_isolation_policy(tenant_id))';
  END IF;
END $$;

-- iCal subscriptions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ical_subscriptions') THEN
    DROP POLICY IF EXISTS "iCal subscriptions tenant isolation" ON ical_subscriptions;
    EXECUTE 'CREATE POLICY "iCal subscriptions tenant isolation" ON ical_subscriptions FOR ALL USING (tenant_isolation_policy(tenant_id))';
  END IF;
END $$;

-- Komentarz
COMMENT ON FUNCTION tenant_isolation_policy IS 'Funkcja sprawdzająca izolację danych między tenantami';
