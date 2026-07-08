-- =====================================================
-- DODANIE BRAKUJĄCYCH TABEL Z AVENIT
-- =====================================================

-- =====================================================
-- 1. PROGRAMY (programs) - główna tabela programów nabożeństw
-- =====================================================
CREATE TABLE IF NOT EXISTS programs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    date DATE NOT NULL,
    time TIME,
    type TEXT DEFAULT 'regular',
    notes TEXT,
    songs JSONB DEFAULT '[]',
    elements JSONB DEFAULT '[]',
    status TEXT DEFAULT 'draft',
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_programs_tenant ON programs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_programs_date ON programs(date);

ALTER TABLE programs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Programs tenant isolation" ON programs;
CREATE POLICY "Programs tenant isolation" ON programs FOR ALL
    USING (
        EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = programs.tenant_id))
    );

-- =====================================================
-- 2. PIEŚNI (songs) - baza pieśni
-- =====================================================
CREATE TABLE IF NOT EXISTS songs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    author TEXT,
    lyrics TEXT,
    chords TEXT,
    key TEXT,
    tempo INTEGER,
    tags TEXT[],
    audio_url TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_songs_tenant ON songs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);

ALTER TABLE songs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Songs tenant isolation" ON songs;
CREATE POLICY "Songs tenant isolation" ON songs FOR ALL
    USING (
        EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = songs.tenant_id))
    );

-- =====================================================
-- 3. ZESPÓŁ (team_members) - członkowie zespołów służb
-- =====================================================
CREATE TABLE IF NOT EXISTS team_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    member_id UUID REFERENCES members(id) ON DELETE CASCADE,
    team_type TEXT NOT NULL, -- worship, media, atmosfera, kids, etc.
    role TEXT,
    is_leader BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_members_tenant ON team_members(tenant_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_type);

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members tenant isolation" ON team_members;
CREATE POLICY "Team members tenant isolation" ON team_members FOR ALL
    USING (
        EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = team_members.tenant_id))
    );

-- =====================================================
-- 4. ROLE W ZESPOLE (team_member_roles)
-- =====================================================
CREATE TABLE IF NOT EXISTS team_member_roles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    team_member_id UUID REFERENCES team_members(id) ON DELETE CASCADE,
    role_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_member_roles_tenant ON team_member_roles(tenant_id);

ALTER TABLE team_member_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team member roles tenant isolation" ON team_member_roles;
CREATE POLICY "Team member roles tenant isolation" ON team_member_roles FOR ALL
    USING (
        EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = team_member_roles.tenant_id))
    );

-- =====================================================
-- 5. GRAFIK SŁUŻB (schedule_assignments)
-- =====================================================
CREATE TABLE IF NOT EXISTS schedule_assignments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    program_id UUID REFERENCES programs(id) ON DELETE CASCADE,
    team_member_id UUID REFERENCES team_members(id) ON DELETE CASCADE,
    role TEXT,
    team_type TEXT,
    notes TEXT,
    status TEXT DEFAULT 'assigned',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schedule_assignments_tenant ON schedule_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_schedule_assignments_program ON schedule_assignments(program_id);

ALTER TABLE schedule_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Schedule assignments tenant isolation" ON schedule_assignments;
CREATE POLICY "Schedule assignments tenant isolation" ON schedule_assignments FOR ALL
    USING (
        EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = schedule_assignments.tenant_id))
    );

-- =====================================================
-- 6. ZADANIA (tasks)
-- =====================================================
CREATE TABLE IF NOT EXISTS tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    assigned_to UUID REFERENCES members(id) ON DELETE SET NULL,
    due_date TIMESTAMP WITH TIME ZONE,
    priority TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'pending',
    team_type TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_tenant ON tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tasks tenant isolation" ON tasks;
CREATE POLICY "Tasks tenant isolation" ON tasks FOR ALL
    USING (
        EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = tasks.tenant_id))
    );

-- =====================================================
-- 7. TABLICA OGŁOSZEŃ (wall_posts)
-- =====================================================
CREATE TABLE IF NOT EXISTS wall_posts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    author_id UUID REFERENCES members(id) ON DELETE SET NULL,
    team_type TEXT,
    is_pinned BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wall_posts_tenant ON wall_posts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wall_posts_team ON wall_posts(team_type);

ALTER TABLE wall_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Wall posts tenant isolation" ON wall_posts;
CREATE POLICY "Wall posts tenant isolation" ON wall_posts FOR ALL
    USING (
        EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = wall_posts.tenant_id))
    );

-- =====================================================
-- 8. PROŚBY MODLITEWNE (prayer_requests)
-- =====================================================
CREATE TABLE IF NOT EXISTS prayer_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    author_id UUID REFERENCES members(id) ON DELETE SET NULL,
    author_name TEXT,
    is_anonymous BOOLEAN DEFAULT false,
    is_answered BOOLEAN DEFAULT false,
    is_for_leaders BOOLEAN DEFAULT false,
    prayer_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prayer_requests_tenant ON prayer_requests(tenant_id);

ALTER TABLE prayer_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Prayer requests tenant isolation" ON prayer_requests;
CREATE POLICY "Prayer requests tenant isolation" ON prayer_requests FOR ALL
    USING (
        EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = prayer_requests.tenant_id))
    );

-- =====================================================
-- 9. DZIECI - UCZNIOWIE (kids_students)
-- =====================================================
CREATE TABLE IF NOT EXISTS kids_students (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    birth_date DATE,
    group_id UUID,
    parent_name TEXT,
    parent_phone TEXT,
    parent_email TEXT,
    allergies TEXT,
    notes TEXT,
    photo_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kids_students_tenant ON kids_students(tenant_id);

ALTER TABLE kids_students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Kids students tenant isolation" ON kids_students;
CREATE POLICY "Kids students tenant isolation" ON kids_students FOR ALL
    USING (
        EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = kids_students.tenant_id))
    );

-- =====================================================
-- 10. DZIECI - GRUPY (kids_groups)
-- =====================================================
CREATE TABLE IF NOT EXISTS kids_groups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    age_from INTEGER,
    age_to INTEGER,
    description TEXT,
    color TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kids_groups_tenant ON kids_groups(tenant_id);

ALTER TABLE kids_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Kids groups tenant isolation" ON kids_groups;
CREATE POLICY "Kids groups tenant isolation" ON kids_groups FOR ALL
    USING (
        EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = kids_groups.tenant_id))
    );

-- =====================================================
-- 11. KOMUNIKATOR - KONWERSACJE (conversations)
-- =====================================================
CREATE TABLE IF NOT EXISTS conversations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    type TEXT DEFAULT 'direct', -- direct, group, ministry
    name TEXT,
    ministry_type TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_tenant ON conversations(tenant_id);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Conversations tenant isolation" ON conversations;
CREATE POLICY "Conversations tenant isolation" ON conversations FOR ALL
    USING (
        EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = conversations.tenant_id))
    );

-- =====================================================
-- 12. KOMUNIKATOR - UCZESTNICY (conversation_participants)
-- =====================================================
CREATE TABLE IF NOT EXISTS conversation_participants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES app_users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_read_at TIMESTAMP WITH TIME ZONE,
    is_admin BOOLEAN DEFAULT false,
    UNIQUE(conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_participants_conv ON conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user ON conversation_participants(user_id);

ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view their conversations" ON conversation_participants;
CREATE POLICY "Participants can view their conversations" ON conversation_participants FOR ALL
    USING (
        user_id IN (SELECT id FROM app_users WHERE auth_user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND is_super_admin = true)
    );

-- =====================================================
-- 13. KOMUNIKATOR - WIADOMOŚCI (messages)
-- =====================================================
CREATE TABLE IF NOT EXISTS messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
    content TEXT,
    type TEXT DEFAULT 'text', -- text, image, file, audio
    attachment_url TEXT,
    is_edited BOOLEAN DEFAULT false,
    reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view messages in their conversations" ON messages;
CREATE POLICY "Users can view messages in their conversations" ON messages FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM conversation_participants cp
            JOIN app_users au ON au.id = cp.user_id
            WHERE cp.conversation_id = messages.conversation_id
            AND au.auth_user_id = auth.uid()
        )
        OR EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND is_super_admin = true)
    );

-- =====================================================
-- 14. FINANSE - TRANSAKCJE (finance_transactions)
-- =====================================================
CREATE TABLE IF NOT EXISTS finance_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- income, expense
    category TEXT,
    amount DECIMAL(10,2) NOT NULL,
    description TEXT,
    date DATE NOT NULL,
    team_type TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_transactions_tenant ON finance_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_date ON finance_transactions(date);

ALTER TABLE finance_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Finance transactions tenant isolation" ON finance_transactions;
CREATE POLICY "Finance transactions tenant isolation" ON finance_transactions FOR ALL
    USING (
        EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = finance_transactions.tenant_id))
    );

-- =====================================================
-- 15. FINANSE - SALDA (finance_balances)
-- =====================================================
CREATE TABLE IF NOT EXISTS finance_balances (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    team_type TEXT NOT NULL,
    balance DECIMAL(10,2) DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, team_type)
);

CREATE INDEX IF NOT EXISTS idx_finance_balances_tenant ON finance_balances(tenant_id);

ALTER TABLE finance_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Finance balances tenant isolation" ON finance_balances;
CREATE POLICY "Finance balances tenant isolation" ON finance_balances FOR ALL
    USING (
        EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = finance_balances.tenant_id))
    );

-- =====================================================
-- 16. NAUCZANIE (teachings)
-- =====================================================
CREATE TABLE IF NOT EXISTS teachings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    speaker TEXT,
    date DATE,
    series TEXT,
    description TEXT,
    audio_url TEXT,
    video_url TEXT,
    notes_url TEXT,
    tags TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teachings_tenant ON teachings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_teachings_date ON teachings(date);

ALTER TABLE teachings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Teachings tenant isolation" ON teachings;
CREATE POLICY "Teachings tenant isolation" ON teachings FOR ALL
    USING (
        EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = teachings.tenant_id))
    );

-- =====================================================
-- 17. MAILING - KAMPANIE (mail_campaigns)
-- =====================================================
CREATE TABLE IF NOT EXISTS mail_campaigns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    subject TEXT,
    content TEXT,
    design JSONB,
    status TEXT DEFAULT 'draft',
    recipients JSONB DEFAULT '[]',
    sent_at TIMESTAMP WITH TIME ZONE,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mail_campaigns_tenant ON mail_campaigns(tenant_id);

ALTER TABLE mail_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Mail campaigns tenant isolation" ON mail_campaigns;
CREATE POLICY "Mail campaigns tenant isolation" ON mail_campaigns FOR ALL
    USING (
        EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = mail_campaigns.tenant_id))
    );

-- =====================================================
-- 18. MAILING - SZABLONY (mail_templates)
-- =====================================================
CREATE TABLE IF NOT EXISTS mail_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    subject TEXT,
    content TEXT,
    design JSONB,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mail_templates_tenant ON mail_templates(tenant_id);

ALTER TABLE mail_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Mail templates tenant isolation" ON mail_templates;
CREATE POLICY "Mail templates tenant isolation" ON mail_templates FOR ALL
    USING (
        is_system = true
        OR EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = mail_templates.tenant_id))
    );

-- =====================================================
-- 19. SPRZĘT (equipment)
-- =====================================================
CREATE TABLE IF NOT EXISTS equipment (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT,
    team_type TEXT,
    description TEXT,
    serial_number TEXT,
    purchase_date DATE,
    purchase_price DECIMAL(10,2),
    condition TEXT DEFAULT 'good',
    location TEXT,
    photo_url TEXT,
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equipment_tenant ON equipment(tenant_id);

ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Equipment tenant isolation" ON equipment;
CREATE POLICY "Equipment tenant isolation" ON equipment FOR ALL
    USING (
        EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = equipment.tenant_id))
    );

-- =====================================================
-- 20. SUBSKRYPCJE iCAL (ical_subscriptions)
-- =====================================================
CREATE TABLE IF NOT EXISTS ical_subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES app_users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    filters JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ical_subscriptions_tenant ON ical_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ical_subscriptions_token ON ical_subscriptions(token);

ALTER TABLE ical_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "iCal subscriptions tenant isolation" ON ical_subscriptions;
CREATE POLICY "iCal subscriptions tenant isolation" ON ical_subscriptions FOR ALL
    USING (
        EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = ical_subscriptions.tenant_id))
    );

-- =====================================================
-- 21. POWIADOMIENIA PUSH (push_subscriptions)
-- =====================================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES app_users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    keys JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their push subscriptions" ON push_subscriptions;
CREATE POLICY "Users can manage their push subscriptions" ON push_subscriptions FOR ALL
    USING (
        user_id IN (SELECT id FROM app_users WHERE auth_user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND is_super_admin = true)
    );

-- =====================================================
-- 22. NOTYFIKACJE (notifications)
-- =====================================================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES app_users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT,
    link TEXT,
    type TEXT DEFAULT 'info',
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their notifications" ON notifications;
CREATE POLICY "Users can view their notifications" ON notifications FOR ALL
    USING (
        user_id IN (SELECT id FROM app_users WHERE auth_user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND is_super_admin = true)
    );

-- =====================================================
-- 23. WYDARZENIA SŁUŻB (ministry_events)
-- =====================================================
CREATE TABLE IF NOT EXISTS ministry_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    location TEXT,
    team_type TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ministry_events_tenant ON ministry_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ministry_events_date ON ministry_events(date);

ALTER TABLE ministry_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ministry events tenant isolation" ON ministry_events;
CREATE POLICY "Ministry events tenant isolation" ON ministry_events FOR ALL
    USING (
        EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = ministry_events.tenant_id))
    );

-- =====================================================
-- 24. FORMULARZE (forms)
-- =====================================================
CREATE TABLE IF NOT EXISTS forms (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    fields JSONB DEFAULT '[]',
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forms_tenant ON forms(tenant_id);

ALTER TABLE forms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Forms tenant isolation" ON forms;
CREATE POLICY "Forms tenant isolation" ON forms FOR ALL
    USING (
        EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = forms.tenant_id))
    );

-- =====================================================
-- 25. ODPOWIEDZI FORMULARZY (form_submissions)
-- =====================================================
CREATE TABLE IF NOT EXISTS form_submissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    form_id UUID REFERENCES forms(id) ON DELETE CASCADE,
    data JSONB NOT NULL,
    submitted_by UUID,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_form_submissions_tenant ON form_submissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_form ON form_submissions(form_id);

ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Form submissions tenant isolation" ON form_submissions;
CREATE POLICY "Form submissions tenant isolation" ON form_submissions FOR ALL
    USING (
        EXISTS (SELECT 1 FROM app_users WHERE auth_user_id = auth.uid() AND (is_super_admin = true OR tenant_id = form_submissions.tenant_id))
    );

-- =====================================================
-- 26. AKTUALIZACJA TABELI EVENTS - dodanie brakujących kolumn
-- =====================================================
DO $$
BEGIN
    -- Dodaj kolumnę date jeśli nie istnieje
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'date') THEN
        ALTER TABLE events ADD COLUMN date DATE;
    END IF;

    -- Dodaj kolumnę time jeśli nie istnieje
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'time') THEN
        ALTER TABLE events ADD COLUMN time TIME;
    END IF;

    -- Dodaj kolumnę location jeśli nie istnieje
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'location') THEN
        ALTER TABLE events ADD COLUMN location TEXT;
    END IF;

    -- Dodaj kolumnę description jeśli nie istnieje
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'description') THEN
        ALTER TABLE events ADD COLUMN description TEXT;
    END IF;
END $$;

-- =====================================================
-- REALTIME
-- =====================================================
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN SELECT unnest(ARRAY[
        'programs', 'songs', 'team_members', 'team_member_roles',
        'schedule_assignments', 'tasks', 'wall_posts', 'prayer_requests',
        'kids_students', 'kids_groups', 'conversations', 'messages',
        'finance_transactions', 'finance_balances', 'teachings',
        'mail_campaigns', 'mail_templates', 'equipment', 'ministry_events',
        'forms', 'form_submissions', 'notifications'
    ])
    LOOP
        BEGIN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', tbl);
        EXCEPTION WHEN duplicate_object THEN
            -- Tabela już jest w publikacji
        END;
    END LOOP;
END $$;
