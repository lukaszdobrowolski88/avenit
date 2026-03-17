-- =====================================================
-- DODANIE POZOSTAŁYCH BRAKUJĄCYCH TABEL
-- Na podstawie błędów 404 z konsoli
-- =====================================================

-- =====================================================
-- 1. KIDS_EVENTS - wydarzenia dla dzieci
-- =====================================================
CREATE TABLE IF NOT EXISTS kids_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    location TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kids_events_tenant ON kids_events(tenant_id);
ALTER TABLE kids_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Kids events tenant isolation" ON kids_events FOR ALL
    USING (EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = kids_events.tenant_id)));

-- =====================================================
-- 2. ATMOSFERA_EVENTS - wydarzenia atmosfery
-- =====================================================
CREATE TABLE IF NOT EXISTS atmosfera_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    location TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_atmosfera_events_tenant ON atmosfera_events(tenant_id);
ALTER TABLE atmosfera_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Atmosfera events tenant isolation" ON atmosfera_events FOR ALL
    USING (EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = atmosfera_events.tenant_id)));

-- =====================================================
-- 3. HOMEGROUPS_EVENTS - wydarzenia grup domowych
-- =====================================================
CREATE TABLE IF NOT EXISTS homegroups_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    location TEXT,
    group_id UUID,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_homegroups_events_tenant ON homegroups_events(tenant_id);
ALTER TABLE homegroups_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Homegroups events tenant isolation" ON homegroups_events FOR ALL
    USING (EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = homegroups_events.tenant_id)));

-- =====================================================
-- 4. TEAM_ROLES - role w zespołach
-- =====================================================
CREATE TABLE IF NOT EXISTS team_roles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    team_type TEXT NOT NULL,
    name TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_roles_tenant ON team_roles(tenant_id);
ALTER TABLE team_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team roles tenant isolation" ON team_roles FOR ALL
    USING (EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = team_roles.tenant_id)));

-- =====================================================
-- 5. MEDIA_TEAM - członkowie media team
-- =====================================================
CREATE TABLE IF NOT EXISTS media_team (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    member_id UUID REFERENCES members(id) ON DELETE CASCADE,
    role TEXT,
    is_leader BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    full_name TEXT,
    email TEXT,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_team_tenant ON media_team(tenant_id);
ALTER TABLE media_team ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Media team tenant isolation" ON media_team FOR ALL
    USING (EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = media_team.tenant_id)));

-- =====================================================
-- 6. WORSHIP_TEAM - członkowie zespołu uwielbienia
-- =====================================================
CREATE TABLE IF NOT EXISTS worship_team (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    member_id UUID REFERENCES members(id) ON DELETE CASCADE,
    role TEXT,
    is_leader BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    full_name TEXT,
    email TEXT,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worship_team_tenant ON worship_team(tenant_id);
ALTER TABLE worship_team ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Worship team tenant isolation" ON worship_team FOR ALL
    USING (EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = worship_team.tenant_id)));

-- =====================================================
-- 7. ATMOSFERA_MEMBERS - członkowie atmosfery
-- =====================================================
CREATE TABLE IF NOT EXISTS atmosfera_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    member_id UUID REFERENCES members(id) ON DELETE CASCADE,
    role TEXT,
    is_leader BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    full_name TEXT,
    email TEXT,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_atmosfera_members_tenant ON atmosfera_members(tenant_id);
ALTER TABLE atmosfera_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Atmosfera members tenant isolation" ON atmosfera_members FOR ALL
    USING (EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = atmosfera_members.tenant_id)));

-- =====================================================
-- 8. TEACHING_SPEAKERS - mówcy/kaznodzieje
-- =====================================================
CREATE TABLE IF NOT EXISTS teaching_speakers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    bio TEXT,
    photo_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teaching_speakers_tenant ON teaching_speakers(tenant_id);
ALTER TABLE teaching_speakers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teaching speakers tenant isolation" ON teaching_speakers FOR ALL
    USING (EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = teaching_speakers.tenant_id)));

-- =====================================================
-- 9. KIDS_TEACHERS - nauczyciele dzieci
-- =====================================================
CREATE TABLE IF NOT EXISTS kids_teachers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    member_id UUID REFERENCES members(id) ON DELETE CASCADE,
    full_name TEXT,
    email TEXT,
    phone TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kids_teachers_tenant ON kids_teachers(tenant_id);
ALTER TABLE kids_teachers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Kids teachers tenant isolation" ON kids_teachers FOR ALL
    USING (EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = kids_teachers.tenant_id)));

-- =====================================================
-- 10. CUSTOM_MC_MEMBERS - członkowie niestandardowych modułów
-- =====================================================
CREATE TABLE IF NOT EXISTS custom_mc_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    member_id UUID REFERENCES members(id) ON DELETE CASCADE,
    module_key TEXT,
    role TEXT,
    is_leader BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    full_name TEXT,
    email TEXT,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_mc_members_tenant ON custom_mc_members(tenant_id);
ALTER TABLE custom_mc_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Custom mc members tenant isolation" ON custom_mc_members FOR ALL
    USING (EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = custom_mc_members.tenant_id)));

-- =====================================================
-- 11. USER_PRESENCE - obecność użytkowników (online status)
-- =====================================================
CREATE TABLE IF NOT EXISTS user_presence (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES app_users(id) ON DELETE CASCADE,
    user_email TEXT UNIQUE,
    status TEXT DEFAULT 'offline',
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_presence_email ON user_presence(user_email);
ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage presence" ON user_presence FOR ALL
    USING (auth.role() = 'authenticated');

-- =====================================================
-- 12. HOME_GROUPS - grupy domowe (alias dla groups)
-- =====================================================
CREATE TABLE IF NOT EXISTS home_groups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    leader_id UUID REFERENCES members(id) ON DELETE SET NULL,
    meeting_day TEXT,
    meeting_time TIME,
    location TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_home_groups_tenant ON home_groups(tenant_id);
ALTER TABLE home_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Home groups tenant isolation" ON home_groups FOR ALL
    USING (EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = home_groups.tenant_id)));

-- =====================================================
-- 13. HOME_GROUP_MEMBERS - członkowie grup domowych
-- =====================================================
CREATE TABLE IF NOT EXISTS home_group_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    group_id UUID REFERENCES home_groups(id) ON DELETE CASCADE,
    member_id UUID REFERENCES members(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(group_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_home_group_members_tenant ON home_group_members(tenant_id);
ALTER TABLE home_group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Home group members tenant isolation" ON home_group_members FOR ALL
    USING (EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = home_group_members.tenant_id)));

-- =====================================================
-- 14. MLODZIEZOWKA_MEMBERS - członkowie młodzieżówki
-- =====================================================
CREATE TABLE IF NOT EXISTS mlodziezowka_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    member_id UUID REFERENCES members(id) ON DELETE CASCADE,
    role TEXT,
    is_leader BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    full_name TEXT,
    email TEXT,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mlodziezowka_members_tenant ON mlodziezowka_members(tenant_id);
ALTER TABLE mlodziezowka_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Mlodziezowka members tenant isolation" ON mlodziezowka_members FOR ALL
    USING (EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = mlodziezowka_members.tenant_id)));

-- =====================================================
-- 15. MLODZIEZOWKA_EVENTS - wydarzenia młodzieżówki
-- =====================================================
CREATE TABLE IF NOT EXISTS mlodziezowka_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    location TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mlodziezowka_events_tenant ON mlodziezowka_events(tenant_id);
ALTER TABLE mlodziezowka_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Mlodziezowka events tenant isolation" ON mlodziezowka_events FOR ALL
    USING (EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = mlodziezowka_events.tenant_id)));

-- =====================================================
-- 16. MLODZIEZOWKA_TASKS - zadania młodzieżówki
-- =====================================================
CREATE TABLE IF NOT EXISTS mlodziezowka_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    assigned_to UUID,
    due_date TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'medium',
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mlodziezowka_tasks_tenant ON mlodziezowka_tasks(tenant_id);
ALTER TABLE mlodziezowka_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Mlodziezowka tasks tenant isolation" ON mlodziezowka_tasks FOR ALL
    USING (EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = mlodziezowka_tasks.tenant_id)));

-- =====================================================
-- 17. WORSHIP_EVENTS - wydarzenia uwielbienia
-- =====================================================
CREATE TABLE IF NOT EXISTS worship_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    location TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worship_events_tenant ON worship_events(tenant_id);
ALTER TABLE worship_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Worship events tenant isolation" ON worship_events FOR ALL
    USING (EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = worship_events.tenant_id)));

-- =====================================================
-- 18. MEDIA_EVENTS - wydarzenia media
-- =====================================================
CREATE TABLE IF NOT EXISTS media_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    location TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_events_tenant ON media_events(tenant_id);
ALTER TABLE media_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Media events tenant isolation" ON media_events FOR ALL
    USING (EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = media_events.tenant_id)));

-- =====================================================
-- 19. PARENT_CONTACTS - kontakty rodziców
-- =====================================================
CREATE TABLE IF NOT EXISTS parent_contacts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    student_id UUID REFERENCES kids_students(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    relationship TEXT,
    phone TEXT,
    email TEXT,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parent_contacts_tenant ON parent_contacts(tenant_id);
ALTER TABLE parent_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parent contacts tenant isolation" ON parent_contacts FOR ALL
    USING (EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = parent_contacts.tenant_id)));

-- =====================================================
-- 20. CHECKIN_SESSIONS - sesje check-in
-- =====================================================
CREATE TABLE IF NOT EXISTS checkin_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkin_sessions_tenant ON checkin_sessions(tenant_id);
ALTER TABLE checkin_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Checkin sessions tenant isolation" ON checkin_sessions FOR ALL
    USING (EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = checkin_sessions.tenant_id)));

-- =====================================================
-- 21. CHECKIN_LOCATIONS - lokalizacje check-in
-- =====================================================
CREATE TABLE IF NOT EXISTS checkin_locations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkin_locations_tenant ON checkin_locations(tenant_id);
ALTER TABLE checkin_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Checkin locations tenant isolation" ON checkin_locations FOR ALL
    USING (EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = checkin_locations.tenant_id)));

-- =====================================================
-- 22. CHECKINS - rekordy check-in
-- =====================================================
CREATE TABLE IF NOT EXISTS checkins (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    session_id UUID REFERENCES checkin_sessions(id) ON DELETE CASCADE,
    student_id UUID REFERENCES kids_students(id) ON DELETE CASCADE,
    location_id UUID REFERENCES checkin_locations(id) ON DELETE SET NULL,
    checked_in_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    checked_out_at TIMESTAMP WITH TIME ZONE,
    checked_in_by UUID,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_checkins_tenant ON checkins(tenant_id);
CREATE INDEX IF NOT EXISTS idx_checkins_session ON checkins(session_id);
ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Checkins tenant isolation" ON checkins FOR ALL
    USING (EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = checkins.tenant_id)));

-- =====================================================
-- 23. EXPENSES - wydatki (alias dla finance_transactions)
-- =====================================================
CREATE TABLE IF NOT EXISTS expenses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    category_id UUID,
    amount DECIMAL(10,2) NOT NULL,
    description TEXT,
    date DATE NOT NULL,
    team_type TEXT,
    receipt_url TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_tenant ON expenses(tenant_id);
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Expenses tenant isolation" ON expenses FOR ALL
    USING (EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = expenses.tenant_id)));

-- =====================================================
-- 24. EXPENSE_CATEGORIES - kategorie wydatków
-- =====================================================
CREATE TABLE IF NOT EXISTS expense_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT,
    icon TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_categories_tenant ON expense_categories(tenant_id);
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Expense categories tenant isolation" ON expense_categories FOR ALL
    USING (EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = expense_categories.tenant_id)));

-- =====================================================
-- 25. MAIL_ACCOUNTS - konta pocztowe
-- =====================================================
CREATE TABLE IF NOT EXISTS mail_accounts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT,
    smtp_host TEXT,
    smtp_port INTEGER,
    smtp_user TEXT,
    smtp_password TEXT,
    imap_host TEXT,
    imap_port INTEGER,
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mail_accounts_tenant ON mail_accounts(tenant_id);
ALTER TABLE mail_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Mail accounts tenant isolation" ON mail_accounts FOR ALL
    USING (EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = mail_accounts.tenant_id)));

-- =====================================================
-- REALTIME dla nowych tabel
-- =====================================================
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN SELECT unnest(ARRAY[
        'kids_events', 'atmosfera_events', 'homegroups_events', 'team_roles',
        'media_team', 'worship_team', 'atmosfera_members', 'teaching_speakers',
        'kids_teachers', 'custom_mc_members', 'user_presence', 'home_groups',
        'home_group_members', 'mlodziezowka_members', 'mlodziezowka_events',
        'mlodziezowka_tasks', 'worship_events', 'media_events', 'parent_contacts',
        'checkin_sessions', 'checkin_locations', 'checkins', 'expenses',
        'expense_categories', 'mail_accounts'
    ])
    LOOP
        BEGIN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', tbl);
        EXCEPTION WHEN duplicate_object THEN
            NULL;
        END;
    END LOOP;
END $$;
