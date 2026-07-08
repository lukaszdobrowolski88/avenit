-- =====================================================================
-- AVENIT — szablon bazy TENANTA (jeden kościół = jedna baza)
-- =====================================================================
-- WYGENEROWANE AUTOMATYCZNIE przez db/build-tenant-schema.mjs z konsolidacji
-- migracji (supabase/migrations + migrations). Usunięto RLS, auth.*, realtime
-- (supabase_realtime), pg_cron/pg_net oraz funkcje multi-tenant.
--
-- UWAGA: przed migracją realnych danych uzgodnij ten plik z produkcyjnym
--   pg_dump --schema-only  (patrz db/README.md). To szablon dla NOWYCH tenantów.
--
-- Nie edytuj ręcznie — zmiany nanoś w migracjach i uruchom builder ponownie.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ======================================================
-- ŹRÓDŁO: supabase/migrations/20241219_000_base_schema.sql
-- ======================================================
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
  auth_user_id UUID UNIQUE,
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
-- Dodanie household_id do members
ALTER TABLE members ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id) ON DELETE SET NULL;
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
DROP TRIGGER IF EXISTS update_members_updated_at ON members;
CREATE TRIGGER update_members_updated_at
  BEFORE UPDATE ON members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_groups_updated_at ON groups;
CREATE TRIGGER update_groups_updated_at
  BEFORE UPDATE ON groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_events_updated_at ON events;
CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_households_updated_at ON households;
CREATE TRIGGER update_households_updated_at
  BEFORE UPDATE ON households
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ======================================================
-- ŹRÓDŁO: supabase/migrations/20260119100000_create_app_config_tables.sql
-- ======================================================
-- =====================================================
-- TABELE KONFIGURACJI APLIKACJI
-- app_settings, app_permissions, app_modules
-- =====================================================

-- =====================================================
-- 1. Tabela ustawień aplikacji
-- =====================================================
CREATE TABLE IF NOT EXISTS app_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    value TEXT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Domyślne ustawienia modułów
INSERT INTO app_settings (key, value, description) VALUES
    ('module_members_enabled', 'true', 'Moduł Członkowie włączony'),
    ('module_worship_enabled', 'true', 'Moduł Uwielbienie włączony'),
    ('module_media_enabled', 'true', 'Moduł Media włączony'),
    ('module_atmosfera_enabled', 'true', 'Moduł Atmosfera włączony'),
    ('module_kids_enabled', 'true', 'Moduł Dzieci włączony'),
    ('module_groups_enabled', 'true', 'Moduł Grupy domowe włączony'),
    ('module_prayer_enabled', 'true', 'Moduł Modlitwa włączony'),
    ('module_komunikator_enabled', 'true', 'Moduł Komunikator włączony'),
    ('module_finance_enabled', 'true', 'Moduł Finanse włączony'),
    ('module_teaching_enabled', 'true', 'Moduł Nauczanie włączony'),
    ('module_mlodziezowka_enabled', 'true', 'Moduł Młodzieżówka włączony'),
    ('module_mailing_enabled', 'true', 'Moduł Mailing włączony')
ON CONFLICT (key) DO NOTHING;
-- =====================================================
-- 2. Tabela uprawnień
-- =====================================================
CREATE TABLE IF NOT EXISTS app_permissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    role TEXT NOT NULL,
    resource TEXT NOT NULL,
    can_read BOOLEAN DEFAULT false,
    can_write BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(role, resource)
);
-- Domyślne uprawnienia dla superadmin (pełny dostęp do wszystkiego)
INSERT INTO app_permissions (role, resource, can_read, can_write) VALUES
    ('superadmin', 'module:dashboard', true, true),
    ('superadmin', 'module:programs', true, true),
    ('superadmin', 'module:calendar', true, true),
    ('superadmin', 'module:members', true, true),
    ('superadmin', 'module:worship', true, true),
    ('superadmin', 'module:media', true, true),
    ('superadmin', 'module:atmosfera', true, true),
    ('superadmin', 'module:kids', true, true),
    ('superadmin', 'module:homegroups', true, true),
    ('superadmin', 'module:finance', true, true),
    ('superadmin', 'module:teaching', true, true),
    ('superadmin', 'module:prayer', true, true),
    ('superadmin', 'module:komunikator', true, true),
    ('superadmin', 'module:mlodziezowka', true, true),
    ('superadmin', 'module:mailing', true, true),
    ('superadmin', 'module:settings', true, true),
    ('superadmin', 'module:superadmin', true, true)
ON CONFLICT (role, resource) DO NOTHING;
-- =====================================================
-- 3. Tabela modułów aplikacji
-- =====================================================
CREATE TABLE IF NOT EXISTS app_modules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'Square',
    path TEXT NOT NULL,
    resource_key TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    is_system BOOLEAN DEFAULT false,
    is_enabled BOOLEAN DEFAULT true,
    component_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_modules_order ON app_modules(display_order);
CREATE INDEX IF NOT EXISTS idx_app_modules_key ON app_modules(key);
-- Dane początkowe - moduły systemowe
INSERT INTO app_modules (key, label, icon, path, resource_key, display_order, is_system, component_name) VALUES
    ('dashboard', 'Pulpit', 'Home', '/', 'module:dashboard', 0, true, 'DashboardModule'),
    ('programs', 'Programy', 'ClipboardList', '/programs', 'module:programs', 1, true, 'ProgramsModule'),
    ('calendar', 'Kalendarz', 'Calendar', '/calendar', 'module:calendar', 2, true, 'CalendarModule'),
    ('members', 'Członkowie', 'Users', '/members', 'module:members', 3, true, 'MembersModule'),
    ('worship', 'Zespół Uwielbienia', 'Music', '/worship', 'module:worship', 4, true, 'WorshipModule'),
    ('media', 'MediaTeam', 'Video', '/media', 'module:media', 5, true, 'MediaTeamModule'),
    ('atmosfera', 'Atmosfera Team', 'HeartHandshake', '/atmosfera', 'module:atmosfera', 6, true, 'AtmosferaTeamModule'),
    ('kids', 'Małe SchWro', 'Baby', '/kids', 'module:kids', 7, true, 'KidsModule'),
    ('homegroups', 'Grupy domowe', 'UserCircle', '/home-groups', 'module:homegroups', 8, true, 'HomeGroupsModule'),
    ('finance', 'Finanse', 'DollarSign', '/finance', 'module:finance', 9, true, 'FinanceModule'),
    ('teaching', 'Nauczanie', 'GraduationCap', '/teaching', 'module:teaching', 10, true, 'TeachingModule'),
    ('prayer', 'Ściana modlitwy', 'Heart', '/prayer', 'module:prayer', 11, true, 'PrayerWallModule'),
    ('komunikator', 'Komunikator', 'MessageSquare', '/komunikator', 'module:komunikator', 12, true, 'KomunikatorModule'),
    ('mlodziezowka', 'Młodzieżówka', 'Sparkles', '/mlodziezowka', 'module:mlodziezowka', 13, true, 'MlodziezowkaModule'),
    ('mailing', 'Mailing', 'Mail', '/mailing', 'module:mailing', 14, true, 'MailingModule'),
    ('settings', 'Ustawienia', 'Settings', '/settings', 'module:settings', 15, true, 'GlobalSettings')
ON CONFLICT (key) DO NOTHING;
-- =====================================================
-- 4. Tabela zakładek modułów
-- =====================================================
CREATE TABLE IF NOT EXISTS app_module_tabs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    module_id UUID REFERENCES app_modules(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    label TEXT NOT NULL,
    icon TEXT DEFAULT 'Square',
    component_type TEXT DEFAULT 'empty',
    display_order INTEGER DEFAULT 0,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(module_id, key)
);
CREATE INDEX IF NOT EXISTS idx_app_module_tabs_order ON app_module_tabs(module_id, display_order);

-- ======================================================
-- ŹRÓDŁO: supabase/migrations/20260119110000_add_missing_tables.sql
-- ======================================================
-- =====================================================
-- DODANIE BRAKUJĄCYCH TABEL Z AVENIT
-- =====================================================

-- =====================================================
-- 1. PROGRAMY (programs) - główna tabela programów nabożeństw
-- =====================================================
CREATE TABLE IF NOT EXISTS programs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
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
-- =====================================================
-- 2. PIEŚNI (songs) - baza pieśni
-- =====================================================
CREATE TABLE IF NOT EXISTS songs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
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
-- =====================================================
-- 3. ZESPÓŁ (team_members) - członkowie zespołów służb
-- =====================================================
CREATE TABLE IF NOT EXISTS team_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
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
-- =====================================================
-- 4. ROLE W ZESPOLE (team_member_roles)
-- =====================================================
CREATE TABLE IF NOT EXISTS team_member_roles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    team_member_id UUID REFERENCES team_members(id) ON DELETE CASCADE,
    role_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_team_member_roles_tenant ON team_member_roles(tenant_id);
-- =====================================================
-- 5. GRAFIK SŁUŻB (schedule_assignments)
-- =====================================================
CREATE TABLE IF NOT EXISTS schedule_assignments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
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
-- =====================================================
-- 6. ZADANIA (tasks)
-- =====================================================
CREATE TABLE IF NOT EXISTS tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
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
-- =====================================================
-- 7. TABLICA OGŁOSZEŃ (wall_posts)
-- =====================================================
CREATE TABLE IF NOT EXISTS wall_posts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    content TEXT NOT NULL,
    author_id UUID REFERENCES members(id) ON DELETE SET NULL,
    team_type TEXT,
    is_pinned BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wall_posts_tenant ON wall_posts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wall_posts_team ON wall_posts(team_type);
-- =====================================================
-- 8. PROŚBY MODLITEWNE (prayer_requests)
-- =====================================================
CREATE TABLE IF NOT EXISTS prayer_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
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
-- =====================================================
-- 9. DZIECI - UCZNIOWIE (kids_students)
-- =====================================================
CREATE TABLE IF NOT EXISTS kids_students (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
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
-- =====================================================
-- 10. DZIECI - GRUPY (kids_groups)
-- =====================================================
CREATE TABLE IF NOT EXISTS kids_groups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    name TEXT NOT NULL,
    age_from INTEGER,
    age_to INTEGER,
    description TEXT,
    color TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kids_groups_tenant ON kids_groups(tenant_id);
-- =====================================================
-- 11. KOMUNIKATOR - KONWERSACJE (conversations)
-- =====================================================
CREATE TABLE IF NOT EXISTS conversations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    type TEXT DEFAULT 'direct', -- direct, group, ministry
    name TEXT,
    ministry_type TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conversations_tenant ON conversations(tenant_id);
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
-- =====================================================
-- 14. FINANSE - TRANSAKCJE (finance_transactions)
-- =====================================================
CREATE TABLE IF NOT EXISTS finance_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
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
-- =====================================================
-- 15. FINANSE - SALDA (finance_balances)
-- =====================================================
CREATE TABLE IF NOT EXISTS finance_balances (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    team_type TEXT NOT NULL,
    balance DECIMAL(10,2) DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, team_type)
);
CREATE INDEX IF NOT EXISTS idx_finance_balances_tenant ON finance_balances(tenant_id);
-- =====================================================
-- 16. NAUCZANIE (teachings)
-- =====================================================
CREATE TABLE IF NOT EXISTS teachings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
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
-- =====================================================
-- 17. MAILING - KAMPANIE (mail_campaigns)
-- =====================================================
CREATE TABLE IF NOT EXISTS mail_campaigns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
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
-- =====================================================
-- 18. MAILING - SZABLONY (mail_templates)
-- =====================================================
CREATE TABLE IF NOT EXISTS mail_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    name TEXT NOT NULL,
    subject TEXT,
    content TEXT,
    design JSONB,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mail_templates_tenant ON mail_templates(tenant_id);
-- =====================================================
-- 19. SPRZĘT (equipment)
-- =====================================================
CREATE TABLE IF NOT EXISTS equipment (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
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
-- =====================================================
-- 20. SUBSKRYPCJE iCAL (ical_subscriptions)
-- =====================================================
CREATE TABLE IF NOT EXISTS ical_subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    user_id UUID REFERENCES app_users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    filters JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ical_subscriptions_tenant ON ical_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ical_subscriptions_token ON ical_subscriptions(token);
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
-- =====================================================
-- 23. WYDARZENIA SŁUŻB (ministry_events)
-- =====================================================
CREATE TABLE IF NOT EXISTS ministry_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
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
-- =====================================================
-- 24. FORMULARZE (forms)
-- =====================================================
CREATE TABLE IF NOT EXISTS forms (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
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
-- =====================================================
-- 25. ODPOWIEDZI FORMULARZY (form_submissions)
-- =====================================================
CREATE TABLE IF NOT EXISTS form_submissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    form_id UUID REFERENCES forms(id) ON DELETE CASCADE,
    data JSONB NOT NULL,
    submitted_by UUID,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_form_submissions_tenant ON form_submissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_form ON form_submissions(form_id);
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

-- ======================================================
-- ŹRÓDŁO: supabase/migrations/20260119120000_add_remaining_tables.sql
-- ======================================================
-- =====================================================
-- DODANIE POZOSTAŁYCH BRAKUJĄCYCH TABEL
-- Na podstawie błędów 404 z konsoli
-- =====================================================

-- =====================================================
-- 1. KIDS_EVENTS - wydarzenia dla dzieci
-- =====================================================
CREATE TABLE IF NOT EXISTS kids_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
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
-- =====================================================
-- 2. ATMOSFERA_EVENTS - wydarzenia atmosfery
-- =====================================================
CREATE TABLE IF NOT EXISTS atmosfera_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
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
-- =====================================================
-- 3. HOMEGROUPS_EVENTS - wydarzenia grup domowych
-- =====================================================
CREATE TABLE IF NOT EXISTS homegroups_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
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
-- =====================================================
-- 4. TEAM_ROLES - role w zespołach
-- =====================================================
CREATE TABLE IF NOT EXISTS team_roles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    team_type TEXT NOT NULL,
    name TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_team_roles_tenant ON team_roles(tenant_id);
-- =====================================================
-- 5. MEDIA_TEAM - członkowie media team
-- =====================================================
CREATE TABLE IF NOT EXISTS media_team (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
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
-- =====================================================
-- 6. WORSHIP_TEAM - członkowie zespołu uwielbienia
-- =====================================================
CREATE TABLE IF NOT EXISTS worship_team (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
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
-- =====================================================
-- 7. ATMOSFERA_MEMBERS - członkowie atmosfery
-- =====================================================
CREATE TABLE IF NOT EXISTS atmosfera_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
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
-- =====================================================
-- 8. TEACHING_SPEAKERS - mówcy/kaznodzieje
-- =====================================================
CREATE TABLE IF NOT EXISTS teaching_speakers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    name TEXT NOT NULL,
    bio TEXT,
    photo_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_teaching_speakers_tenant ON teaching_speakers(tenant_id);
-- =====================================================
-- 9. KIDS_TEACHERS - nauczyciele dzieci
-- =====================================================
CREATE TABLE IF NOT EXISTS kids_teachers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    member_id UUID REFERENCES members(id) ON DELETE CASCADE,
    full_name TEXT,
    email TEXT,
    phone TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kids_teachers_tenant ON kids_teachers(tenant_id);
-- =====================================================
-- 10. CUSTOM_MC_MEMBERS - członkowie niestandardowych modułów
-- =====================================================
CREATE TABLE IF NOT EXISTS custom_mc_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
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
-- =====================================================
-- 12. HOME_GROUPS - grupy domowe (alias dla groups)
-- =====================================================
CREATE TABLE IF NOT EXISTS home_groups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
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
-- =====================================================
-- 13. HOME_GROUP_MEMBERS - członkowie grup domowych
-- =====================================================
CREATE TABLE IF NOT EXISTS home_group_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    group_id UUID REFERENCES home_groups(id) ON DELETE CASCADE,
    member_id UUID REFERENCES members(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(group_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_home_group_members_tenant ON home_group_members(tenant_id);
-- =====================================================
-- 14. MLODZIEZOWKA_MEMBERS - członkowie młodzieżówki
-- =====================================================
CREATE TABLE IF NOT EXISTS mlodziezowka_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
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
-- =====================================================
-- 15. MLODZIEZOWKA_EVENTS - wydarzenia młodzieżówki
-- =====================================================
CREATE TABLE IF NOT EXISTS mlodziezowka_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
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
-- =====================================================
-- 16. MLODZIEZOWKA_TASKS - zadania młodzieżówki
-- =====================================================
CREATE TABLE IF NOT EXISTS mlodziezowka_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
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
-- =====================================================
-- 17. WORSHIP_EVENTS - wydarzenia uwielbienia
-- =====================================================
CREATE TABLE IF NOT EXISTS worship_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
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
-- =====================================================
-- 18. MEDIA_EVENTS - wydarzenia media
-- =====================================================
CREATE TABLE IF NOT EXISTS media_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
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
-- =====================================================
-- 19. PARENT_CONTACTS - kontakty rodziców
-- =====================================================
CREATE TABLE IF NOT EXISTS parent_contacts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    student_id UUID REFERENCES kids_students(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    relationship TEXT,
    phone TEXT,
    email TEXT,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_parent_contacts_tenant ON parent_contacts(tenant_id);
-- =====================================================
-- 20. CHECKIN_SESSIONS - sesje check-in
-- =====================================================
CREATE TABLE IF NOT EXISTS checkin_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    name TEXT NOT NULL,
    date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_checkin_sessions_tenant ON checkin_sessions(tenant_id);
-- =====================================================
-- 21. CHECKIN_LOCATIONS - lokalizacje check-in
-- =====================================================
CREATE TABLE IF NOT EXISTS checkin_locations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_checkin_locations_tenant ON checkin_locations(tenant_id);
-- =====================================================
-- 22. CHECKINS - rekordy check-in
-- =====================================================
CREATE TABLE IF NOT EXISTS checkins (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
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
-- =====================================================
-- 23. EXPENSES - wydatki (alias dla finance_transactions)
-- =====================================================
CREATE TABLE IF NOT EXISTS expenses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
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
-- =====================================================
-- 24. EXPENSE_CATEGORIES - kategorie wydatków
-- =====================================================
CREATE TABLE IF NOT EXISTS expense_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    name TEXT NOT NULL,
    color TEXT,
    icon TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expense_categories_tenant ON expense_categories(tenant_id);
-- =====================================================
-- 25. MAIL_ACCOUNTS - konta pocztowe
-- =====================================================
CREATE TABLE IF NOT EXISTS mail_accounts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
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

-- ======================================================
-- ŹRÓDŁO: supabase/migrations/20260119130000_add_schwro_tables.sql
-- ======================================================
-- =====================================================
-- DODANIE TABEL ZE SCHWRO
-- =====================================================

-- =====================================================
-- 1. APP_DICTIONARIES - słowniki aplikacji
-- =====================================================
CREATE TABLE IF NOT EXISTS app_dictionaries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    type TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_dictionaries_tenant ON app_dictionaries(tenant_id);
-- =====================================================
-- 2. APP_SMTP_CONFIG - konfiguracja SMTP
-- =====================================================
CREATE TABLE IF NOT EXISTS app_smtp_config (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    host TEXT,
    port INTEGER,
    username TEXT,
    password TEXT,
    from_email TEXT,
    from_name TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_smtp_config_tenant ON app_smtp_config(tenant_id);
-- =====================================================
-- 3. BUDGET_ITEMS - pozycje budżetowe
-- =====================================================
CREATE TABLE IF NOT EXISTS budget_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    name TEXT NOT NULL,
    category TEXT,
    planned_amount DECIMAL(10,2),
    actual_amount DECIMAL(10,2) DEFAULT 0,
    period_start DATE,
    period_end DATE,
    team_type TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_budget_items_tenant ON budget_items(tenant_id);
-- =====================================================
-- 4. CUSTOM MODULE TABLES - tabele niestandardowych modułów
-- =====================================================

-- Custom events template
CREATE TABLE IF NOT EXISTS custom_kobiety_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    title TEXT NOT NULL,
    description TEXT,
    date DATE,
    start_time TIME,
    end_time TIME,
    location TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_custom_kobiety_events_tenant ON custom_kobiety_events(tenant_id);
-- Custom members template
CREATE TABLE IF NOT EXISTS custom_kobiety_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    member_id UUID REFERENCES members(id) ON DELETE CASCADE,
    full_name TEXT,
    email TEXT,
    phone TEXT,
    role TEXT,
    is_leader BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_custom_kobiety_members_tenant ON custom_kobiety_members(tenant_id);
-- Custom tasks template
CREATE TABLE IF NOT EXISTS custom_kobiety_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    title TEXT NOT NULL,
    description TEXT,
    assigned_to UUID,
    due_date TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'medium',
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_custom_kobiety_tasks_tenant ON custom_kobiety_tasks(tenant_id);
-- Custom mc tasks
CREATE TABLE IF NOT EXISTS custom_mc_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    title TEXT NOT NULL,
    description TEXT,
    assigned_to UUID,
    due_date TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'medium',
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_custom_mc_tasks_tenant ON custom_mc_tasks(tenant_id);
-- Custom mc wall
CREATE TABLE IF NOT EXISTS custom_mc_wall (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    content TEXT NOT NULL,
    author_id UUID,
    is_pinned BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_custom_mc_wall_tenant ON custom_mc_wall(tenant_id);
-- =====================================================
-- 5. EMAIL CAMPAIGN TABLES
-- =====================================================
CREATE TABLE IF NOT EXISTS email_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    name TEXT NOT NULL,
    subject TEXT,
    html_content TEXT,
    text_content TEXT,
    design JSONB,
    category TEXT,
    is_active BOOLEAN DEFAULT true,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_templates_tenant ON email_templates(tenant_id);
CREATE TABLE IF NOT EXISTS email_campaigns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    name TEXT NOT NULL,
    subject TEXT,
    template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
    html_content TEXT,
    text_content TEXT,
    design JSONB,
    status TEXT DEFAULT 'draft',
    scheduled_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    total_recipients INTEGER DEFAULT 0,
    total_sent INTEGER DEFAULT 0,
    total_opened INTEGER DEFAULT 0,
    total_clicked INTEGER DEFAULT 0,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_tenant ON email_campaigns(tenant_id);
CREATE TABLE IF NOT EXISTS email_campaign_recipients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    campaign_id UUID REFERENCES email_campaigns(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT,
    member_id UUID REFERENCES members(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'pending',
    sent_at TIMESTAMP WITH TIME ZONE,
    opened_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_campaign ON email_campaign_recipients(campaign_id);
CREATE TABLE IF NOT EXISTS email_recipient_segments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    name TEXT NOT NULL,
    description TEXT,
    filters JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_recipient_segments_tenant ON email_recipient_segments(tenant_id);
CREATE TABLE IF NOT EXISTS email_unsubscribes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    email TEXT NOT NULL,
    reason TEXT,
    unsubscribed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);
CREATE INDEX IF NOT EXISTS idx_email_unsubscribes_tenant ON email_unsubscribes(tenant_id);
-- =====================================================
-- 6. FINANCE TRANSACTIONS (income/expense)
-- =====================================================
CREATE TABLE IF NOT EXISTS income_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    amount DECIMAL(10,2) NOT NULL,
    category TEXT,
    description TEXT,
    date DATE NOT NULL,
    team_type TEXT,
    source TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_income_transactions_tenant ON income_transactions(tenant_id);
CREATE TABLE IF NOT EXISTS expense_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    amount DECIMAL(10,2) NOT NULL,
    category TEXT,
    description TEXT,
    date DATE NOT NULL,
    team_type TEXT,
    vendor TEXT,
    receipt_url TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expense_transactions_tenant ON expense_transactions(tenant_id);
-- =====================================================
-- 7. FORM_RESPONSES
-- =====================================================
CREATE TABLE IF NOT EXISTS form_responses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    form_id UUID REFERENCES forms(id) ON DELETE CASCADE,
    respondent_email TEXT,
    respondent_name TEXT,
    data JSONB NOT NULL,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_form_responses_tenant ON form_responses(tenant_id);
-- =====================================================
-- 8. HOME GROUP TABLES
-- =====================================================
CREATE TABLE IF NOT EXISTS home_group_leaders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    group_id UUID REFERENCES home_groups(id) ON DELETE CASCADE,
    member_id UUID REFERENCES members(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'leader',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(group_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_home_group_leaders_tenant ON home_group_leaders(tenant_id);
CREATE TABLE IF NOT EXISTS home_group_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    group_id UUID REFERENCES home_groups(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    assigned_to UUID,
    due_date TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'medium',
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_home_group_tasks_tenant ON home_group_tasks(tenant_id);
CREATE TABLE IF NOT EXISTS home_group_task_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id UUID REFERENCES home_group_tasks(id) ON DELETE CASCADE,
    author_id UUID,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_home_group_task_comments_task ON home_group_task_comments(task_id);
-- =====================================================
-- 9. MAIL TABLES (full email client)
-- =====================================================
CREATE TABLE IF NOT EXISTS mail_folders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    account_id UUID REFERENCES mail_accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'custom',
    parent_id UUID REFERENCES mail_folders(id) ON DELETE CASCADE,
    unread_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mail_folders_tenant ON mail_folders(tenant_id);
CREATE TABLE IF NOT EXISTS mail_labels (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    name TEXT NOT NULL,
    color TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mail_labels_tenant ON mail_labels(tenant_id);
CREATE TABLE IF NOT EXISTS mail_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    account_id UUID REFERENCES mail_accounts(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES mail_folders(id) ON DELETE SET NULL,
    message_id TEXT,
    from_email TEXT,
    from_name TEXT,
    to_emails JSONB,
    cc_emails JSONB,
    bcc_emails JSONB,
    subject TEXT,
    body_text TEXT,
    body_html TEXT,
    is_read BOOLEAN DEFAULT false,
    is_starred BOOLEAN DEFAULT false,
    is_draft BOOLEAN DEFAULT false,
    sent_at TIMESTAMP WITH TIME ZONE,
    received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mail_messages_tenant ON mail_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mail_messages_folder ON mail_messages(folder_id);
CREATE TABLE IF NOT EXISTS mail_message_labels (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id UUID REFERENCES mail_messages(id) ON DELETE CASCADE,
    label_id UUID REFERENCES mail_labels(id) ON DELETE CASCADE,
    UNIQUE(message_id, label_id)
);
CREATE TABLE IF NOT EXISTS mail_attachments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id UUID REFERENCES mail_messages(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    content_type TEXT,
    size INTEGER,
    storage_path TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mail_attachments_message ON mail_attachments(message_id);
CREATE TABLE IF NOT EXISTS mail_filter_rules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    account_id UUID REFERENCES mail_accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    conditions JSONB NOT NULL,
    actions JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mail_filter_rules_tenant ON mail_filter_rules(tenant_id);
-- =====================================================
-- 10. MATERIALS (files/folders)
-- =====================================================
CREATE TABLE IF NOT EXISTS materials_folders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    name TEXT NOT NULL,
    parent_id UUID REFERENCES materials_folders(id) ON DELETE CASCADE,
    team_type TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_materials_folders_tenant ON materials_folders(tenant_id);
CREATE TABLE IF NOT EXISTS materials_files (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    folder_id UUID REFERENCES materials_folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    file_type TEXT,
    size INTEGER,
    storage_path TEXT,
    team_type TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_materials_files_tenant ON materials_files(tenant_id);
-- =====================================================
-- 11. MEDIA TASKS
-- =====================================================
CREATE TABLE IF NOT EXISTS media_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    title TEXT NOT NULL,
    description TEXT,
    assigned_to UUID,
    due_date TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'medium',
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_media_tasks_tenant ON media_tasks(tenant_id);
CREATE TABLE IF NOT EXISTS media_task_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id UUID REFERENCES media_tasks(id) ON DELETE CASCADE,
    author_id UUID,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_media_task_comments_task ON media_task_comments(task_id);
-- =====================================================
-- 12. MESSENGER ENHANCEMENTS
-- =====================================================
CREATE TABLE IF NOT EXISTS message_reactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID REFERENCES app_users(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(message_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id);
CREATE TABLE IF NOT EXISTS message_read_receipts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID REFERENCES app_users(id) ON DELETE CASCADE,
    read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(message_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_message_read_receipts_message ON message_read_receipts(message_id);
CREATE TABLE IF NOT EXISTS pinned_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    pinned_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
    pinned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(conversation_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_pinned_messages_conversation ON pinned_messages(conversation_id);
CREATE TABLE IF NOT EXISTS typing_status (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES app_users(id) ON DELETE CASCADE,
    is_typing BOOLEAN DEFAULT false,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_typing_status_conversation ON typing_status(conversation_id);
-- =====================================================
-- 13. MLODZIEZOWKA ENHANCEMENTS
-- =====================================================
CREATE TABLE IF NOT EXISTS mlodziezowka_leaders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    member_id UUID REFERENCES members(id) ON DELETE CASCADE,
    full_name TEXT,
    email TEXT,
    phone TEXT,
    role TEXT DEFAULT 'leader',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mlodziezowka_leaders_tenant ON mlodziezowka_leaders(tenant_id);
CREATE TABLE IF NOT EXISTS mlodziezowka_event_participants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID REFERENCES mlodziezowka_events(id) ON DELETE CASCADE,
    member_id UUID REFERENCES members(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'registered',
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(event_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_mlodziezowka_event_participants_event ON mlodziezowka_event_participants(event_id);
CREATE TABLE IF NOT EXISTS mlodziezowka_task_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id UUID REFERENCES mlodziezowka_tasks(id) ON DELETE CASCADE,
    author_id UUID,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mlodziezowka_task_comments_task ON mlodziezowka_task_comments(task_id);
-- =====================================================
-- 14. PRAYER INTERACTIONS
-- =====================================================
CREATE TABLE IF NOT EXISTS prayer_interactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    request_id UUID REFERENCES prayer_requests(id) ON DELETE CASCADE,
    user_id UUID REFERENCES app_users(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'prayed', 'comment'
    content TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prayer_interactions_request ON prayer_interactions(request_id);
-- =====================================================
-- 15. TEACHING ENHANCEMENTS
-- =====================================================
CREATE TABLE IF NOT EXISTS teaching_series (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_teaching_series_tenant ON teaching_series(tenant_id);
CREATE TABLE IF NOT EXISTS teaching_schedule (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    date DATE NOT NULL,
    speaker_id UUID REFERENCES teaching_speakers(id) ON DELETE SET NULL,
    topic TEXT,
    series_id UUID REFERENCES teaching_series(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_teaching_schedule_tenant ON teaching_schedule(tenant_id);
-- =====================================================
-- 16. USER ABSENCES (nieobecności)
-- =====================================================
CREATE TABLE IF NOT EXISTS user_absences (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    user_id UUID REFERENCES app_users(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,
    type TEXT DEFAULT 'vacation',
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_absences_tenant ON user_absences(tenant_id);
-- =====================================================
-- 17. USER DASHBOARD LAYOUTS
-- =====================================================
CREATE TABLE IF NOT EXISTS user_dashboard_layouts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES app_users(id) ON DELETE CASCADE,
    layout JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);
-- =====================================================
-- 18. USER TASKS
-- =====================================================
CREATE TABLE IF NOT EXISTS user_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    user_id UUID REFERENCES app_users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    due_date TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'medium',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_tasks_tenant ON user_tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_tasks_user ON user_tasks(user_id);
-- =====================================================
-- 19. TOTP AUTH LOGS (2FA)
-- =====================================================
CREATE TABLE IF NOT EXISTS totp_auth_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES app_users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    success BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_totp_auth_logs_user ON totp_auth_logs(user_id);
-- =====================================================
-- VIEW: prayer_requests_with_counts
-- =====================================================
CREATE OR REPLACE VIEW prayer_requests_with_counts AS
SELECT
    pr.*,
    COALESCE(pi.pray_count, 0) as total_prayers,
    COALESCE(pi.comment_count, 0) as total_comments
FROM prayer_requests pr
LEFT JOIN (
    SELECT
        request_id,
        COUNT(*) FILTER (WHERE type = 'prayed') as pray_count,
        COUNT(*) FILTER (WHERE type = 'comment') as comment_count
    FROM prayer_interactions
    GROUP BY request_id
) pi ON pr.id = pi.request_id;

-- ======================================================
-- ŹRÓDŁO: supabase/migrations/20260122_001_add_app_users_columns.sql
-- ======================================================
-- Add missing columns to app_users table for TOTP/2FA support

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS totp_verified_at TIMESTAMPTZ;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS totp_backup_codes TEXT[];
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS totp_required BOOLEAN DEFAULT FALSE;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS backup_codes TEXT[];

-- ======================================================
-- ŹRÓDŁO: supabase/migrations/20260123_001_add_full_name.sql
-- ======================================================
-- Add full_name column to app_users
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS full_name TEXT;

-- ======================================================
-- ŹRÓDŁO: supabase/migrations/20260125_001_rebuild_tables_with_int_id.sql
-- ======================================================
-- Rebuild key tables to use INTEGER ids like in schwro database
-- This allows importing data from schwro backup directly

-- =====================================================
-- MEMBERS
-- =====================================================
DROP TABLE IF EXISTS members CASCADE;
CREATE TABLE IF NOT EXISTS members (
    id SERIAL PRIMARY KEY,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    phone TEXT,
    status TEXT,
    group_home TEXT,
    ministry TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    address TEXT,
    join_date DATE,
    home_group TEXT,
    home_group_id UUID,
    membership_date DATE,
    membership_declaration_url TEXT,
    ministries TEXT[] DEFAULT '{}',
    household_id UUID
);
CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);
-- =====================================================
-- SONGS
-- =====================================================
DROP TABLE IF EXISTS songs CASCADE;
CREATE TABLE IF NOT EXISTS songs (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT,
    key TEXT,
    bpm INTEGER,
    lyrics TEXT,
    chords_url TEXT,
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT,
    attachments JSONB DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);
-- =====================================================
-- PROGRAMS
-- =====================================================
DROP TABLE IF EXISTS programs CASCADE;
CREATE TABLE IF NOT EXISTS programs (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    template TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT,
    song_ids JSONB DEFAULT '[]',
    status TEXT DEFAULT 'draft',
    type TEXT DEFAULT 'sunday',
    assignments JSONB DEFAULT '{}',
    file_attachments JSONB DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_programs_date ON programs(date);
-- =====================================================
-- TEACHING_SPEAKERS
-- =====================================================
DROP TABLE IF EXISTS teaching_speakers CASCADE;
CREATE TABLE IF NOT EXISTS teaching_speakers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- =====================================================
-- KIDS_GROUPS
-- =====================================================
DROP TABLE IF EXISTS kids_groups CASCADE;
CREATE TABLE IF NOT EXISTS kids_groups (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    age_range TEXT,
    color TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- =====================================================
-- KIDS_STUDENTS
-- =====================================================
DROP TABLE IF EXISTS kids_students CASCADE;
CREATE TABLE IF NOT EXISTS kids_students (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT,
    birth_date DATE,
    group_id INTEGER REFERENCES kids_groups(id) ON DELETE SET NULL,
    parent_name TEXT,
    parent_phone TEXT,
    parent_email TEXT,
    notes TEXT,
    photo_url TEXT,
    is_active BOOLEAN DEFAULT true,
    allergies TEXT,
    medical_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- =====================================================
-- KIDS_TEACHERS
-- =====================================================
DROP TABLE IF EXISTS kids_teachers CASCADE;
CREATE TABLE IF NOT EXISTS kids_teachers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    group_id INTEGER REFERENCES kids_groups(id) ON DELETE SET NULL,
    is_leader BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- =====================================================
-- HOME_GROUPS
-- =====================================================
DROP TABLE IF EXISTS home_groups CASCADE;
CREATE TABLE IF NOT EXISTS home_groups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    leader_name TEXT,
    leader_email TEXT,
    leader_phone TEXT,
    meeting_day TEXT,
    meeting_time TEXT,
    meeting_location TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- =====================================================
-- HOME_GROUP_MEMBERS
-- =====================================================
DROP TABLE IF EXISTS home_group_members CASCADE;
CREATE TABLE IF NOT EXISTS home_group_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    group_id UUID REFERENCES home_groups(id) ON DELETE CASCADE,
    is_leader BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- =====================================================
-- WORSHIP_TEAM
-- =====================================================
DROP TABLE IF EXISTS worship_team CASCADE;
CREATE TABLE IF NOT EXISTS worship_team (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    roles TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    is_leader BOOLEAN DEFAULT false,
    avatar_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- =====================================================
-- MEDIA_TEAM
-- =====================================================
DROP TABLE IF EXISTS media_team CASCADE;
CREATE TABLE IF NOT EXISTS media_team (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    roles TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    is_leader BOOLEAN DEFAULT false,
    avatar_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- =====================================================
-- ATMOSFERA_MEMBERS
-- =====================================================
DROP TABLE IF EXISTS atmosfera_members CASCADE;
CREATE TABLE IF NOT EXISTS atmosfera_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role TEXT,
    is_active BOOLEAN DEFAULT true,
    is_leader BOOLEAN DEFAULT false,
    avatar_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- =====================================================
-- TEAM_ROLES
-- =====================================================
DROP TABLE IF EXISTS team_roles CASCADE;
CREATE TABLE IF NOT EXISTS team_roles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    team_type TEXT NOT NULL,
    description TEXT,
    color TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- =====================================================
-- TEAM_MEMBER_ROLES
-- =====================================================
DROP TABLE IF EXISTS team_member_roles CASCADE;
CREATE TABLE IF NOT EXISTS team_member_roles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    member_email TEXT NOT NULL,
    member_name TEXT,
    role_id UUID REFERENCES team_roles(id) ON DELETE CASCADE,
    team_type TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- =====================================================
-- SCHEDULE_ASSIGNMENTS
-- =====================================================
DROP TABLE IF EXISTS schedule_assignments CASCADE;
CREATE TABLE IF NOT EXISTS schedule_assignments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    program_id INTEGER REFERENCES programs(id) ON DELETE CASCADE,
    role_id UUID REFERENCES team_roles(id) ON DELETE CASCADE,
    member_email TEXT,
    member_name TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- =====================================================
-- MLODZIEZOWKA_MEMBERS
-- =====================================================
DROP TABLE IF EXISTS mlodziezowka_members CASCADE;
CREATE TABLE IF NOT EXISTS mlodziezowka_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role TEXT,
    is_active BOOLEAN DEFAULT true,
    is_leader BOOLEAN DEFAULT false,
    avatar_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- =====================================================
-- MLODZIEZOWKA_EVENTS
-- =====================================================
DROP TABLE IF EXISTS mlodziezowka_events CASCADE;
CREATE TABLE IF NOT EXISTS mlodziezowka_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    event_type TEXT,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    location TEXT,
    is_recurring BOOLEAN DEFAULT false,
    recurrence_pattern TEXT,
    max_participants INTEGER,
    registration_required BOOLEAN DEFAULT false,
    image_url TEXT,
    attachments JSONB DEFAULT '[]',
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- =====================================================
-- PRAYER_REQUESTS
-- =====================================================
DROP TABLE IF EXISTS prayer_requests CASCADE;
CREATE TABLE IF NOT EXISTS prayer_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    content TEXT NOT NULL,
    author_email TEXT,
    author_name TEXT,
    is_anonymous BOOLEAN DEFAULT false,
    is_answered BOOLEAN DEFAULT false,
    prayer_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- =====================================================
-- TASKS
-- =====================================================
DROP TABLE IF EXISTS tasks CASCADE;
CREATE TABLE IF NOT EXISTS tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'todo',
    priority TEXT DEFAULT 'medium',
    due_date DATE,
    assigned_to TEXT,
    assigned_to_name TEXT,
    created_by TEXT,
    created_by_name TEXT,
    category TEXT,
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- =====================================================
-- EVENTS
-- =====================================================
DROP TABLE IF EXISTS events CASCADE;
CREATE TABLE IF NOT EXISTS events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    event_type TEXT,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ,
    location TEXT,
    is_recurring BOOLEAN DEFAULT false,
    recurrence_pattern TEXT,
    max_participants INTEGER,
    registration_required BOOLEAN DEFAULT false,
    image_url TEXT,
    attachments JSONB DEFAULT '[]',
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- =====================================================
-- CONVERSATIONS
-- =====================================================
DROP TABLE IF EXISTS conversations CASCADE;
CREATE TABLE IF NOT EXISTS conversations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT,
    type TEXT DEFAULT 'direct',
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_message_at TIMESTAMPTZ,
    last_message_preview TEXT
);
-- =====================================================
-- CONVERSATION_PARTICIPANTS
-- =====================================================
DROP TABLE IF EXISTS conversation_participants CASCADE;
CREATE TABLE IF NOT EXISTS conversation_participants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    user_name TEXT,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    last_read_at TIMESTAMPTZ,
    UNIQUE(conversation_id, user_email)
);
-- =====================================================
-- MESSAGES
-- =====================================================
DROP TABLE IF EXISTS messages CASCADE;
CREATE TABLE IF NOT EXISTS messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    sender_email TEXT NOT NULL,
    sender_name TEXT,
    content TEXT NOT NULL,
    message_type TEXT DEFAULT 'text',
    attachments JSONB DEFAULT '[]',
    is_edited BOOLEAN DEFAULT false,
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_email);
-- =====================================================
-- USER_PRESENCE
-- =====================================================
DROP TABLE IF EXISTS user_presence CASCADE;
CREATE TABLE IF NOT EXISTS user_presence (
    user_email TEXT PRIMARY KEY,
    status TEXT DEFAULT 'offline',
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- =====================================================
-- USER_ABSENCES
-- =====================================================
DROP TABLE IF EXISTS user_absences CASCADE;
CREATE TABLE IF NOT EXISTS user_absences (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_email TEXT NOT NULL,
    user_name TEXT,
    absence_date DATE NOT NULL,
    program_id INTEGER REFERENCES programs(id) ON DELETE CASCADE,
    note TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- =====================================================
-- NOTIFICATIONS
-- =====================================================
DROP TABLE IF EXISTS notifications CASCADE;
CREATE TABLE IF NOT EXISTS notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_email TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    type TEXT DEFAULT 'info',
    is_read BOOLEAN DEFAULT false,
    link TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_email);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
-- =====================================================
-- APP_MODULE_TABS
-- =====================================================
DROP TABLE IF EXISTS app_module_tabs CASCADE;
CREATE TABLE IF NOT EXISTS app_module_tabs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    module_id UUID REFERENCES app_modules(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    label TEXT NOT NULL,
    icon TEXT,
    component TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    permissions JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ======================================================
-- ŹRÓDŁO: supabase/migrations/20260126_001_add_schwro_columns.sql
-- ======================================================
-- Add missing columns from schwro backup data

-- SONGS
ALTER TABLE songs ADD COLUMN IF NOT EXISTS author TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS tempo TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS chords TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS lyrics_chords TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS sheet_music_url TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS chord_format TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS meter TEXT;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS chords_bars TEXT;
-- PROGRAMS
ALTER TABLE programs ADD COLUMN IF NOT EXISTS schedule JSONB;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS atmosfera_team JSONB;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS produkcja JSONB;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS scena JSONB;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS szkolka JSONB;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS zespol JSONB;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS teaching JSONB;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS custom_mc_schedule JSONB;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS custom_mailing_schedule JSONB;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS custom_mail_schedule JSONB;
-- TEACHING_SPEAKERS
ALTER TABLE teaching_speakers ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE teaching_speakers ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE teaching_speakers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE teaching_speakers ADD COLUMN IF NOT EXISTS email TEXT;
-- KIDS_GROUPS
ALTER TABLE kids_groups ADD COLUMN IF NOT EXISTS room TEXT;
ALTER TABLE kids_groups ADD COLUMN IF NOT EXISTS materials JSONB;
ALTER TABLE kids_groups ADD COLUMN IF NOT EXISTS teacher_ids JSONB;
-- TEAM_ROLES
ALTER TABLE team_roles ADD COLUMN IF NOT EXISTS field_key TEXT;
ALTER TABLE team_roles ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;
ALTER TABLE team_roles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
-- WORSHIP_TEAM
ALTER TABLE worship_team ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE worship_team ADD COLUMN IF NOT EXISTS status TEXT;
-- MEDIA_TEAM
ALTER TABLE media_team ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE media_team ADD COLUMN IF NOT EXISTS status TEXT;
-- NOTIFICATIONS
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS data JSONB;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read BOOLEAN DEFAULT false;
-- MESSAGES
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id UUID;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS forwarded_from UUID;
-- CONVERSATIONS
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ministry_key TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS avatar_url TEXT;
-- TASKS
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS team TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_time TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS end_time TEXT;
-- EVENTS
ALTER TABLE events ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS date DATE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS time TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS end_time TEXT;
-- TEAM_MEMBER_ROLES
ALTER TABLE team_member_roles ADD COLUMN IF NOT EXISTS member_id INTEGER;
-- SCHEDULE_ASSIGNMENTS
ALTER TABLE schedule_assignments ADD COLUMN IF NOT EXISTS assigned_by_email TEXT;
ALTER TABLE schedule_assignments ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE schedule_assignments ADD COLUMN IF NOT EXISTS assignment_type TEXT;
ALTER TABLE schedule_assignments ADD COLUMN IF NOT EXISTS role_name TEXT;
-- MLODZIEZOWKA_MEMBERS
ALTER TABLE mlodziezowka_members ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE mlodziezowka_members ADD COLUMN IF NOT EXISTS join_date DATE;
ALTER TABLE mlodziezowka_members ADD COLUMN IF NOT EXISTS birth_date DATE;
-- HOME_GROUPS
ALTER TABLE home_groups ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE home_groups ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE home_groups ADD COLUMN IF NOT EXISTS region TEXT;
-- KIDS_STUDENTS
ALTER TABLE kids_students ADD COLUMN IF NOT EXISTS birth_year INTEGER;
ALTER TABLE kids_students ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE kids_students ADD COLUMN IF NOT EXISTS parent2_name TEXT;
ALTER TABLE kids_students ADD COLUMN IF NOT EXISTS parent2_phone TEXT;
ALTER TABLE kids_students ADD COLUMN IF NOT EXISTS parent2_email TEXT;
ALTER TABLE kids_students ADD COLUMN IF NOT EXISTS emergency_contact TEXT;
ALTER TABLE kids_students ADD COLUMN IF NOT EXISTS can_pickup TEXT[];
-- KIDS_TEACHERS
ALTER TABLE kids_teachers ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE kids_teachers ADD COLUMN IF NOT EXISTS avatar_url TEXT;
-- PRAYER_REQUESTS
ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS answered_testimony TEXT;
ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS answered_at TIMESTAMPTZ;
ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS category TEXT;
-- CONVERSATION_PARTICIPANTS
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false;
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS muted BOOLEAN DEFAULT false;
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT false;
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS unread_count INTEGER DEFAULT 0;
-- APP_MODULE_TABS
ALTER TABLE app_module_tabs ADD COLUMN IF NOT EXISTS component_type TEXT;
ALTER TABLE app_module_tabs ADD COLUMN IF NOT EXISTS config JSONB;
ALTER TABLE app_module_tabs ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE app_module_tabs ADD COLUMN IF NOT EXISTS requires_permission TEXT;

-- ======================================================
-- ŹRÓDŁO: supabase/migrations/20260127_001_fix_remaining_columns.sql
-- ======================================================
-- Fix remaining columns and table structures

-- HOME_GROUPS - add email column
ALTER TABLE home_groups ADD COLUMN IF NOT EXISTS email TEXT;
-- TEACHING_SPEAKERS - fix id to INTEGER
DROP TABLE IF EXISTS teaching_speakers CASCADE;
CREATE TABLE IF NOT EXISTS teaching_speakers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    bio TEXT,
    photo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    email TEXT
);
-- WORSHIP_TEAM - fix id to INTEGER
DROP TABLE IF EXISTS worship_team CASCADE;
CREATE TABLE IF NOT EXISTS worship_team (
    id SERIAL PRIMARY KEY,
    full_name TEXT NOT NULL,
    role TEXT,
    status TEXT,
    phone TEXT,
    email TEXT
);
-- MEDIA_TEAM - fix id to INTEGER
DROP TABLE IF EXISTS media_team CASCADE;
CREATE TABLE IF NOT EXISTS media_team (
    id SERIAL PRIMARY KEY,
    full_name TEXT NOT NULL,
    role TEXT,
    status TEXT,
    phone TEXT,
    email TEXT
);
-- TEAM_ROLES - fix id to INTEGER
DROP TABLE IF EXISTS team_roles CASCADE;
CREATE TABLE IF NOT EXISTS team_roles (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    team_type TEXT NOT NULL,
    description TEXT,
    field_key TEXT,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- TEAM_MEMBER_ROLES - fix structure
DROP TABLE IF EXISTS team_member_roles CASCADE;
CREATE TABLE IF NOT EXISTS team_member_roles (
    id SERIAL PRIMARY KEY,
    member_id INTEGER,
    member_email TEXT,
    member_name TEXT,
    member_table TEXT,
    role_id INTEGER REFERENCES team_roles(id) ON DELETE CASCADE,
    team_type TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- SCHEDULE_ASSIGNMENTS - fix structure
DROP TABLE IF EXISTS schedule_assignments CASCADE;
CREATE TABLE IF NOT EXISTS schedule_assignments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    program_id INTEGER REFERENCES programs(id) ON DELETE CASCADE,
    role_id INTEGER REFERENCES team_roles(id) ON DELETE SET NULL,
    member_email TEXT,
    member_name TEXT,
    member_id INTEGER,
    status TEXT DEFAULT 'pending',
    assignment_type TEXT,
    role_name TEXT,
    assigned_by_email TEXT,
    assigned_by_name TEXT,
    assigned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- MLODZIEZOWKA_MEMBERS - add missing columns
ALTER TABLE mlodziezowka_members ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE mlodziezowka_members ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
-- KIDS_STUDENTS - fix structure
DROP TABLE IF EXISTS kids_students CASCADE;
CREATE TABLE IF NOT EXISTS kids_students (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name TEXT,
    first_name TEXT,
    last_name TEXT,
    birth_date DATE,
    birth_year INTEGER,
    gender TEXT,
    group_id INTEGER REFERENCES kids_groups(id) ON DELETE SET NULL,
    parent_name TEXT,
    parent_phone TEXT,
    parent_email TEXT,
    parent2_name TEXT,
    parent2_phone TEXT,
    parent2_email TEXT,
    emergency_contact TEXT,
    can_pickup TEXT[],
    notes TEXT,
    photo_url TEXT,
    is_active BOOLEAN DEFAULT true,
    allergies TEXT,
    medical_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- KIDS_TEACHERS - fix id to INTEGER
DROP TABLE IF EXISTS kids_teachers CASCADE;
CREATE TABLE IF NOT EXISTS kids_teachers (
    id SERIAL PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role TEXT,
    avatar_url TEXT,
    group_id INTEGER REFERENCES kids_groups(id) ON DELETE SET NULL,
    is_leader BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- PRAYER_REQUESTS - add missing columns
ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public';
-- EVENTS - fix id to INTEGER
DROP TABLE IF EXISTS events CASCADE;
CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    date DATE,
    time TEXT,
    end_time TEXT,
    location TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- CONVERSATION_PARTICIPANTS - add missing columns
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS role TEXT;
-- APP_MODULE_TABS - add missing columns
ALTER TABLE app_module_tabs ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- ======================================================
-- ŹRÓDŁO: supabase/migrations/20260128_001_final_schema_fixes.sql
-- ======================================================
-- Final schema fixes to match schwro backup structure exactly

-- TEACHING_SPEAKERS - fix id to UUID
DROP TABLE IF EXISTS teaching_speakers CASCADE;
CREATE TABLE IF NOT EXISTS teaching_speakers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    bio TEXT,
    photo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    email TEXT
);
-- MEDIA_TEAM - add created_at
ALTER TABLE media_team ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
-- HOME_GROUPS - fix structure
DROP TABLE IF EXISTS home_groups CASCADE;
CREATE TABLE IF NOT EXISTS home_groups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    leader_id UUID,
    meeting_day TEXT,
    meeting_time TEXT,
    location TEXT,
    address TEXT,
    phone TEXT,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    materials JSONB DEFAULT '[]'
);
-- TEAM_MEMBER_ROLES - fix member_id to UUID
DROP TABLE IF EXISTS team_member_roles CASCADE;
CREATE TABLE IF NOT EXISTS team_member_roles (
    id SERIAL PRIMARY KEY,
    member_id UUID,
    member_table TEXT,
    role_id INTEGER REFERENCES team_roles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- SCHEDULE_ASSIGNMENTS - fix structure
DROP TABLE IF EXISTS schedule_assignments CASCADE;
CREATE TABLE IF NOT EXISTS schedule_assignments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    program_id INTEGER REFERENCES programs(id) ON DELETE CASCADE,
    team_type TEXT,
    role_key TEXT,
    assigned_name TEXT,
    assigned_email TEXT,
    assigned_by_email TEXT,
    assigned_by_name TEXT,
    status TEXT DEFAULT 'pending',
    token UUID,
    responded_at TIMESTAMPTZ,
    email_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- MLODZIEZOWKA_MEMBERS - fix structure
DROP TABLE IF EXISTS mlodziezowka_members CASCADE;
CREATE TABLE IF NOT EXISTS mlodziezowka_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    birth_date DATE,
    address TEXT,
    notes TEXT,
    photo_url TEXT,
    joined_at DATE,
    is_active BOOLEAN DEFAULT true,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- KIDS_STUDENTS - fix structure
DROP TABLE IF EXISTS kids_students CASCADE;
CREATE TABLE IF NOT EXISTS kids_students (
    id SERIAL PRIMARY KEY,
    full_name TEXT,
    birth_year TEXT,
    parent_info TEXT,
    notes TEXT,
    group_id INTEGER REFERENCES kids_groups(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    household_id UUID,
    allergies TEXT,
    medical_notes TEXT,
    photo_url TEXT
);
-- PRAYER_REQUESTS - fix structure
DROP TABLE IF EXISTS prayer_requests CASCADE;
CREATE TABLE IF NOT EXISTS prayer_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID,
    user_email TEXT,
    user_name TEXT,
    content TEXT NOT NULL,
    category TEXT,
    visibility TEXT DEFAULT 'public',
    is_anonymous BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'active',
    answered_testimony TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    requester_name TEXT,
    is_active BOOLEAN DEFAULT true
);
-- CONVERSATION_PARTICIPANTS - add missing columns
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS starred BOOLEAN DEFAULT false;
-- APP_MODULE_TABS - fix structure
DROP TABLE IF EXISTS app_module_tabs CASCADE;
CREATE TABLE IF NOT EXISTS app_module_tabs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    module_id UUID REFERENCES app_modules(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    label TEXT NOT NULL,
    icon TEXT,
    display_order INTEGER DEFAULT 0,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    component_type TEXT
);
-- HOME_GROUP_MEMBERS - fix structure for import
DROP TABLE IF EXISTS home_group_members CASCADE;
CREATE TABLE IF NOT EXISTS home_group_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    group_id UUID REFERENCES home_groups(id) ON DELETE CASCADE,
    is_leader BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ======================================================
-- ŹRÓDŁO: supabase/migrations/20260129_001_fix_team_member_roles.sql
-- ======================================================
-- Fix team_member_roles to accept any member_id format
DROP TABLE IF EXISTS team_member_roles CASCADE;
CREATE TABLE IF NOT EXISTS team_member_roles (
    id SERIAL PRIMARY KEY,
    member_id TEXT,  -- Use TEXT to handle both UUID and INTEGER
    member_table TEXT,
    role_id INTEGER REFERENCES team_roles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ======================================================
-- ŹRÓDŁO: supabase/migrations/20260130_002_fix_dictionaries.sql
-- ======================================================
-- Fix app_dictionaries structure

-- Add missing columns to app_dictionaries
ALTER TABLE app_dictionaries ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE app_dictionaries ADD COLUMN IF NOT EXISTS key TEXT;
ALTER TABLE app_dictionaries ADD COLUMN IF NOT EXISTS value TEXT;
ALTER TABLE app_dictionaries ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE app_dictionaries ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE app_dictionaries ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE app_dictionaries ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE app_dictionaries ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
-- Add missing columns to home_group_leaders
ALTER TABLE home_group_leaders ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE home_group_leaders ADD COLUMN IF NOT EXISTS user_name TEXT;
ALTER TABLE home_group_leaders ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false;

-- ======================================================
-- ŹRÓDŁO: supabase/migrations/20260131_001_fix_dashboard_tables.sql
-- ======================================================
-- Fix user_dashboard_layouts and user_tasks tables

-- Drop and recreate user_dashboard_layouts with correct structure
DROP TABLE IF EXISTS user_dashboard_layouts CASCADE;
CREATE TABLE IF NOT EXISTS user_dashboard_layouts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_email TEXT NOT NULL UNIQUE,
    layout JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_dashboard_layouts_email ON user_dashboard_layouts(user_email);
-- Drop and recreate user_tasks with correct structure
DROP TABLE IF EXISTS user_tasks CASCADE;
CREATE TABLE IF NOT EXISTS user_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_email TEXT NOT NULL,
    task_id UUID,
    title TEXT,
    description TEXT,
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'medium',
    due_date DATE,
    due_time TEXT,
    location TEXT,
    team TEXT,
    assigned_to TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_tasks_email ON user_tasks(user_email);
CREATE INDEX IF NOT EXISTS idx_user_tasks_due ON user_tasks(due_date);
-- Fix home_group_leaders - drop and recreate
DROP TABLE IF EXISTS home_group_leaders CASCADE;
CREATE TABLE IF NOT EXISTS home_group_leaders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id UUID REFERENCES home_groups(id) ON DELETE CASCADE,
    user_email TEXT,
    user_name TEXT,
    email TEXT,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_home_group_leaders_email ON home_group_leaders(user_email);
CREATE INDEX IF NOT EXISTS idx_home_group_leaders_group ON home_group_leaders(group_id);

-- ======================================================
-- ŹRÓDŁO: supabase/migrations/20260321_001_add_campuses.sql
-- ======================================================
-- =====================================================
-- MULTI-CAMPUS SUPPORT
-- =====================================================

-- 1. Tabela campuses
CREATE TABLE IF NOT EXISTS campuses (
    id SERIAL PRIMARY KEY,
    tenant_id UUID,
    name TEXT NOT NULL,
    address TEXT,
    city TEXT,
    timezone TEXT DEFAULT 'Europe/Warsaw',
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_campuses_tenant ON campuses(tenant_id);
-- Trigger aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_campuses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_campuses_updated_at ON campuses;
CREATE TRIGGER trigger_campuses_updated_at
    BEFORE UPDATE ON campuses
    FOR EACH ROW
    EXECUTE FUNCTION update_campuses_updated_at();
COMMENT ON TABLE campuses IS 'Lokalizacje/kampusy kościoła';
-- 2. Dodanie campus_id do tabel (nullable, nie łamie istniejących danych)

-- members (SERIAL PK)
ALTER TABLE members ADD COLUMN IF NOT EXISTS campus_id INTEGER REFERENCES campuses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_members_campus ON members(campus_id);
-- programs (SERIAL PK)
ALTER TABLE programs ADD COLUMN IF NOT EXISTS campus_id INTEGER REFERENCES campuses(id) ON DELETE SET NULL;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS graphics_override JSONB;
CREATE INDEX IF NOT EXISTS idx_programs_campus ON programs(campus_id);
-- events (UUID PK)
ALTER TABLE events ADD COLUMN IF NOT EXISTS campus_id INTEGER REFERENCES campuses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_events_campus ON events(campus_id);
-- worship_events (UUID PK)
ALTER TABLE worship_events ADD COLUMN IF NOT EXISTS campus_id INTEGER REFERENCES campuses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_worship_events_campus ON worship_events(campus_id);
-- media_events (UUID PK)
ALTER TABLE media_events ADD COLUMN IF NOT EXISTS campus_id INTEGER REFERENCES campuses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_media_events_campus ON media_events(campus_id);
-- atmosfera_events (UUID PK)
ALTER TABLE atmosfera_events ADD COLUMN IF NOT EXISTS campus_id INTEGER REFERENCES campuses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_atmosfera_events_campus ON atmosfera_events(campus_id);
-- kids_events (UUID PK)
ALTER TABLE kids_events ADD COLUMN IF NOT EXISTS campus_id INTEGER REFERENCES campuses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_kids_events_campus ON kids_events(campus_id);
-- homegroups_events (UUID PK)
ALTER TABLE homegroups_events ADD COLUMN IF NOT EXISTS campus_id INTEGER REFERENCES campuses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_homegroups_events_campus ON homegroups_events(campus_id);
-- mlodziezowka_events (UUID PK)
ALTER TABLE mlodziezowka_events ADD COLUMN IF NOT EXISTS campus_id INTEGER REFERENCES campuses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_mlodziezowka_events_campus ON mlodziezowka_events(campus_id);
-- home_groups (UUID PK)
ALTER TABLE home_groups ADD COLUMN IF NOT EXISTS campus_id INTEGER REFERENCES campuses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_home_groups_campus ON home_groups(campus_id);
-- kids_groups (SERIAL PK)
ALTER TABLE kids_groups ADD COLUMN IF NOT EXISTS campus_id INTEGER REFERENCES campuses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_kids_groups_campus ON kids_groups(campus_id);
-- kids_students (UUID PK)
ALTER TABLE kids_students ADD COLUMN IF NOT EXISTS campus_id INTEGER REFERENCES campuses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_kids_students_campus ON kids_students(campus_id);
-- budget_items
ALTER TABLE budget_items ADD COLUMN IF NOT EXISTS campus_id INTEGER REFERENCES campuses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_budget_items_campus ON budget_items(campus_id);
-- checkin_sessions
ALTER TABLE checkin_sessions ADD COLUMN IF NOT EXISTS campus_id INTEGER REFERENCES campuses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_checkin_sessions_campus ON checkin_sessions(campus_id);
-- 3. Primary campus użytkownika
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS campus_id INTEGER REFERENCES campuses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_app_users_campus ON app_users(campus_id);

-- ======================================================
-- ŹRÓDŁO: supabase/migrations/20260321_002_create_program_types.sql
-- ======================================================
-- =====================================================
-- PROGRAM TYPES (Kategorie/typy wydarzeń)
-- =====================================================

CREATE TABLE IF NOT EXISTS program_types (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT DEFAULT 'Calendar',
    color TEXT DEFAULT '#6366f1',
    -- Które sekcje zespołów są widoczne dla tego typu
    visible_sections JSONB DEFAULT '["zespol", "produkcja", "atmosfera_team", "scena", "szkolka"]',
    is_default BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Domyślny typ: Nabożeństwo niedzielne
INSERT INTO program_types (name, icon, color, visible_sections, is_default, sort_order)
VALUES ('Nabożeństwo niedzielne', 'Church', '#6366f1', '["zespol", "produkcja", "atmosfera_team", "scena", "szkolka"]', true, 0)
ON CONFLICT DO NOTHING;
-- Dodaj kolumnę type_id do programs (nullable, FK do program_types)
ALTER TABLE programs ADD COLUMN IF NOT EXISTS type_id INTEGER REFERENCES program_types(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_programs_type ON programs(type_id);

-- ======================================================
-- ŹRÓDŁO: supabase/migrations/20260321_003_add_title_to_programs.sql
-- ======================================================
-- Add missing title column to programs
ALTER TABLE programs ADD COLUMN IF NOT EXISTS title TEXT;

-- ======================================================
-- ŹRÓDŁO: supabase/migrations/20260506_001_fix_push_subscriptions_schema.sql
-- ======================================================
-- Fix push_subscriptions: align table with frontend (usePushNotifications.js)
-- and Edge Function send-push, which both expect schema:
--   user_email TEXT, endpoint TEXT UNIQUE, p256dh TEXT, auth TEXT, user_agent TEXT.
-- Production currently has the older schema with user_id/keys JSONB and
-- UNIQUE(user_id, endpoint), so upsert(onConflict: 'endpoint') fails with
-- "there is no unique or exclusion constraint matching the ON CONFLICT specification".

BEGIN;
-- 1. Make sure the table exists in some form.
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- 2. Add columns expected by app code if they are missing.
ALTER TABLE public.push_subscriptions
    ADD COLUMN IF NOT EXISTS user_email TEXT,
    ADD COLUMN IF NOT EXISTS p256dh     TEXT,
    ADD COLUMN IF NOT EXISTS auth       TEXT,
    ADD COLUMN IF NOT EXISTS user_agent TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
-- 3. Backfill p256dh/auth from legacy `keys` JSONB column if it exists.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'push_subscriptions' AND column_name = 'keys'
    ) THEN
        UPDATE public.push_subscriptions
           SET p256dh = COALESCE(p256dh, keys->>'p256dh'),
               auth   = COALESCE(auth,   keys->>'auth')
         WHERE keys IS NOT NULL;
    END IF;
END $$;
-- 4. Drop legacy composite unique (user_id, endpoint) if present, plus the legacy `keys` column.
DO $$
DECLARE
    cname TEXT;
BEGIN
    SELECT conname INTO cname
      FROM pg_constraint
     WHERE conrelid = 'public.push_subscriptions'::regclass
       AND contype = 'u'
       AND (
           SELECT array_agg(attname ORDER BY attname)
             FROM pg_attribute
            WHERE attrelid = conrelid AND attnum = ANY(conkey)
       ) = ARRAY['endpoint','user_id']::name[];

    IF cname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.push_subscriptions DROP CONSTRAINT %I', cname);
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'push_subscriptions' AND column_name = 'keys'
    ) THEN
        ALTER TABLE public.push_subscriptions DROP COLUMN keys;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'push_subscriptions' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE public.push_subscriptions DROP COLUMN user_id;
    END IF;
END $$;
-- 5. Remove rows that cannot satisfy the new UNIQUE(endpoint) (duplicates).
--    Keep the most recent per endpoint.
DELETE FROM public.push_subscriptions a
 USING public.push_subscriptions b
 WHERE a.endpoint = b.endpoint
   AND a.created_at < b.created_at;
-- 6. Add UNIQUE(endpoint) if not already present.
DO $$
DECLARE
    has_unique_endpoint BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'public.push_subscriptions'::regclass
           AND contype = 'u'
           AND (
               SELECT array_agg(attname)
                 FROM pg_attribute
                WHERE attrelid = conrelid AND attnum = ANY(conkey)
           ) = ARRAY['endpoint']::name[]
    ) INTO has_unique_endpoint;

    IF NOT has_unique_endpoint THEN
        ALTER TABLE public.push_subscriptions
            ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);
    END IF;
END $$;
-- 7. Required-field constraints (NOT NULL where reasonable).
UPDATE public.push_subscriptions SET p256dh = '' WHERE p256dh IS NULL;
UPDATE public.push_subscriptions SET auth   = '' WHERE auth   IS NULL;
ALTER TABLE public.push_subscriptions
    ALTER COLUMN endpoint SET NOT NULL,
    ALTER COLUMN p256dh   SET NOT NULL,
    ALTER COLUMN auth     SET NOT NULL;
-- 8. Indexes.
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_email ON public.push_subscriptions(user_email);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint  ON public.push_subscriptions(endpoint);
-- 9. updated_at trigger.
CREATE OR REPLACE FUNCTION public.update_push_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_update_push_subscriptions_updated_at ON public.push_subscriptions;
DROP TRIGGER IF EXISTS trigger_update_push_subscriptions_updated_at ON public;
CREATE TRIGGER trigger_update_push_subscriptions_updated_at
    BEFORE UPDATE ON public.push_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_push_subscriptions_updated_at();
COMMIT;

-- ======================================================
-- ŹRÓDŁO: migrations/create_module_management_tables.sql
-- ======================================================
-- ============================================
-- TABELE ZARZĄDZANIA MODUŁAMI
-- Wykonaj te polecenia w Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. Tabela modułów aplikacji
-- ============================================
CREATE TABLE IF NOT EXISTS app_modules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'Square',
    path TEXT NOT NULL,
    resource_key TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    is_system BOOLEAN DEFAULT false,
    is_enabled BOOLEAN DEFAULT true,
    component_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_modules_order ON app_modules(display_order);
CREATE INDEX IF NOT EXISTS idx_app_modules_key ON app_modules(key);
-- Trigger do automatycznej aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_app_modules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_update_app_modules_updated_at ON app_modules;
DROP TRIGGER IF EXISTS trigger_update_app_modules_updated_at ON app_modules;
CREATE TRIGGER trigger_update_app_modules_updated_at
    BEFORE UPDATE ON app_modules
    FOR EACH ROW
    EXECUTE FUNCTION update_app_modules_updated_at();
-- ============================================
-- 2. Tabela zakładek modułów
-- ============================================
CREATE TABLE IF NOT EXISTS app_module_tabs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    module_id UUID REFERENCES app_modules(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    label TEXT NOT NULL,
    icon TEXT DEFAULT 'Square',
    component_type TEXT DEFAULT 'empty', -- 'empty', 'events', 'tasks', 'finance', 'members', 'wall'
    display_order INTEGER DEFAULT 0,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(module_id, key)
);
-- Dodaj kolumnę component_type jeśli nie istnieje (dla istniejących instalacji)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'app_module_tabs' AND column_name = 'component_type') THEN
        ALTER TABLE app_module_tabs ADD COLUMN component_type TEXT DEFAULT 'empty';
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_app_module_tabs_order ON app_module_tabs(module_id, display_order);
-- ============================================
-- 6. Dane początkowe - moduły systemowe
-- ============================================
INSERT INTO app_modules (key, label, icon, path, resource_key, display_order, is_system, component_name) VALUES
    ('dashboard', 'Pulpit', 'Home', '/', 'module:dashboard', 0, true, 'DashboardModule'),
    ('programs', 'Programy', 'ClipboardList', '/programs', 'module:programs', 1, true, 'ProgramsModule'),
    ('calendar', 'Kalendarz', 'Calendar', '/calendar', 'module:calendar', 2, true, 'CalendarModule'),
    ('homegroups', 'Grupy domowe', 'UserCircle', '/home-groups', 'module:homegroups', 3, true, 'HomeGroupsModule'),
    ('media', 'MediaTeam', 'Video', '/media', 'module:media', 4, true, 'MediaTeamModule'),
    ('atmosfera', 'Atmosfera Team', 'HeartHandshake', '/atmosfera', 'module:atmosfera', 5, true, 'AtmosferaTeamModule'),
    ('kids', 'Małe SchWro', 'Baby', '/kids', 'module:kids', 6, true, 'KidsModule'),
    ('worship', 'Zespół Uwielbienia', 'Music', '/worship', 'module:worship', 7, true, 'WorshipModule'),
    ('finance', 'Finanse', 'DollarSign', '/finance', 'module:finance', 8, true, 'FinanceModule'),
    ('teaching', 'Nauczanie', 'GraduationCap', '/teaching', 'module:teaching', 9, true, 'TeachingModule'),
    ('prayer', 'Ściana modlitwy', 'Heart', '/prayer', 'module:prayer', 10, true, 'PrayerWallModule'),
    ('komunikator', 'Komunikator', 'MessageSquare', '/komunikator', 'module:komunikator', 11, true, 'KomunikatorModule'),
    ('mlodziezowka', 'Młodzieżówka', 'Sparkles', '/mlodziezowka', 'module:mlodziezowka', 12, true, 'MlodziezowkaModule'),
    ('members', 'Członkowie', 'Users', '/members', 'module:members', 13, true, 'MembersModule'),
    ('settings', 'Ustawienia', 'Settings', '/settings', 'module:settings', 14, true, 'GlobalSettings')
ON CONFLICT (key) DO NOTHING;
-- Aktualizacja istniejących danych (jeśli migracja była już wykonana)
UPDATE app_modules SET path = '/home-groups', resource_key = 'module:homegroups', icon = 'UserCircle' WHERE key = 'homegroups';
-- ============================================
-- 7. Dane początkowe - zakładki modułów
-- ============================================

-- Zakładki dla Członkowie (members)
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'members', 'Członkowie', 'Users', 0, true FROM app_modules WHERE key = 'members'
ON CONFLICT (module_id, key) DO NOTHING;
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'ministries', 'Służby', 'Briefcase', 1, true FROM app_modules WHERE key = 'members'
ON CONFLICT (module_id, key) DO NOTHING;
-- Zakładki dla Grupy domowe (homegroups)
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'groups', 'Grupy', 'Users', 0, true FROM app_modules WHERE key = 'homegroups'
ON CONFLICT (module_id, key) DO NOTHING;
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'leaders', 'Liderzy', 'UserCheck', 1, true FROM app_modules WHERE key = 'homegroups'
ON CONFLICT (module_id, key) DO NOTHING;
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'members', 'Członkowie', 'User', 2, true FROM app_modules WHERE key = 'homegroups'
ON CONFLICT (module_id, key) DO NOTHING;
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'tasks', 'Zadania', 'CheckSquare', 3, true FROM app_modules WHERE key = 'homegroups'
ON CONFLICT (module_id, key) DO NOTHING;
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'wall', 'Tablica', 'MessageSquare', 4, true FROM app_modules WHERE key = 'homegroups'
ON CONFLICT (module_id, key) DO NOTHING;
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'finances', 'Finanse', 'DollarSign', 5, false FROM app_modules WHERE key = 'homegroups'
ON CONFLICT (module_id, key) DO NOTHING;
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'events', 'Wydarzenia', 'Calendar', 6, false FROM app_modules WHERE key = 'homegroups'
ON CONFLICT (module_id, key) DO NOTHING;
-- Zakładki dla Media Team
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'schedule', 'Grafik', 'Calendar', 0, true FROM app_modules WHERE key = 'media'
ON CONFLICT (module_id, key) DO NOTHING;
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'tasks', 'Zadania', 'CheckSquare', 1, true FROM app_modules WHERE key = 'media'
ON CONFLICT (module_id, key) DO NOTHING;
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'team', 'Zespół', 'Users', 2, true FROM app_modules WHERE key = 'media'
ON CONFLICT (module_id, key) DO NOTHING;
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'finances', 'Finanse', 'DollarSign', 3, false FROM app_modules WHERE key = 'media'
ON CONFLICT (module_id, key) DO NOTHING;
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'events', 'Wydarzenia', 'Calendar', 4, false FROM app_modules WHERE key = 'media'
ON CONFLICT (module_id, key) DO NOTHING;
-- Zakładki dla Zespół Uwielbienia (worship)
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'songs', 'Pieśni', 'Music', 0, true FROM app_modules WHERE key = 'worship'
ON CONFLICT (module_id, key) DO NOTHING;
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'team', 'Zespół', 'Users', 1, true FROM app_modules WHERE key = 'worship'
ON CONFLICT (module_id, key) DO NOTHING;
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'schedule', 'Grafik', 'Calendar', 2, true FROM app_modules WHERE key = 'worship'
ON CONFLICT (module_id, key) DO NOTHING;
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'finances', 'Finanse', 'DollarSign', 3, false FROM app_modules WHERE key = 'worship'
ON CONFLICT (module_id, key) DO NOTHING;
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'events', 'Wydarzenia', 'Calendar', 4, false FROM app_modules WHERE key = 'worship'
ON CONFLICT (module_id, key) DO NOTHING;
-- Zakładki dla Atmosfera Team
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'schedule', 'Grafik', 'Calendar', 0, true FROM app_modules WHERE key = 'atmosfera'
ON CONFLICT (module_id, key) DO NOTHING;
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'team', 'Zespół', 'Users', 1, true FROM app_modules WHERE key = 'atmosfera'
ON CONFLICT (module_id, key) DO NOTHING;
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'finances', 'Finanse', 'DollarSign', 2, false FROM app_modules WHERE key = 'atmosfera'
ON CONFLICT (module_id, key) DO NOTHING;
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'events', 'Wydarzenia', 'Calendar', 3, false FROM app_modules WHERE key = 'atmosfera'
ON CONFLICT (module_id, key) DO NOTHING;
-- Zakładki dla Małe SchWro (kids)
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'schedule', 'Grafik', 'Calendar', 0, true FROM app_modules WHERE key = 'kids'
ON CONFLICT (module_id, key) DO NOTHING;
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'teachers', 'Nauczyciele', 'UserCheck', 1, true FROM app_modules WHERE key = 'kids'
ON CONFLICT (module_id, key) DO NOTHING;
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'groups', 'Grupy', 'Users', 2, true FROM app_modules WHERE key = 'kids'
ON CONFLICT (module_id, key) DO NOTHING;
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'students', 'Dzieci', 'Baby', 3, true FROM app_modules WHERE key = 'kids'
ON CONFLICT (module_id, key) DO NOTHING;
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'materials', 'Materiały', 'FileText', 4, true FROM app_modules WHERE key = 'kids'
ON CONFLICT (module_id, key) DO NOTHING;
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'finances', 'Finanse', 'DollarSign', 5, false FROM app_modules WHERE key = 'kids'
ON CONFLICT (module_id, key) DO NOTHING;
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'events', 'Wydarzenia', 'Calendar', 6, false FROM app_modules WHERE key = 'kids'
ON CONFLICT (module_id, key) DO NOTHING;
-- Zakładki dla Młodzieżówka
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'events', 'Wydarzenia', 'Calendar', 0, true FROM app_modules WHERE key = 'mlodziezowka'
ON CONFLICT (module_id, key) DO NOTHING;
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'tasks', 'Zadania', 'CheckSquare', 1, true FROM app_modules WHERE key = 'mlodziezowka'
ON CONFLICT (module_id, key) DO NOTHING;
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'leaders', 'Liderzy', 'UserCheck', 2, true FROM app_modules WHERE key = 'mlodziezowka'
ON CONFLICT (module_id, key) DO NOTHING;
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'members', 'Członkowie', 'Users', 3, true FROM app_modules WHERE key = 'mlodziezowka'
ON CONFLICT (module_id, key) DO NOTHING;
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'finances', 'Finanse', 'DollarSign', 4, false FROM app_modules WHERE key = 'mlodziezowka'
ON CONFLICT (module_id, key) DO NOTHING;
-- Zakładki dla Ściana modlitwy (prayer)
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'wall', 'Ściana modlitwy', 'Heart', 0, true FROM app_modules WHERE key = 'prayer'
ON CONFLICT (module_id, key) DO NOTHING;
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'leaders_requests', 'Prośby dla liderów', 'Shield', 1, true FROM app_modules WHERE key = 'prayer'
ON CONFLICT (module_id, key) DO NOTHING;
-- Zakładki dla Komunikator
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'direct', 'Rozmowy prywatne', 'MessageSquare', 0, true FROM app_modules WHERE key = 'komunikator'
ON CONFLICT (module_id, key) DO NOTHING;
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'groups', 'Grupy', 'Users', 1, true FROM app_modules WHERE key = 'komunikator'
ON CONFLICT (module_id, key) DO NOTHING;
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT id, 'ministry', 'Kanały służb', 'Radio', 2, true FROM app_modules WHERE key = 'komunikator'
ON CONFLICT (module_id, key) DO NOTHING;

-- ======================================================
-- ŹRÓDŁO: migrations/create_team_roles_table.sql
-- ======================================================
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

-- ======================================================
-- ŹRÓDŁO: migrations/create_events_table.sql
-- ======================================================
-- Tabela dla ogólnych wydarzeń (nie nabożeństw)
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  date DATE NOT NULL,
  time VARCHAR(10),
  end_time VARCHAR(10),
  location VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Indeks dla szybkiego wyszukiwania po dacie
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);

-- ======================================================
-- ŹRÓDŁO: migrations/create_ministry_events_tables.sql
-- ======================================================
-- ============================================
-- TABELE WYDARZEŃ DLA SŁUŻB
-- Wykonaj te polecenia w Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. Tabela wydarzeń Zespołu Uwielbienia
-- ============================================
CREATE TABLE IF NOT EXISTS worship_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    event_type TEXT DEFAULT 'proba', -- proba, koncert, nabozesnstwo, warsztat, inne
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE,
    location TEXT,
    max_participants INTEGER,
    created_by TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_worship_events_start ON worship_events(start_date);
CREATE INDEX IF NOT EXISTS idx_worship_events_type ON worship_events(event_type);
CREATE OR REPLACE FUNCTION update_worship_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_update_worship_events_updated_at ON worship_events;
DROP TRIGGER IF EXISTS trigger_update_worship_events_updated_at ON worship_events;
CREATE TRIGGER trigger_update_worship_events_updated_at
    BEFORE UPDATE ON worship_events
    FOR EACH ROW
    EXECUTE FUNCTION update_worship_events_updated_at();
-- ============================================
-- 2. Tabela wydarzeń Media Team
-- ============================================
CREATE TABLE IF NOT EXISTS media_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    event_type TEXT DEFAULT 'produkcja', -- produkcja, szkolenie, streaming, inne
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE,
    location TEXT,
    max_participants INTEGER,
    created_by TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_media_events_start ON media_events(start_date);
CREATE INDEX IF NOT EXISTS idx_media_events_type ON media_events(event_type);
CREATE OR REPLACE FUNCTION update_media_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_update_media_events_updated_at ON media_events;
DROP TRIGGER IF EXISTS trigger_update_media_events_updated_at ON media_events;
CREATE TRIGGER trigger_update_media_events_updated_at
    BEFORE UPDATE ON media_events
    FOR EACH ROW
    EXECUTE FUNCTION update_media_events_updated_at();
-- ============================================
-- 3. Tabela wydarzeń Atmosfera Team
-- ============================================
CREATE TABLE IF NOT EXISTS atmosfera_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    event_type TEXT DEFAULT 'spotkanie', -- spotkanie, szkolenie, integracja, inne
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE,
    location TEXT,
    max_participants INTEGER,
    created_by TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_atmosfera_events_start ON atmosfera_events(start_date);
CREATE INDEX IF NOT EXISTS idx_atmosfera_events_type ON atmosfera_events(event_type);
CREATE OR REPLACE FUNCTION update_atmosfera_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_update_atmosfera_events_updated_at ON atmosfera_events;
DROP TRIGGER IF EXISTS trigger_update_atmosfera_events_updated_at ON atmosfera_events;
CREATE TRIGGER trigger_update_atmosfera_events_updated_at
    BEFORE UPDATE ON atmosfera_events
    FOR EACH ROW
    EXECUTE FUNCTION update_atmosfera_events_updated_at();
-- ============================================
-- 4. Tabela wydarzeń Małe SchWro (Kids)
-- ============================================
CREATE TABLE IF NOT EXISTS kids_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    event_type TEXT DEFAULT 'zajecia', -- zajecia, wycieczka, warsztat, przedstawienie, inne
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE,
    location TEXT,
    age_group TEXT, -- mlodsza, srednia, starsza, wszystkie
    max_participants INTEGER,
    created_by TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kids_events_start ON kids_events(start_date);
CREATE INDEX IF NOT EXISTS idx_kids_events_type ON kids_events(event_type);
CREATE OR REPLACE FUNCTION update_kids_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_update_kids_events_updated_at ON kids_events;
DROP TRIGGER IF EXISTS trigger_update_kids_events_updated_at ON kids_events;
CREATE TRIGGER trigger_update_kids_events_updated_at
    BEFORE UPDATE ON kids_events
    FOR EACH ROW
    EXECUTE FUNCTION update_kids_events_updated_at();
-- ============================================
-- 5. Tabela wydarzeń Grup Domowych
-- ============================================
CREATE TABLE IF NOT EXISTS homegroups_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    event_type TEXT DEFAULT 'spotkanie', -- spotkanie, integracja, szkolenie, inne
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE,
    location TEXT,
    group_id BIGINT, -- opcjonalne powiązanie z konkretną grupą domową
    max_participants INTEGER,
    created_by TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_homegroups_events_start ON homegroups_events(start_date);
CREATE INDEX IF NOT EXISTS idx_homegroups_events_type ON homegroups_events(event_type);
CREATE INDEX IF NOT EXISTS idx_homegroups_events_group ON homegroups_events(group_id);
CREATE OR REPLACE FUNCTION update_homegroups_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_update_homegroups_events_updated_at ON homegroups_events;
DROP TRIGGER IF EXISTS trigger_update_homegroups_events_updated_at ON homegroups_events;
CREATE TRIGGER trigger_update_homegroups_events_updated_at
    BEFORE UPDATE ON homegroups_events
    FOR EACH ROW
    EXECUTE FUNCTION update_homegroups_events_updated_at();

-- ======================================================
-- ŹRÓDŁO: migrations/add_end_time_to_ministry_events.sql
-- ======================================================
-- ============================================
-- Dodanie kolumny end_time do tabel wydarzeń służb
-- Przechowuje godzinę zakończenia w formacie HH:MM
-- ============================================

-- Tabela worship_events
ALTER TABLE worship_events ADD COLUMN IF NOT EXISTS end_time VARCHAR(5);
COMMENT ON COLUMN worship_events.end_time IS 'Godzina zakończenia w formacie HH:MM';
-- Tabela media_events
ALTER TABLE media_events ADD COLUMN IF NOT EXISTS end_time VARCHAR(5);
COMMENT ON COLUMN media_events.end_time IS 'Godzina zakończenia w formacie HH:MM';
-- Tabela atmosfera_events
ALTER TABLE atmosfera_events ADD COLUMN IF NOT EXISTS end_time VARCHAR(5);
COMMENT ON COLUMN atmosfera_events.end_time IS 'Godzina zakończenia w formacie HH:MM';
-- Tabela kids_events
ALTER TABLE kids_events ADD COLUMN IF NOT EXISTS end_time VARCHAR(5);
COMMENT ON COLUMN kids_events.end_time IS 'Godzina zakończenia w formacie HH:MM';
-- Tabela homegroups_events
ALTER TABLE homegroups_events ADD COLUMN IF NOT EXISTS end_time VARCHAR(5);
COMMENT ON COLUMN homegroups_events.end_time IS 'Godzina zakończenia w formacie HH:MM';

-- ======================================================
-- ŹRÓDŁO: migrations/create_equipment_table.sql
-- ======================================================
-- ============================================
-- MODUŁ WYPOSAŻENIE - Tabela i polityki RLS
-- ============================================

CREATE TABLE IF NOT EXISTS equipment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    photo_url TEXT,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_value DECIMAL(10, 2) DEFAULT 0,
    responsible_person TEXT,
    ministry_key TEXT NOT NULL,
    condition TEXT DEFAULT 'dobry' CHECK (condition IN ('nowy', 'dobry', 'uszkodzony', 'do_naprawy')),
    purchase_date DATE,
    notes TEXT,
    created_by TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Indeksy dla wydajności
CREATE INDEX IF NOT EXISTS idx_equipment_ministry ON equipment(ministry_key);
CREATE INDEX IF NOT EXISTS idx_equipment_responsible ON equipment(responsible_person);
CREATE INDEX IF NOT EXISTS idx_equipment_name ON equipment(name);
CREATE INDEX IF NOT EXISTS idx_equipment_condition ON equipment(condition);
-- Trigger do automatycznej aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_equipment_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_update_equipment_updated_at ON equipment;
DROP TRIGGER IF EXISTS trigger_update_equipment_updated_at ON equipment;
CREATE TRIGGER trigger_update_equipment_updated_at
    BEFORE UPDATE ON equipment
    FOR EACH ROW
    EXECUTE FUNCTION update_equipment_updated_at();

-- ======================================================
-- ŹRÓDŁO: migrations/create_finance_balances.sql
-- ======================================================
-- Tabela do przechowywania stanów początkowych kont finansowych
CREATE TABLE IF NOT EXISTS finance_balances (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    year INTEGER NOT NULL,
    bank_pln DECIMAL(12, 2) DEFAULT 0,
    bank_currency DECIMAL(12, 2) DEFAULT 0,
    cash_pln DECIMAL(12, 2) DEFAULT 0,
    cash_currency DECIMAL(12, 2) DEFAULT 0,
    currency_type VARCHAR(3) DEFAULT 'EUR',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(year)
);
-- Indeks na rok dla szybkiego wyszukiwania
CREATE INDEX IF NOT EXISTS idx_finance_balances_year ON finance_balances(year);
-- Trigger do automatycznej aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_finance_balances_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_update_finance_balances_updated_at ON finance_balances;
DROP TRIGGER IF EXISTS trigger_update_finance_balances_updated_at ON finance_balances;
CREATE TRIGGER trigger_update_finance_balances_updated_at
    BEFORE UPDATE ON finance_balances
    FOR EACH ROW
    EXECUTE FUNCTION update_finance_balances_updated_at();

-- ======================================================
-- ŹRÓDŁO: migrations/create_prayer_requests_table.sql
-- ======================================================
-- ============================================
-- CENTRUM MODLITWY - Schemat bazy danych
-- ============================================

-- Tabela przechowująca prośby modlitewne
CREATE TABLE IF NOT EXISTS prayer_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID,
    user_email TEXT NOT NULL,
    user_name TEXT,
    requester_name TEXT,  -- Imię osoby, za którą się modlimy (kto zgłasza potrzebę)
    content TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('zdrowie', 'rodzina', 'finanse', 'duchowe', 'inne')),
    visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'leaders_only')),
    is_anonymous BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,  -- Czy intencja jest aktualna (true) czy nieaktualna (false)
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'answered', 'archived')),
    answered_testimony TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Jeśli tabela już istnieje, dodaj nowe kolumny
ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS requester_name TEXT;
ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
-- Indeksy dla optymalizacji zapytań
CREATE INDEX IF NOT EXISTS idx_prayer_requests_user_id ON prayer_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_prayer_requests_user_email ON prayer_requests(user_email);
CREATE INDEX IF NOT EXISTS idx_prayer_requests_status ON prayer_requests(status);
CREATE INDEX IF NOT EXISTS idx_prayer_requests_visibility ON prayer_requests(visibility);
CREATE INDEX IF NOT EXISTS idx_prayer_requests_category ON prayer_requests(category);
CREATE INDEX IF NOT EXISTS idx_prayer_requests_created_at ON prayer_requests(created_at DESC);
-- Trigger do automatycznej aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_prayer_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_update_prayer_requests_updated_at ON prayer_requests;
DROP TRIGGER IF EXISTS trigger_update_prayer_requests_updated_at ON prayer_requests;
CREATE TRIGGER trigger_update_prayer_requests_updated_at
    BEFORE UPDATE ON prayer_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_prayer_requests_updated_at();
-- ============================================
-- Tabela interakcji (kto się modli za prośbę)
-- ============================================

CREATE TABLE IF NOT EXISTS prayer_interactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    request_id UUID NOT NULL REFERENCES prayer_requests(id) ON DELETE CASCADE,
    user_id UUID,
    user_email TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Ograniczenie: jeden użytkownik może kliknąć "Modlę się" tylko raz dla danej prośby
    UNIQUE(request_id, user_email)
);
-- Indeksy dla interakcji
CREATE INDEX IF NOT EXISTS idx_prayer_interactions_request_id ON prayer_interactions(request_id);
CREATE INDEX IF NOT EXISTS idx_prayer_interactions_user_email ON prayer_interactions(user_email);
-- ============================================
-- Widok do pobierania prośb z liczbą modlitw
-- ============================================

CREATE OR REPLACE VIEW prayer_requests_with_counts AS
SELECT
    pr.*,
    COALESCE(pi.prayer_count, 0) as prayer_count,
    COALESCE(pi.praying_users, '[]'::jsonb) as praying_users
FROM prayer_requests pr
LEFT JOIN (
    SELECT
        request_id,
        COUNT(*) as prayer_count,
        jsonb_agg(user_email) as praying_users
    FROM prayer_interactions
    GROUP BY request_id
) pi ON pr.id = pi.request_id;
-- ============================================
-- Funkcja do sprawdzenia czy użytkownik już się modli
-- ============================================

CREATE OR REPLACE FUNCTION is_user_praying(p_request_id UUID, p_user_email TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM prayer_interactions
        WHERE request_id = p_request_id AND user_email = p_user_email
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ======================================================
-- ŹRÓDŁO: migrations/create_wall_posts_table.sql
-- ======================================================
-- Tabela dla postów na tablicy (Wall) - styl komunikatora
CREATE TABLE IF NOT EXISTS wall_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ministry TEXT NOT NULL,
  title TEXT DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  author_email TEXT NOT NULL,
  author_name TEXT,
  pinned BOOLEAN DEFAULT FALSE,
  likes TEXT[] DEFAULT '{}',
  attachments JSONB DEFAULT '[]',
  comments JSONB DEFAULT '[]',
  reply_to JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Dodaj kolumnę reply_to jeśli nie istnieje (dla istniejących tabel)
ALTER TABLE wall_posts ADD COLUMN IF NOT EXISTS reply_to JSONB DEFAULT NULL;
-- Indeks dla szybszego wyszukiwania po ministry
CREATE INDEX IF NOT EXISTS idx_wall_posts_ministry ON wall_posts(ministry);
-- Indeks dla sortowania po dacie
CREATE INDEX IF NOT EXISTS idx_wall_posts_created ON wall_posts(created_at);

-- ======================================================
-- ŹRÓDŁO: migrations/create_teaching_tables.sql
-- ======================================================
-- Tabela dla mówców
CREATE TABLE IF NOT EXISTS teaching_speakers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  bio TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Dodaj kolumnę email do istniejącej tabeli (dla migracji)
ALTER TABLE teaching_speakers ADD COLUMN IF NOT EXISTS email TEXT;
-- Tabela dla serii nauczania
CREATE TABLE IF NOT EXISTS teaching_series (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  scripture TEXT,
  start_date DATE,
  end_date DATE,
  graphics JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Dodaj kolumnę teaching do tabeli programs (jeśli nie istnieje)
-- Kolumna teaching przechowuje dane nauczania dla każdego programu nabożeństwa
-- Struktura: { speaker_id, series_id, title, scripture, main_point, notes }
ALTER TABLE programs ADD COLUMN IF NOT EXISTS teaching JSONB DEFAULT '{}';
-- Indeksy
CREATE INDEX IF NOT EXISTS idx_teaching_series_dates ON teaching_series(start_date, end_date);

-- ======================================================
-- ŹRÓDŁO: migrations/create_mlodziezowka_tables.sql
-- ======================================================
-- ============================================
-- MODUŁ MŁODZIEŻÓWKA - Schemat bazy danych
-- Wykonaj te polecenia w Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. Tabela członków młodzieżówki
-- ============================================
CREATE TABLE IF NOT EXISTS mlodziezowka_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    birth_date DATE,
    address TEXT,
    notes TEXT,
    photo_url TEXT,
    joined_at DATE DEFAULT CURRENT_DATE,
    is_active BOOLEAN DEFAULT true,
    created_by TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Indeksy
CREATE INDEX IF NOT EXISTS idx_mlodziezowka_members_active ON mlodziezowka_members(is_active);
CREATE INDEX IF NOT EXISTS idx_mlodziezowka_members_name ON mlodziezowka_members(full_name);
-- Trigger do automatycznej aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_mlodziezowka_members_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_update_mlodziezowka_members_updated_at ON mlodziezowka_members;
DROP TRIGGER IF EXISTS trigger_update_mlodziezowka_members_updated_at ON mlodziezowka_members;
CREATE TRIGGER trigger_update_mlodziezowka_members_updated_at
    BEFORE UPDATE ON mlodziezowka_members
    FOR EACH ROW
    EXECUTE FUNCTION update_mlodziezowka_members_updated_at();
-- ============================================
-- 2. Tabela liderów młodzieżówki
-- ============================================
CREATE TABLE IF NOT EXISTS mlodziezowka_leaders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role TEXT DEFAULT 'lider', -- lider, koordynator, opiekun
    photo_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_by TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Indeksy
CREATE INDEX IF NOT EXISTS idx_mlodziezowka_leaders_active ON mlodziezowka_leaders(is_active);
CREATE INDEX IF NOT EXISTS idx_mlodziezowka_leaders_email ON mlodziezowka_leaders(email);
-- Trigger do automatycznej aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_mlodziezowka_leaders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_update_mlodziezowka_leaders_updated_at ON mlodziezowka_leaders;
DROP TRIGGER IF EXISTS trigger_update_mlodziezowka_leaders_updated_at ON mlodziezowka_leaders;
CREATE TRIGGER trigger_update_mlodziezowka_leaders_updated_at
    BEFORE UPDATE ON mlodziezowka_leaders
    FOR EACH ROW
    EXECUTE FUNCTION update_mlodziezowka_leaders_updated_at();
-- ============================================
-- 3. Tabela zadań młodzieżówki (Kanban)
-- ============================================
CREATE TABLE IF NOT EXISTS mlodziezowka_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    due_date DATE,
    assigned_to TEXT[], -- Lista emaili przypisanych osób
    tags TEXT[], -- Tagi/kategorie
    created_by TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Indeksy
CREATE INDEX IF NOT EXISTS idx_mlodziezowka_tasks_status ON mlodziezowka_tasks(status);
CREATE INDEX IF NOT EXISTS idx_mlodziezowka_tasks_due_date ON mlodziezowka_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_mlodziezowka_tasks_priority ON mlodziezowka_tasks(priority);
-- Trigger do automatycznej aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_mlodziezowka_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_update_mlodziezowka_tasks_updated_at ON mlodziezowka_tasks;
DROP TRIGGER IF EXISTS trigger_update_mlodziezowka_tasks_updated_at ON mlodziezowka_tasks;
CREATE TRIGGER trigger_update_mlodziezowka_tasks_updated_at
    BEFORE UPDATE ON mlodziezowka_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_mlodziezowka_tasks_updated_at();
-- ============================================
-- 4. Tabela komentarzy do zadań
-- ============================================
CREATE TABLE IF NOT EXISTS mlodziezowka_task_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES mlodziezowka_tasks(id) ON DELETE CASCADE,
    author_email TEXT NOT NULL,
    author_name TEXT,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Indeksy
CREATE INDEX IF NOT EXISTS idx_mlodziezowka_task_comments_task ON mlodziezowka_task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_mlodziezowka_task_comments_author ON mlodziezowka_task_comments(author_email);
-- Trigger do automatycznej aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_mlodziezowka_task_comments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_update_mlodziezowka_task_comments_updated_at ON mlodziezowka_task_comments;
DROP TRIGGER IF EXISTS trigger_update_mlodziezowka_task_comments_updated_at ON mlodziezowka_task_comments;
CREATE TRIGGER trigger_update_mlodziezowka_task_comments_updated_at
    BEFORE UPDATE ON mlodziezowka_task_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_mlodziezowka_task_comments_updated_at();
-- ============================================
-- 5. Tabela wydarzeń młodzieżówki
-- ============================================
CREATE TABLE IF NOT EXISTS mlodziezowka_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    event_type TEXT DEFAULT 'spotkanie', -- spotkanie, wyjazd, integracja, inne
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE,
    location TEXT,
    is_recurring BOOLEAN DEFAULT false,
    recurrence_pattern TEXT, -- weekly, monthly, etc.
    max_participants INTEGER,
    registration_required BOOLEAN DEFAULT false,
    image_url TEXT,
    attachments JSONB DEFAULT '[]', -- [{url, name, type}]
    created_by TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Indeksy
CREATE INDEX IF NOT EXISTS idx_mlodziezowka_events_start ON mlodziezowka_events(start_date);
CREATE INDEX IF NOT EXISTS idx_mlodziezowka_events_type ON mlodziezowka_events(event_type);
-- Trigger do automatycznej aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_mlodziezowka_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_update_mlodziezowka_events_updated_at ON mlodziezowka_events;
DROP TRIGGER IF EXISTS trigger_update_mlodziezowka_events_updated_at ON mlodziezowka_events;
CREATE TRIGGER trigger_update_mlodziezowka_events_updated_at
    BEFORE UPDATE ON mlodziezowka_events
    FOR EACH ROW
    EXECUTE FUNCTION update_mlodziezowka_events_updated_at();
-- ============================================
-- 6. Tabela uczestników wydarzeń (opcjonalna)
-- ============================================
CREATE TABLE IF NOT EXISTS mlodziezowka_event_participants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID NOT NULL REFERENCES mlodziezowka_events(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    user_name TEXT,
    status TEXT DEFAULT 'registered' CHECK (status IN ('registered', 'confirmed', 'cancelled')),
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(event_id, user_email)
);
-- Indeksy
CREATE INDEX IF NOT EXISTS idx_mlodziezowka_event_participants_event ON mlodziezowka_event_participants(event_id);
CREATE INDEX IF NOT EXISTS idx_mlodziezowka_event_participants_user ON mlodziezowka_event_participants(user_email);
-- ============================================
-- 15. Dodanie uprawnienia do tabeli permissions (opcjonalne)
-- ============================================
-- Możesz ręcznie dodać wpisy do tabeli permissions w Supabase:
-- INSERT INTO permissions (role, resource, can_read, can_create, can_update, can_delete)
-- VALUES
--   ('superadmin', 'module:mlodziezowka', true, true, true, true),
--   ('rada_starszych', 'module:mlodziezowka', true, true, true, true),
--   ('koordynator', 'module:mlodziezowka', true, true, true, true),
--   ('lider', 'module:mlodziezowka', true, true, true, false),
--   ('sluzacy', 'module:mlodziezowka', true, false, false, false);

-- ============================================
-- KONIEC MIGRACJI
-- ============================================;

-- ======================================================
-- ŹRÓDŁO: migrations/create_program_templates.sql
-- ======================================================
-- Tabela szablonów programów nabożeństw
CREATE TABLE IF NOT EXISTS program_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    schedule JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ======================================================
-- ŹRÓDŁO: migrations/create_program_song_suggestions.sql
-- ======================================================
-- Tabela sugerowanych pieśni dla programów (z modułu Bazy Pieśni → "Do programu" / "Programy")
-- Frontend już z niej czyta (ProgramDetail.jsx → fetchSongSuggestions). Brakowało UI do zapisu,
-- który teraz dodajemy w WorshipModule. Jeśli tabela już istnieje na środowisku, wystarczy że
-- 'CREATE TABLE IF NOT EXISTS' nie zrobi nic.

CREATE TABLE IF NOT EXISTS public.program_song_suggestions (
  id              bigint generated by default as identity primary key,
  program_id      bigint not null references public.programs(id) on delete cascade,
  song_id         bigint not null references public.songs(id) on delete cascade,
  song_key        text,
  note            text,
  sort_order      integer not null default 0,
  created_by_email text,
  created_at      timestamptz not null default now(),
  unique (program_id, song_id)
);
create index if not exists idx_psc_program_id on public.program_song_suggestions(program_id);
create index if not exists idx_psc_song_id    on public.program_song_suggestions(song_id);

-- ======================================================
-- ŹRÓDŁO: migrations/create_dashboard_tables.sql
-- ======================================================
-- ============================================
-- MODUŁ PULPITU - Schemat bazy danych
-- ============================================

-- Tabela przechowująca układy pulpitu użytkowników
CREATE TABLE IF NOT EXISTS user_dashboard_layouts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_email TEXT NOT NULL UNIQUE,
    layout JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Indeksy
CREATE INDEX IF NOT EXISTS idx_user_dashboard_layouts_email ON user_dashboard_layouts(user_email);
-- Trigger do automatycznej aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_dashboard_layouts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_update_dashboard_layouts_updated_at ON user_dashboard_layouts;
DROP TRIGGER IF EXISTS trigger_update_dashboard_layouts_updated_at ON user_dashboard_layouts;
CREATE TRIGGER trigger_update_dashboard_layouts_updated_at
    BEFORE UPDATE ON user_dashboard_layouts
    FOR EACH ROW
    EXECUTE FUNCTION update_dashboard_layouts_updated_at();
-- ============================================
-- Tabela nieobecności użytkowników
-- ============================================

CREATE TABLE IF NOT EXISTS user_absences (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_email TEXT NOT NULL,
    user_name TEXT,
    absence_date DATE NOT NULL,
    program_id BIGINT REFERENCES programs(id) ON DELETE SET NULL,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Indeksy dla nieobecności
CREATE INDEX IF NOT EXISTS idx_user_absences_email ON user_absences(user_email);
CREATE INDEX IF NOT EXISTS idx_user_absences_date ON user_absences(absence_date);
CREATE INDEX IF NOT EXISTS idx_user_absences_program ON user_absences(program_id);
CREATE INDEX IF NOT EXISTS idx_user_absences_status ON user_absences(status);
-- Trigger do automatycznej aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_user_absences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_update_user_absences_updated_at ON user_absences;
DROP TRIGGER IF EXISTS trigger_update_user_absences_updated_at ON user_absences;
CREATE TRIGGER trigger_update_user_absences_updated_at
    BEFORE UPDATE ON user_absences
    FOR EACH ROW
    EXECUTE FUNCTION update_user_absences_updated_at();
-- ============================================
-- Tabela osobistych zadań użytkowników
-- ============================================

CREATE TABLE IF NOT EXISTS user_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_email TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    due_date DATE,
    status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
    is_private BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Indeksy dla user_tasks
CREATE INDEX IF NOT EXISTS idx_user_tasks_email ON user_tasks(user_email);
CREATE INDEX IF NOT EXISTS idx_user_tasks_status ON user_tasks(status);
CREATE INDEX IF NOT EXISTS idx_user_tasks_due_date ON user_tasks(due_date);
-- Trigger do automatycznej aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_user_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_update_user_tasks_updated_at ON user_tasks;
DROP TRIGGER IF EXISTS trigger_update_user_tasks_updated_at ON user_tasks;
CREATE TRIGGER trigger_update_user_tasks_updated_at
    BEFORE UPDATE ON user_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_user_tasks_updated_at();

-- ======================================================
-- ŹRÓDŁO: migrations/create_mail_tables.sql
-- ======================================================
-- ============================================
-- MODUL MAIL - Tabele i polityki RLS
-- Wykonaj te polecenia w Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. Tabela kont email użytkowników
-- ============================================
CREATE TABLE IF NOT EXISTS mail_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL REFERENCES app_users(email) ON DELETE CASCADE,
  account_type TEXT NOT NULL DEFAULT 'internal', -- 'internal' | 'external'

  -- Konfiguracja zewnętrznego konta (szyfrowane przez Edge Function)
  external_email TEXT,
  imap_host TEXT,
  imap_port INT DEFAULT 993,
  imap_secure BOOLEAN DEFAULT true,
  smtp_host TEXT,
  smtp_port INT DEFAULT 465,
  smtp_secure BOOLEAN DEFAULT true,
  encrypted_password TEXT, -- Hasło zaszyfrowane AES-256-GCM

  -- Ustawienia
  signature TEXT, -- Podpis HTML
  default_account BOOLEAN DEFAULT false,
  sync_enabled BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  sync_error TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_email, external_email)
);
-- Trigger do aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_mail_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_update_mail_accounts_updated_at ON mail_accounts;
DROP TRIGGER IF EXISTS trigger_update_mail_accounts_updated_at ON mail_accounts;
CREATE TRIGGER trigger_update_mail_accounts_updated_at
    BEFORE UPDATE ON mail_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_mail_accounts_updated_at();
-- ============================================
-- 2. Tabela folderów email
-- ============================================
CREATE TABLE IF NOT EXISTS mail_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES mail_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'custom', -- 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive' | 'custom'
  color TEXT, -- Kolor etykiety (np. #ff5733)
  icon TEXT, -- Ikona z lucide-react
  parent_id UUID REFERENCES mail_folders(id) ON DELETE CASCADE,
  position INT DEFAULT 0,
  unread_count INT DEFAULT 0,
  total_count INT DEFAULT 0,

  -- Dla folderów zewnętrznych kont - mapowanie na folder IMAP
  imap_path TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(account_id, name, parent_id)
);
CREATE INDEX IF NOT EXISTS idx_mail_folders_account ON mail_folders(account_id);
CREATE INDEX IF NOT EXISTS idx_mail_folders_type ON mail_folders(type);
-- ============================================
-- 3. Tabela wiadomości email
-- ============================================
CREATE TABLE IF NOT EXISTS mail_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES mail_accounts(id) ON DELETE CASCADE,
  folder_id UUID NOT NULL REFERENCES mail_folders(id) ON DELETE CASCADE,

  -- Metadane wiadomości
  message_id TEXT, -- Unikalny ID wiadomości (dla IMAP)
  in_reply_to TEXT, -- ID wiadomości na którą odpowiadamy
  thread_id UUID, -- ID wątku (dla grupowania konwersacji)

  -- Nadawca i odbiorcy
  from_email TEXT NOT NULL,
  from_name TEXT,
  to_emails TEXT[] NOT NULL DEFAULT '{}',
  to_names TEXT[] DEFAULT '{}',
  cc_emails TEXT[] DEFAULT '{}',
  cc_names TEXT[] DEFAULT '{}',
  bcc_emails TEXT[] DEFAULT '{}',

  -- Treść
  subject TEXT NOT NULL DEFAULT '(brak tematu)',
  body_text TEXT,
  body_html TEXT,
  snippet TEXT, -- Krótki fragment do podglądu (max 200 znaków)

  -- Flagi
  is_read BOOLEAN DEFAULT false,
  is_starred BOOLEAN DEFAULT false,
  is_important BOOLEAN DEFAULT false,
  is_draft BOOLEAN DEFAULT false,

  -- Daty
  sent_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ, -- Soft delete

  -- Dla zewnętrznych emaili
  external_uid TEXT, -- UID z serwera IMAP
  raw_headers JSONB -- Oryginalne nagłówki
);
-- Indeksy dla wydajności
CREATE INDEX IF NOT EXISTS idx_mail_messages_account ON mail_messages(account_id);
CREATE INDEX IF NOT EXISTS idx_mail_messages_folder ON mail_messages(folder_id);
CREATE INDEX IF NOT EXISTS idx_mail_messages_thread ON mail_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_mail_messages_from ON mail_messages(from_email);
CREATE INDEX IF NOT EXISTS idx_mail_messages_received ON mail_messages(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_mail_messages_is_read ON mail_messages(is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_mail_messages_deleted ON mail_messages(deleted_at) WHERE deleted_at IS NULL;
-- Fulltext search index (używamy 'simple' dla uniwersalności - 'polish' wymaga dodatkowej instalacji)
CREATE INDEX IF NOT EXISTS idx_mail_messages_search ON mail_messages
  USING gin(to_tsvector('simple', coalesce(subject, '') || ' ' || coalesce(body_text, '')));
-- Trigger do aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_mail_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_update_mail_messages_updated_at ON mail_messages;
DROP TRIGGER IF EXISTS trigger_update_mail_messages_updated_at ON mail_messages;
CREATE TRIGGER trigger_update_mail_messages_updated_at
    BEFORE UPDATE ON mail_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_mail_messages_updated_at();
-- ============================================
-- 4. Tabela załączników
-- ============================================
CREATE TABLE IF NOT EXISTS mail_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES mail_messages(id) ON DELETE CASCADE,

  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  storage_path TEXT, -- Ścieżka w Supabase Storage

  -- Dla inline attachments (np. obrazy w HTML)
  content_id TEXT, -- cid dla inline
  is_inline BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mail_attachments_message ON mail_attachments(message_id);
-- ============================================
-- 5. Tabela etykiet (tagów)
-- ============================================
CREATE TABLE IF NOT EXISTS mail_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES mail_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6b7280',

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(account_id, name)
);
CREATE INDEX IF NOT EXISTS idx_mail_labels_account ON mail_labels(account_id);
-- ============================================
-- 6. Tabela połączeń wiadomości z etykietami (M:N)
-- ============================================
CREATE TABLE IF NOT EXISTS mail_message_labels (
  message_id UUID NOT NULL REFERENCES mail_messages(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES mail_labels(id) ON DELETE CASCADE,

  PRIMARY KEY (message_id, label_id)
);
-- ============================================
-- 7. Tabela szablonów wiadomości
-- ============================================
CREATE TABLE IF NOT EXISTS mail_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL REFERENCES app_users(email) ON DELETE CASCADE,

  name TEXT NOT NULL,
  subject TEXT,
  body_html TEXT NOT NULL,

  is_shared BOOLEAN DEFAULT false, -- Czy dostępny dla wszystkich użytkowników

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mail_templates_user ON mail_templates(user_email);
-- ============================================
-- 8. Tabela reguł filtrowania
-- ============================================
CREATE TABLE IF NOT EXISTS mail_filter_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES mail_accounts(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  priority INT DEFAULT 0,

  -- Warunki (logika AND)
  conditions JSONB NOT NULL DEFAULT '[]',
  -- Przykład: [{"field": "from", "operator": "contains", "value": "newsletter"}]

  -- Akcje
  actions JSONB NOT NULL DEFAULT '[]',
  -- Przykład: [{"type": "move_to_folder", "folder_id": "uuid"}, {"type": "mark_as_read"}]

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mail_filter_rules_account ON mail_filter_rules(account_id);
-- ============================================
-- 20. Dodanie modułu Mail do app_modules
-- ============================================
INSERT INTO app_modules (key, label, path, icon, resource_key, is_enabled, display_order)
VALUES ('mail', 'Poczta', '/mail', 'MailCheck', 'module:mail', true, 16)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  path = EXCLUDED.path,
  icon = EXCLUDED.icon,
  resource_key = EXCLUDED.resource_key;
-- ============================================
-- 21. Funkcja do tworzenia domyślnych folderów
-- ============================================
CREATE OR REPLACE FUNCTION create_default_mail_folders()
RETURNS TRIGGER AS $$
BEGIN
    -- Tworzenie domyślnych folderów dla nowego konta
    INSERT INTO mail_folders (account_id, name, type, icon, position)
    VALUES
        (NEW.id, 'Odebrane', 'inbox', 'Inbox', 1),
        (NEW.id, 'Wysłane', 'sent', 'Send', 2),
        (NEW.id, 'Szkice', 'drafts', 'FileEdit', 3),
        (NEW.id, 'Spam', 'spam', 'AlertTriangle', 4),
        (NEW.id, 'Kosz', 'trash', 'Trash2', 5),
        (NEW.id, 'Archiwum', 'archive', 'Archive', 6);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_create_default_mail_folders ON mail_accounts;
DROP TRIGGER IF EXISTS trigger_create_default_mail_folders ON mail_accounts;
CREATE TRIGGER trigger_create_default_mail_folders
    AFTER INSERT ON mail_accounts
    FOR EACH ROW
    EXECUTE FUNCTION create_default_mail_folders();

-- ======================================================
-- ŹRÓDŁO: migrations/create_mailing_tables.sql
-- ======================================================
-- ============================================
-- MAILING MODULE TABLES
-- ============================================

-- Tabela szablonów email
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  json_design JSONB, -- dla edytora drag & drop (opcjonalne)
  thumbnail_url TEXT,
  category TEXT DEFAULT 'general', -- 'newsletter', 'event', 'announcement', 'general'
  is_system BOOLEAN DEFAULT false, -- szablony systemowe (nieusuwalne)
  created_by TEXT REFERENCES app_users(email),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Tabela kampanii email
CREATE TABLE IF NOT EXISTS email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'draft', -- 'draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled'
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_by TEXT REFERENCES app_users(email),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Statystyki kampanii
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  opened_count INTEGER DEFAULT 0,
  clicked_count INTEGER DEFAULT 0,
  bounced_count INTEGER DEFAULT 0,
  unsubscribed_count INTEGER DEFAULT 0
);
-- Tabela odbiorców kampanii
CREATE TABLE IF NOT EXISTS email_campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES email_campaigns(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'unsubscribed'
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(campaign_id, email)
);
-- Tabela segmentów odbiorców (jakie grupy/służby zostały wybrane)
CREATE TABLE IF NOT EXISTS email_recipient_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES email_campaigns(id) ON DELETE CASCADE,
  segment_type TEXT NOT NULL, -- 'all', 'ministry', 'home_group', 'role', 'custom'
  segment_id UUID, -- id grupy/służby (null dla 'all' i 'custom')
  segment_name TEXT, -- nazwa dla wyświetlania
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Tabela osób wypisanych z newslettera
CREATE TABLE IF NOT EXISTS email_unsubscribes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  reason TEXT,
  campaign_id UUID REFERENCES email_campaigns(id) ON DELETE SET NULL, -- z jakiej kampanii się wypisał
  unsubscribed_at TIMESTAMPTZ DEFAULT NOW()
);
-- ============================================
-- INDEKSY
-- ============================================

CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_created_by ON email_campaigns(created_by);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_scheduled_at ON email_campaigns(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_campaign ON email_campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_status ON email_campaign_recipients(status);
CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_email ON email_campaign_recipients(email);
CREATE INDEX IF NOT EXISTS idx_email_templates_category ON email_templates(category);
CREATE INDEX IF NOT EXISTS idx_email_recipient_segments_campaign ON email_recipient_segments(campaign_id);
-- ============================================
-- FUNKCJE POMOCNICZE
-- ============================================

-- Funkcja do aktualizacji statystyk kampanii
CREATE OR REPLACE FUNCTION update_campaign_stats(p_campaign_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE email_campaigns
  SET
    total_recipients = (SELECT COUNT(*) FROM email_campaign_recipients WHERE campaign_id = p_campaign_id),
    sent_count = (SELECT COUNT(*) FROM email_campaign_recipients WHERE campaign_id = p_campaign_id AND status IN ('sent', 'delivered', 'opened', 'clicked')),
    delivered_count = (SELECT COUNT(*) FROM email_campaign_recipients WHERE campaign_id = p_campaign_id AND status IN ('delivered', 'opened', 'clicked')),
    opened_count = (SELECT COUNT(*) FROM email_campaign_recipients WHERE campaign_id = p_campaign_id AND status IN ('opened', 'clicked')),
    clicked_count = (SELECT COUNT(*) FROM email_campaign_recipients WHERE campaign_id = p_campaign_id AND status = 'clicked'),
    bounced_count = (SELECT COUNT(*) FROM email_campaign_recipients WHERE campaign_id = p_campaign_id AND status = 'bounced'),
    unsubscribed_count = (SELECT COUNT(*) FROM email_campaign_recipients WHERE campaign_id = p_campaign_id AND status = 'unsubscribed'),
    updated_at = NOW()
  WHERE id = p_campaign_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Trigger do automatycznej aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_email_templates_updated_at') THEN
    CREATE TRIGGER update_email_templates_updated_at
      BEFORE UPDATE ON email_templates
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_email_campaigns_updated_at') THEN
    CREATE TRIGGER update_email_campaigns_updated_at
      BEFORE UPDATE ON email_campaigns
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
-- ============================================
-- DOMYŚLNE SZABLONY SYSTEMOWE
-- ============================================

INSERT INTO email_templates (name, subject, html_content, category, is_system, created_by)
VALUES
(
  'Pusty szablon',
  'Temat wiadomości',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif;
line-height: 1.6;
color: #333;
margin: 0;
padding: 0;
}
    .container { max-width: 600px;
margin: 0 auto;
padding: 20px;
}
    .header { text-align: center;
padding: 20px 0;
}
    .content { padding: 20px 0;
}
    .footer { text-align: center;
padding: 20px 0;
font-size: 12px;
color: #666;
border-top: 1px solid #eee;
}
    .button { display: inline-block;
padding: 12px 24px;
background: linear-gradient(135deg, #c7ab71, #a08847);
color: white;
text-decoration: none;
border-radius: 8px;
}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Nagłówek</h1>
    </div>
    <div class="content">
      <p>Drogi {{imie}},</p>
      <p>Treść wiadomości...</p>
    </div>
    <div class="footer">
      <p>Z błogosławieństwem,<br>Twój Kościół</p>
      <p><a href="{{unsubscribe_url}}">Wypisz się z newslettera</a></p>
    </div>
  </div>
</body>
</html>',
  'general',
  true,
  NULL
),
(
  'Newsletter',
  'Newsletter - {{data}}',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif;
line-height: 1.6;
color: #333;
margin: 0;
padding: 0;
background: #f5f5f5;
}
    .container { max-width: 600px;
margin: 0 auto;
background: white;
}
    .header { background: linear-gradient(135deg, #c7ab71, #a08847);
color: white;
text-align: center;
padding: 30px 20px;
}
    .header h1 { margin: 0;
font-size: 28px;
}
    .content { padding: 30px 20px;
}
    .section { margin-bottom: 25px;
}
    .section h2 { color: #c7ab71;
font-size: 20px;
margin-bottom: 10px;
}
    .footer { text-align: center;
padding: 20px;
font-size: 12px;
color: #666;
background: #f9f9f9;
}
    .button { display: inline-block;
padding: 12px 24px;
background: linear-gradient(135deg, #c7ab71, #a08847);
color: white;
text-decoration: none;
border-radius: 8px;
margin: 10px 0;
}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Newsletter Kościoła</h1>
      <p>{{data}}</p>
    </div>
    <div class="content">
      <p>Drogi {{imie}},</p>

      <div class="section">
        <h2>Nadchodzące wydarzenia</h2>
        <p>Informacje o wydarzeniach...</p>
      </div>

      <div class="section">
        <h2>Ogłoszenia</h2>
        <p>Ważne ogłoszenia...</p>
      </div>

      <div class="section">
        <h2>Słowo na dziś</h2>
        <p><em>"Cytat biblijny..."</em></p>
      </div>

      <p style="text-align: center;
">
        <a href="#" class="button">Odwiedź naszą stronę</a>
      </p>
    </div>
    <div class="footer">
      <p>Z błogosławieństwem,<br>Twój Kościół</p>
      <p><a href="{{unsubscribe_url}}">Wypisz się z newslettera</a></p>
    </div>
  </div>
</body>
</html>',
  'newsletter',
  true,
  NULL
),
(
  'Zaproszenie na wydarzenie',
  'Zaproszenie: {{event_name}}',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif;
line-height: 1.6;
color: #333;
margin: 0;
padding: 0;
background: #f5f5f5;
}
    .container { max-width: 600px;
margin: 0 auto;
background: white;
}
    .header { background: linear-gradient(135deg, #c7ab71, #c7ab71);
color: white;
text-align: center;
padding: 40px 20px;
}
    .header h1 { margin: 0;
font-size: 32px;
}
    .event-details { background: #f9f9f9;
padding: 25px;
margin: 20px;
border-radius: 12px;
}
    .event-details p { margin: 8px 0;
}
    .event-details strong { color: #c7ab71;
}
    .content { padding: 20px 30px;
}
    .footer { text-align: center;
padding: 20px;
font-size: 12px;
color: #666;
}
    .button { display: inline-block;
padding: 14px 28px;
background: linear-gradient(135deg, #c7ab71, #c7ab71);
color: white;
text-decoration: none;
border-radius: 8px;
font-size: 16px;
font-weight: bold;
}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Zapraszamy!</h1>
      <p style="font-size: 18px;
margin-top: 10px;
">{{event_name}}</p>
    </div>
    <div class="content">
      <p>Drogi {{imie}},</p>
      <p>Serdecznie zapraszamy Cię na wyjątkowe wydarzenie w naszym kościele!</p>

      <div class="event-details">
        <p><strong>Data:</strong> [Data wydarzenia]</p>
        <p><strong>Godzina:</strong> [Godzina]</p>
        <p><strong>Miejsce:</strong> [Adres]</p>
      </div>

      <p>Opis wydarzenia...</p>

      <p style="text-align: center;
margin: 30px 0;
">
        <a href="#" class="button">Zapisz się teraz</a>
      </p>

      <p>Do zobaczenia!</p>
    </div>
    <div class="footer">
      <p>Z błogosławieństwem,<br>Twój Kościół</p>
      <p><a href="{{unsubscribe_url}}">Wypisz się z newslettera</a></p>
    </div>
  </div>
</body>
</html>',
  'event',
  true,
  NULL
),
(
  'Ogłoszenie',
  'Ważne ogłoszenie',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif;
line-height: 1.6;
color: #333;
margin: 0;
padding: 0;
}
    .container { max-width: 600px;
margin: 0 auto;
padding: 20px;
}
    .alert-box { background: linear-gradient(135deg, #fef3c7, #fde68a);
border-left: 4px solid #f59e0b;
padding: 20px;
margin: 20px 0;
border-radius: 0 8px 8px 0;
}
    .content { padding: 20px 0;
}
    .footer { text-align: center;
padding: 20px 0;
font-size: 12px;
color: #666;
border-top: 1px solid #eee;
}
  </style>
</head>
<body>
  <div class="container">
    <h1>Ważne ogłoszenie</h1>

    <div class="content">
      <p>Drogi {{imie}},</p>

      <div class="alert-box">
        <p><strong>Treść ogłoszenia...</strong></p>
      </div>

      <p>Dodatkowe informacje...</p>
    </div>

    <div class="footer">
      <p>Z błogosławieństwem,<br>Twój Kościół</p>
      <p><a href="{{unsubscribe_url}}">Wypisz się z newslettera</a></p>
    </div>
  </div>
</body>
</html>',
  'announcement',
  true,
  NULL
)
ON CONFLICT DO NOTHING;
-- ============================================
-- DODANIE MODUŁU MAILING DO APP_MODULES
-- ============================================

INSERT INTO app_modules (key, label, path, icon, resource_key, display_order, is_enabled)
VALUES ('mailing', 'Mailing', '/mailing', 'Mail', 'module:mailing', 15, true)
ON CONFLICT (key) DO NOTHING;
-- ============================================
-- DODANIE UPRAWNIEŃ DLA MODUŁU MAILING
-- ============================================

-- Superadmin i admin mają pełne uprawnienia
INSERT INTO app_permissions (role, resource, can_read, can_write)
VALUES
  ('superadmin', 'module:mailing', true, true),
  ('admin', 'module:mailing', true, true),
  ('rada_starszych', 'module:mailing', true, true)
ON CONFLICT (role, resource) DO UPDATE SET
  can_read = EXCLUDED.can_read,
  can_write = EXCLUDED.can_write;

-- ======================================================
-- ŹRÓDŁO: migrations/create_messenger_tables.sql
-- ======================================================
-- ============================================
-- Tabele dla modułu Komunikator (Messenger)
-- Wykonaj te polecenia w Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. Tabela conversations
-- ============================================
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('direct', 'group', 'ministry')),
    name TEXT,                        -- NULL dla direct, nazwa dla group/ministry
    ministry_key TEXT,                -- Klucz służby dla type='ministry'
    avatar_url TEXT,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Indeks dla szybkiego wyszukiwania po typie
CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(type);
CREATE INDEX IF NOT EXISTS idx_conversations_ministry ON conversations(ministry_key) WHERE ministry_key IS NOT NULL;
-- ============================================
-- 2. Tabela conversation_participants
-- ============================================
CREATE TABLE IF NOT EXISTS conversation_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    role TEXT DEFAULT 'member' CHECK (role IN ('member', 'admin')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    last_read_at TIMESTAMPTZ,
    muted BOOLEAN DEFAULT false,
    UNIQUE(conversation_id, user_email)
);
-- Indeksy dla wydajności
CREATE INDEX IF NOT EXISTS idx_participants_conversation ON conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_participants_user ON conversation_participants(user_email);
-- ============================================
-- 3. Tabela messages
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    sender_email TEXT NOT NULL,
    content TEXT NOT NULL,
    attachments JSONB DEFAULT '[]',   -- [{url, name, type, size}]
    reply_to_id UUID REFERENCES messages(id),
    edited_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Indeksy dla wydajności
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_email);
-- ============================================
-- 4. Funkcja do aktualizacji updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_conversation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE conversations
    SET updated_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- Trigger aktualizujący updated_at przy nowej wiadomości
DROP TRIGGER IF EXISTS trigger_update_conversation_on_message ON messages;
DROP TRIGGER IF EXISTS trigger_update_conversation_on_message ON messages;
CREATE TRIGGER trigger_update_conversation_on_message
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_updated_at();
-- ============================================
-- 10. Funkcja pomocnicza do znajdowania istniejącej konwersacji direct
-- ============================================
CREATE OR REPLACE FUNCTION find_direct_conversation(user1_email TEXT, user2_email TEXT)
RETURNS UUID AS $$
DECLARE
    conv_id UUID;
BEGIN
    SELECT c.id INTO conv_id
    FROM conversations c
    WHERE c.type = 'direct'
    AND EXISTS (
        SELECT 1 FROM conversation_participants cp1
        WHERE cp1.conversation_id = c.id AND cp1.user_email = user1_email
    )
    AND EXISTS (
        SELECT 1 FROM conversation_participants cp2
        WHERE cp2.conversation_id = c.id AND cp2.user_email = user2_email
    )
    LIMIT 1;

    RETURN conv_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ======================================================
-- ŹRÓDŁO: migrations/add_typing_and_read_receipts.sql
-- ======================================================
-- ============================================
-- Tabele dla statusu pisania i potwierdzeń przeczytania
-- ============================================

-- ============================================
-- 1. Tabela typing_status (kto aktualnie pisze)
-- ============================================
CREATE TABLE IF NOT EXISTS typing_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(conversation_id, user_email)
);
-- Indeksy
CREATE INDEX IF NOT EXISTS idx_typing_status_conversation ON typing_status(conversation_id);
CREATE INDEX IF NOT EXISTS idx_typing_status_started ON typing_status(started_at);
-- ============================================
-- 2. Tabela message_read_receipts (potwierdzenia przeczytania)
-- ============================================
CREATE TABLE IF NOT EXISTS message_read_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    read_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(message_id, user_email)
);
-- Indeksy
CREATE INDEX IF NOT EXISTS idx_read_receipts_message ON message_read_receipts(message_id);
CREATE INDEX IF NOT EXISTS idx_read_receipts_user ON message_read_receipts(user_email);
-- ============================================
-- 3. Funkcja do automatycznego czyszczenia starych statusów pisania
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_old_typing_status()
RETURNS void AS $$
BEGIN
    -- Usuń statusy pisania starsze niż 10 sekund (użytkownik przestał pisać)
    DELETE FROM typing_status
    WHERE started_at < NOW() - INTERVAL '10 seconds';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ======================================================
-- ŹRÓDŁO: migrations/add_presence_and_notifications.sql
-- ======================================================
-- ============================================
-- Tabele dla statusu użytkowników i powiadomień
-- ============================================

-- ============================================
-- 1. Tabela user_presence (status online/away/offline)
-- ============================================
CREATE TABLE IF NOT EXISTS user_presence (
    user_email TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'away', 'offline')),
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Indeks dla szybkiego wyszukiwania
CREATE INDEX IF NOT EXISTS idx_user_presence_status ON user_presence(status);
CREATE INDEX IF NOT EXISTS idx_user_presence_last_seen ON user_presence(last_seen);
-- ============================================
-- 2. Tabela notifications (powiadomienia)
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('message', 'mention', 'task', 'event', 'system')),
    title TEXT NOT NULL,
    body TEXT,
    link TEXT,                              -- URL do przekierowania
    data JSONB DEFAULT '{}',                -- Dodatkowe dane (np. conversation_id, sender)
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Indeksy
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_email, read) WHERE read = false;
-- ============================================
-- 3. Funkcja do automatycznego tworzenia powiadomienia o nowej wiadomości
-- ============================================
CREATE OR REPLACE FUNCTION create_message_notification()
RETURNS TRIGGER AS $$
DECLARE
    participant RECORD;
    conv_name TEXT;
    sender_name TEXT;
BEGIN
    -- Pobierz nazwę konwersacji
    SELECT name INTO conv_name FROM conversations WHERE id = NEW.conversation_id;

    -- Pobierz imię nadawcy
    SELECT full_name INTO sender_name FROM app_users WHERE email = NEW.sender_email;
    IF sender_name IS NULL THEN
        sender_name := NEW.sender_email;
    END IF;

    -- Utwórz powiadomienia dla wszystkich uczestników oprócz nadawcy
    FOR participant IN
        SELECT user_email FROM conversation_participants
        WHERE conversation_id = NEW.conversation_id
        AND user_email != NEW.sender_email
    LOOP
        INSERT INTO notifications (user_email, type, title, body, link, data)
        VALUES (
            participant.user_email,
            'message',
            COALESCE(conv_name, sender_name),
            LEFT(NEW.content, 100),
            '/komunikator?conversation=' || NEW.conversation_id::text,
            jsonb_build_object(
                'conversation_id', NEW.conversation_id,
                'message_id', NEW.id,
                'sender_email', NEW.sender_email,
                'sender_name', sender_name
            )
        );
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Trigger dla nowych wiadomości
DROP TRIGGER IF EXISTS trigger_message_notification ON messages;
DROP TRIGGER IF EXISTS trigger_message_notification ON messages;
CREATE TRIGGER trigger_message_notification
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION create_message_notification();
-- ============================================
-- 4. Funkcja do czyszczenia starych powiadomień (opcjonalna)
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS void AS $$
BEGIN
    -- Usuń przeczytane powiadomienia starsze niż 30 dni
    DELETE FROM notifications
    WHERE read = true AND created_at < NOW() - INTERVAL '30 days';

    -- Usuń nieprzeczytane powiadomienia starsze niż 90 dni
    DELETE FROM notifications
    WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- ============================================
-- 5. Funkcja do ustawiania użytkowników jako offline po czasie nieaktywności
-- ============================================
CREATE OR REPLACE FUNCTION set_users_offline()
RETURNS void AS $$
BEGIN
    -- Ustaw jako offline użytkowników nieaktywnych przez 5 minut
    UPDATE user_presence
    SET status = 'offline', updated_at = NOW()
    WHERE status != 'offline'
    AND last_seen < NOW() - INTERVAL '5 minutes';

    -- Ustaw jako away użytkowników nieaktywnych przez 2 minuty
    UPDATE user_presence
    SET status = 'away', updated_at = NOW()
    WHERE status = 'online'
    AND last_seen < NOW() - INTERVAL '2 minutes';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ======================================================
-- ŹRÓDŁO: migrations/add_time_fields_to_tasks.sql
-- ======================================================
-- Dodaj pola due_time i end_time do tabeli tasks
-- Te pola przechowują godzinę rozpoczęcia i zakończenia wydarzenia

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_time VARCHAR(5);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS end_time VARCHAR(5);
-- Komentarze do kolumn
COMMENT ON COLUMN tasks.due_time IS 'Godzina rozpoczęcia w formacie HH:MM';
COMMENT ON COLUMN tasks.end_time IS 'Godzina zakończenia w formacie HH:MM';

-- ======================================================
-- ŹRÓDŁO: migrations/add_json_design_to_campaigns.sql
-- ======================================================
-- Dodanie kolumny json_design do tabeli email_campaigns
-- Pozwala na zapisanie bloków JSON z edytora drag & drop

ALTER TABLE email_campaigns
ADD COLUMN IF NOT EXISTS json_design JSONB;
COMMENT ON COLUMN email_campaigns.json_design IS 'JSON design blocks from drag & drop editor';

-- ======================================================
-- ŹRÓDŁO: migrations/add_komunikator_permissions.sql
-- ======================================================
-- ============================================
-- Dodanie uprawnień i ustawień dla modułu Komunikator
-- Wykonaj te polecenia w Supabase SQL Editor
-- ============================================

-- 1. Dodaj ustawienie modułu (włączony/wyłączony)
INSERT INTO app_settings (key, value, description)
VALUES ('module_komunikator_enabled', 'true', 'Moduł Komunikator')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description;
-- 2. Dodaj domyślne uprawnienia dla ról
-- Superadmin ma wszystko
INSERT INTO app_permissions (role, resource, can_read, can_write)
VALUES ('superadmin', 'module:komunikator', true, true)
ON CONFLICT (role, resource) DO UPDATE SET
  can_read = true,
  can_write = true;
-- Rada starszych
INSERT INTO app_permissions (role, resource, can_read, can_write)
VALUES ('rada_starszych', 'module:komunikator', true, true)
ON CONFLICT (role, resource) DO UPDATE SET
  can_read = true,
  can_write = true;
-- Koordynator
INSERT INTO app_permissions (role, resource, can_read, can_write)
VALUES ('koordynator', 'module:komunikator', true, true)
ON CONFLICT (role, resource) DO UPDATE SET
  can_read = true,
  can_write = true;
-- Lider
INSERT INTO app_permissions (role, resource, can_read, can_write)
VALUES ('lider', 'module:komunikator', true, true)
ON CONFLICT (role, resource) DO UPDATE SET
  can_read = true,
  can_write = true;
-- Członek (też ma dostęp - komunikator jest dla wszystkich)
INSERT INTO app_permissions (role, resource, can_read, can_write)
VALUES ('czlonek', 'module:komunikator', true, true)
ON CONFLICT (role, resource) DO UPDATE SET
  can_read = true,
  can_write = true;

-- ======================================================
-- ŹRÓDŁO: migrations/create_push_subscriptions.sql
-- ======================================================
-- ============================================
-- TABELA PUSH SUBSCRIPTIONS
-- ============================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email TEXT NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Indeksy
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_email ON push_subscriptions(user_email);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);
-- Trigger do automatycznej aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_push_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_update_push_subscriptions_updated_at ON push_subscriptions;
DROP TRIGGER IF EXISTS trigger_update_push_subscriptions_updated_at ON push_subscriptions;
CREATE TRIGGER trigger_update_push_subscriptions_updated_at
    BEFORE UPDATE ON push_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_push_subscriptions_updated_at();

-- ======================================================
-- ŹRÓDŁO: migrations/create_push_tokens.sql
-- ======================================================
-- Push tokens dla aplikacji mobilnej (Expo Push API).
-- Równoległa do istniejącej tabeli push_subscriptions (web-push / VAPID).
-- Edge function send-push będzie czytać obie tabele i wysyłać do odpowiednich providerów.

CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  expo_token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  device_name TEXT,
  app_version TEXT,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_email);
CREATE INDEX IF NOT EXISTS idx_push_tokens_seen ON push_tokens(last_seen_at);

-- ======================================================
-- ŹRÓDŁO: migrations/create_push_campaigns.sql
-- ======================================================
-- Push Campaigns: kreator i broadcast push notifications (web + mobile).
-- Idempotentna migracja w stylu pozostałych modułów (mailing, user_task_comments).
--
-- Tabele:
--   push_campaigns              - kampania (draft/scheduled/sending/sent/...)
--   push_campaign_segments      - segmenty odbiorców (all/campus/ministry/home_group/role/custom)
--   push_campaign_actions       - przyciski akcji (deep_link / inline_rsvp / open_form / external_url)
--   push_campaign_recipients    - per-odbiorca status dostarczenia + ticket Expo
--   push_campaign_templates     - zapisane szablony pushy
--   push_campaign_ab_variants   - warianty A/B
--   push_user_preferences       - preferencje użytkownika (quiet hours, opt-out kategorii)

-- ============================================
-- 1. push_campaigns
-- ============================================

CREATE TABLE IF NOT EXISTS push_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID NULL,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  icon TEXT,
  big_image TEXT,
  tag TEXT,
  link TEXT,
  category_id TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  send_mode TEXT NOT NULL DEFAULT 'now'
    CHECK (send_mode IN ('now', 'scheduled', 'smart')),
  scheduled_at TIMESTAMPTZ,
  smart_window_hours INT,
  frequency_cap_per_day INT,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  ab_test_enabled BOOLEAN DEFAULT FALSE,
  ab_winner_metric TEXT CHECK (ab_winner_metric IN ('open_rate', 'action_rate') OR ab_winner_metric IS NULL),
  ab_winner_variant TEXT,
  ab_winner_decided_at TIMESTAMPTZ,
  recipient_count INT DEFAULT 0,
  sent_count INT DEFAULT 0,
  delivered_count INT DEFAULT 0,
  opened_count INT DEFAULT 0,
  action_clicked_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  created_by TEXT REFERENCES app_users(email) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_push_campaigns_status ON push_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_push_campaigns_campus ON push_campaigns(campus_id);
CREATE INDEX IF NOT EXISTS idx_push_campaigns_scheduled ON push_campaigns(scheduled_at)
  WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_push_campaigns_created_by ON push_campaigns(created_by);
-- ============================================
-- 2. push_campaign_segments
-- ============================================

CREATE TABLE IF NOT EXISTS push_campaign_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES push_campaigns(id) ON DELETE CASCADE,
  segment_type TEXT NOT NULL
    CHECK (segment_type IN ('all', 'campus', 'ministry', 'home_group', 'role', 'custom_email', 'tag', 'active_users', 'program_kids')),
  segment_id TEXT,
  segment_name TEXT,
  exclude BOOLEAN DEFAULT FALSE,
  emails TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_campaign_segments_campaign ON push_campaign_segments(campaign_id);
-- ============================================
-- 3. push_campaign_actions
-- ============================================

CREATE TABLE IF NOT EXISTS push_campaign_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES push_campaigns(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  label TEXT NOT NULL,
  action_type TEXT NOT NULL
    CHECK (action_type IN ('deep_link', 'inline_rsvp', 'open_form', 'external_url')),
  action_value TEXT,
  destructive BOOLEAN DEFAULT FALSE,
  authentication_required BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_campaign_actions_campaign ON push_campaign_actions(campaign_id, position);
-- ============================================
-- 4. push_campaign_recipients
-- ============================================

CREATE TABLE IF NOT EXISTS push_campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES push_campaigns(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  full_name TEXT,
  variant TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'queued', 'sent', 'delivered', 'opened', 'action_clicked', 'failed', 'suppressed')),
  channels JSONB DEFAULT '{"web": null, "mobile": null}'::jsonb,
  expo_tickets JSONB DEFAULT '[]'::jsonb,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  action_clicked_at TIMESTAMPTZ,
  action_id UUID REFERENCES push_campaign_actions(id) ON DELETE SET NULL,
  error TEXT,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, user_email)
);
CREATE INDEX IF NOT EXISTS idx_push_campaign_recipients_campaign ON push_campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_push_campaign_recipients_status ON push_campaign_recipients(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_push_campaign_recipients_email ON push_campaign_recipients(user_email);
-- ============================================
-- 5. push_campaign_templates
-- ============================================

CREATE TABLE IF NOT EXISTS push_campaign_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  icon TEXT,
  category_id TEXT,
  default_actions JSONB DEFAULT '[]'::jsonb,
  is_system BOOLEAN DEFAULT FALSE,
  created_by TEXT REFERENCES app_users(email) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_campaign_templates_campus ON push_campaign_templates(campus_id);
-- Częściowy unique: szablony systemowe mają unikalne nazwy (chroni przed duplikatami przy re-runie migracji).
CREATE UNIQUE INDEX IF NOT EXISTS uq_push_campaign_templates_system_name
  ON push_campaign_templates(name) WHERE is_system = TRUE;
-- ============================================
-- 6. push_campaign_ab_variants
-- ============================================

CREATE TABLE IF NOT EXISTS push_campaign_ab_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES push_campaigns(id) ON DELETE CASCADE,
  variant TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  share_percent INT NOT NULL DEFAULT 50 CHECK (share_percent BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, variant)
);
CREATE INDEX IF NOT EXISTS idx_push_campaign_ab_variants_campaign ON push_campaign_ab_variants(campaign_id);
-- ============================================
-- 7. push_user_preferences
-- ============================================

CREATE TABLE IF NOT EXISTS push_user_preferences (
  user_email TEXT PRIMARY KEY,
  enabled BOOLEAN DEFAULT TRUE,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  timezone TEXT DEFAULT 'Europe/Warsaw',
  category_opt_outs TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- ============================================
-- 8. Trigger updated_at (per-tabela, konwencja avenit)
-- ============================================

CREATE OR REPLACE FUNCTION update_push_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_update_push_campaigns_updated_at ON push_campaigns;
DROP TRIGGER IF EXISTS trigger_update_push_campaigns_updated_at ON push_campaigns;
CREATE TRIGGER trigger_update_push_campaigns_updated_at
  BEFORE UPDATE ON push_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_push_campaigns_updated_at();
DROP TRIGGER IF EXISTS trigger_update_push_campaign_templates_updated_at ON push_campaign_templates;
DROP TRIGGER IF EXISTS trigger_update_push_campaign_templates_updated_at ON push_campaign_templates;
CREATE TRIGGER trigger_update_push_campaign_templates_updated_at
  BEFORE UPDATE ON push_campaign_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_push_campaigns_updated_at();
DROP TRIGGER IF EXISTS trigger_update_push_user_preferences_updated_at ON push_user_preferences;
DROP TRIGGER IF EXISTS trigger_update_push_user_preferences_updated_at ON push_user_preferences;
CREATE TRIGGER trigger_update_push_user_preferences_updated_at
  BEFORE UPDATE ON push_user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_push_campaigns_updated_at();
-- ============================================
-- 9. Funkcja agregująca statystyki kampanii
-- ============================================

CREATE OR REPLACE FUNCTION update_push_campaign_stats(p_campaign_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE push_campaigns
  SET
    recipient_count       = (SELECT COUNT(*) FROM push_campaign_recipients WHERE campaign_id = p_campaign_id),
    sent_count            = (SELECT COUNT(*) FROM push_campaign_recipients WHERE campaign_id = p_campaign_id AND status IN ('sent','delivered','opened','action_clicked')),
    delivered_count       = (SELECT COUNT(*) FROM push_campaign_recipients WHERE campaign_id = p_campaign_id AND status IN ('delivered','opened','action_clicked')),
    opened_count          = (SELECT COUNT(*) FROM push_campaign_recipients WHERE campaign_id = p_campaign_id AND status IN ('opened','action_clicked')),
    action_clicked_count  = (SELECT COUNT(*) FROM push_campaign_recipients WHERE campaign_id = p_campaign_id AND status = 'action_clicked'),
    failed_count          = (SELECT COUNT(*) FROM push_campaign_recipients WHERE campaign_id = p_campaign_id AND status = 'failed'),
    updated_at            = NOW()
  WHERE id = p_campaign_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- ============================================
-- 11. Powiązanie z notifications (inbox) — opcjonalne pole campaign_id
-- ============================================

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS push_campaign_id UUID
  REFERENCES push_campaigns(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_push_campaign ON notifications(push_campaign_id)
  WHERE push_campaign_id IS NOT NULL;
-- ============================================
-- 12. Rejestracja modułu w app_modules + uprawnienia
-- ============================================

INSERT INTO app_modules (key, label, path, icon, resource_key, display_order, is_enabled)
VALUES ('push_campaigns', 'Push Kampanie', '/push-campaigns', 'Bell', 'module:push_campaigns', 16, true)
ON CONFLICT (key) DO NOTHING;
INSERT INTO app_permissions (role, resource, can_read, can_write)
VALUES
  ('superadmin', 'module:push_campaigns', true, true),
  ('admin', 'module:push_campaigns', true, true),
  ('rada_starszych', 'module:push_campaigns', true, true)
ON CONFLICT (role, resource) DO UPDATE SET
  can_read = EXCLUDED.can_read,
  can_write = EXCLUDED.can_write;
-- ============================================
-- 13. Domyślne szablony systemowe
-- ============================================

INSERT INTO push_campaign_templates (name, title, body, category_id, default_actions, is_system, created_by)
VALUES
  ('Pusty', 'Tytuł powiadomienia', 'Treść powiadomienia...', 'cm_open_link', '[]'::jsonb, true, NULL),
  ('Ogłoszenie', 'Ważne ogłoszenie', 'Krótka treść ogłoszenia.', 'cm_open_link', '[{"label":"Otwórz","action_type":"deep_link","action_value":"/announcements"}]'::jsonb, true, NULL),
  ('Przypomnienie o wydarzeniu', 'Wydarzenie wkrótce', 'Pamiętaj o nadchodzącym wydarzeniu.', 'cm_rsvp_yes_no', '[{"label":"Potwierdzam","action_type":"inline_rsvp","action_value":"yes"},{"label":"Nie mogę","action_type":"inline_rsvp","action_value":"no"}]'::jsonb, true, NULL),
  ('Nowy formularz', 'Wypełnij formularz', 'Mamy dla Ciebie krótki formularz.', 'cm_form', '[{"label":"Wypełnij","action_type":"open_form","action_value":""},{"label":"Później","action_type":"deep_link","action_value":"/"}]'::jsonb, true, NULL)
ON CONFLICT (name) WHERE is_system = TRUE DO NOTHING;

-- ======================================================
-- ŹRÓDŁO: migrations/create_push_inline_responses.sql
-- ======================================================
-- Log inline-akcji wykonanych z poziomu pusha (RSVP itp.) bez otwierania appki.
-- Zapisuje surową odpowiedź; konkretna logika biznesowa (np. event_attendance)
-- konsumuje stąd dane lub czyta bezpośrednio.

CREATE TABLE IF NOT EXISTS push_inline_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES push_campaigns(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES push_campaign_recipients(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  response_type TEXT NOT NULL,                       -- np. 'rsvp', 'feedback'
  response_value TEXT NOT NULL,                      -- np. 'yes', 'no', 'maybe'
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(recipient_id)
);
CREATE INDEX IF NOT EXISTS idx_push_inline_responses_campaign ON push_inline_responses(campaign_id);
CREATE INDEX IF NOT EXISTS idx_push_inline_responses_user ON push_inline_responses(user_email);

-- ======================================================
-- ŹRÓDŁO: migrations/_install_push_campaigns.sql
-- ======================================================
-- Push Campaigns: kreator i broadcast push notifications (web + mobile).
-- Idempotentna migracja w stylu pozostałych modułów (mailing, user_task_comments).
--
-- Tabele:
--   push_campaigns              - kampania (draft/scheduled/sending/sent/...)
--   push_campaign_segments      - segmenty odbiorców (all/campus/ministry/home_group/role/custom)
--   push_campaign_actions       - przyciski akcji (deep_link / inline_rsvp / open_form / external_url)
--   push_campaign_recipients    - per-odbiorca status dostarczenia + ticket Expo
--   push_campaign_templates     - zapisane szablony pushy
--   push_campaign_ab_variants   - warianty A/B
--   push_user_preferences       - preferencje użytkownika (quiet hours, opt-out kategorii)

-- ============================================
-- 1. push_campaigns
-- ============================================

CREATE TABLE IF NOT EXISTS push_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID NULL,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  icon TEXT,
  big_image TEXT,
  tag TEXT,
  link TEXT,
  category_id TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  send_mode TEXT NOT NULL DEFAULT 'now'
    CHECK (send_mode IN ('now', 'scheduled', 'smart')),
  scheduled_at TIMESTAMPTZ,
  smart_window_hours INT,
  frequency_cap_per_day INT,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  ab_test_enabled BOOLEAN DEFAULT FALSE,
  ab_winner_metric TEXT CHECK (ab_winner_metric IN ('open_rate', 'action_rate') OR ab_winner_metric IS NULL),
  ab_winner_variant TEXT,
  ab_winner_decided_at TIMESTAMPTZ,
  recipient_count INT DEFAULT 0,
  sent_count INT DEFAULT 0,
  delivered_count INT DEFAULT 0,
  opened_count INT DEFAULT 0,
  action_clicked_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  created_by TEXT REFERENCES app_users(email) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_push_campaigns_status ON push_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_push_campaigns_campus ON push_campaigns(campus_id);
CREATE INDEX IF NOT EXISTS idx_push_campaigns_scheduled ON push_campaigns(scheduled_at)
  WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_push_campaigns_created_by ON push_campaigns(created_by);
-- ============================================
-- 2. push_campaign_segments
-- ============================================

CREATE TABLE IF NOT EXISTS push_campaign_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES push_campaigns(id) ON DELETE CASCADE,
  segment_type TEXT NOT NULL
    CHECK (segment_type IN ('all', 'campus', 'ministry', 'home_group', 'role', 'custom_email', 'tag', 'active_users', 'program_kids')),
  segment_id TEXT,
  segment_name TEXT,
  exclude BOOLEAN DEFAULT FALSE,
  emails TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_campaign_segments_campaign ON push_campaign_segments(campaign_id);
-- ============================================
-- 3. push_campaign_actions
-- ============================================

CREATE TABLE IF NOT EXISTS push_campaign_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES push_campaigns(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  label TEXT NOT NULL,
  action_type TEXT NOT NULL
    CHECK (action_type IN ('deep_link', 'inline_rsvp', 'open_form', 'external_url')),
  action_value TEXT,
  destructive BOOLEAN DEFAULT FALSE,
  authentication_required BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_campaign_actions_campaign ON push_campaign_actions(campaign_id, position);
-- ============================================
-- 4. push_campaign_recipients
-- ============================================

CREATE TABLE IF NOT EXISTS push_campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES push_campaigns(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  full_name TEXT,
  variant TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'queued', 'sent', 'delivered', 'opened', 'action_clicked', 'failed', 'suppressed')),
  channels JSONB DEFAULT '{"web": null, "mobile": null}'::jsonb,
  expo_tickets JSONB DEFAULT '[]'::jsonb,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  action_clicked_at TIMESTAMPTZ,
  action_id UUID REFERENCES push_campaign_actions(id) ON DELETE SET NULL,
  error TEXT,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, user_email)
);
CREATE INDEX IF NOT EXISTS idx_push_campaign_recipients_campaign ON push_campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_push_campaign_recipients_status ON push_campaign_recipients(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_push_campaign_recipients_email ON push_campaign_recipients(user_email);
-- ============================================
-- 5. push_campaign_templates
-- ============================================

CREATE TABLE IF NOT EXISTS push_campaign_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  icon TEXT,
  category_id TEXT,
  default_actions JSONB DEFAULT '[]'::jsonb,
  is_system BOOLEAN DEFAULT FALSE,
  created_by TEXT REFERENCES app_users(email) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_campaign_templates_campus ON push_campaign_templates(campus_id);
-- ============================================
-- 6. push_campaign_ab_variants
-- ============================================

CREATE TABLE IF NOT EXISTS push_campaign_ab_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES push_campaigns(id) ON DELETE CASCADE,
  variant TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  share_percent INT NOT NULL DEFAULT 50 CHECK (share_percent BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, variant)
);
CREATE INDEX IF NOT EXISTS idx_push_campaign_ab_variants_campaign ON push_campaign_ab_variants(campaign_id);
-- ============================================
-- 7. push_user_preferences
-- ============================================

CREATE TABLE IF NOT EXISTS push_user_preferences (
  user_email TEXT PRIMARY KEY,
  enabled BOOLEAN DEFAULT TRUE,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  timezone TEXT DEFAULT 'Europe/Warsaw',
  category_opt_outs TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- ============================================
-- 8. Trigger updated_at (per-tabela, konwencja appschtomy)
-- ============================================

CREATE OR REPLACE FUNCTION update_push_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_update_push_campaigns_updated_at ON push_campaigns;
DROP TRIGGER IF EXISTS trigger_update_push_campaigns_updated_at ON push_campaigns;
CREATE TRIGGER trigger_update_push_campaigns_updated_at
  BEFORE UPDATE ON push_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_push_campaigns_updated_at();
DROP TRIGGER IF EXISTS trigger_update_push_campaign_templates_updated_at ON push_campaign_templates;
DROP TRIGGER IF EXISTS trigger_update_push_campaign_templates_updated_at ON push_campaign_templates;
CREATE TRIGGER trigger_update_push_campaign_templates_updated_at
  BEFORE UPDATE ON push_campaign_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_push_campaigns_updated_at();
DROP TRIGGER IF EXISTS trigger_update_push_user_preferences_updated_at ON push_user_preferences;
DROP TRIGGER IF EXISTS trigger_update_push_user_preferences_updated_at ON push_user_preferences;
CREATE TRIGGER trigger_update_push_user_preferences_updated_at
  BEFORE UPDATE ON push_user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_push_campaigns_updated_at();
-- ============================================
-- 9. Funkcja agregująca statystyki kampanii
-- ============================================

CREATE OR REPLACE FUNCTION update_push_campaign_stats(p_campaign_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE push_campaigns
  SET
    recipient_count       = (SELECT COUNT(*) FROM push_campaign_recipients WHERE campaign_id = p_campaign_id),
    sent_count            = (SELECT COUNT(*) FROM push_campaign_recipients WHERE campaign_id = p_campaign_id AND status IN ('sent','delivered','opened','action_clicked')),
    delivered_count       = (SELECT COUNT(*) FROM push_campaign_recipients WHERE campaign_id = p_campaign_id AND status IN ('delivered','opened','action_clicked')),
    opened_count          = (SELECT COUNT(*) FROM push_campaign_recipients WHERE campaign_id = p_campaign_id AND status IN ('opened','action_clicked')),
    action_clicked_count  = (SELECT COUNT(*) FROM push_campaign_recipients WHERE campaign_id = p_campaign_id AND status = 'action_clicked'),
    failed_count          = (SELECT COUNT(*) FROM push_campaign_recipients WHERE campaign_id = p_campaign_id AND status = 'failed'),
    updated_at            = NOW()
  WHERE id = p_campaign_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- ============================================
-- 11. Powiązanie z notifications (inbox) — opcjonalne pole campaign_id
-- ============================================

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS push_campaign_id UUID
  REFERENCES push_campaigns(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_push_campaign ON notifications(push_campaign_id)
  WHERE push_campaign_id IS NOT NULL;
-- ============================================
-- 12. Rejestracja modułu w app_modules + uprawnienia
-- ============================================

INSERT INTO app_modules (key, label, path, icon, resource_key, display_order, is_enabled)
VALUES ('push_campaigns', 'Push Kampanie', '/push-campaigns', 'Bell', 'module:push_campaigns', 16, true)
ON CONFLICT (key) DO NOTHING;
INSERT INTO app_permissions (role, resource, can_read, can_write)
VALUES
  ('superadmin', 'module:push_campaigns', true, true),
  ('admin', 'module:push_campaigns', true, true),
  ('rada_starszych', 'module:push_campaigns', true, true)
ON CONFLICT (role, resource) DO UPDATE SET
  can_read = EXCLUDED.can_read,
  can_write = EXCLUDED.can_write;
-- ============================================
-- 13. Domyślne szablony systemowe
-- ============================================

INSERT INTO push_campaign_templates (name, title, body, category_id, default_actions, is_system, created_by)
VALUES
  ('Pusty', 'Tytuł powiadomienia', 'Treść powiadomienia...', 'cm_open_link', '[]'::jsonb, true, NULL),
  ('Ogłoszenie', 'Ważne ogłoszenie', 'Krótka treść ogłoszenia.', 'cm_open_link', '[{"label":"Otwórz","action_type":"deep_link","action_value":"/announcements"}]'::jsonb, true, NULL),
  ('Przypomnienie o wydarzeniu', 'Wydarzenie wkrótce', 'Pamiętaj o nadchodzącym wydarzeniu.', 'cm_rsvp_yes_no', '[{"label":"Potwierdzam","action_type":"inline_rsvp","action_value":"yes"},{"label":"Nie mogę","action_type":"inline_rsvp","action_value":"no"}]'::jsonb, true, NULL),
  ('Nowy formularz', 'Wypełnij formularz', 'Mamy dla Ciebie krótki formularz.', 'cm_form', '[{"label":"Wypełnij","action_type":"open_form","action_value":""},{"label":"Później","action_type":"deep_link","action_value":"/"}]'::jsonb, true, NULL)
ON CONFLICT DO NOTHING;
-- ============================================================
-- PART 2: push_inline_responses (log RSVP)
-- ============================================================
-- Log inline-akcji wykonanych z poziomu pusha (RSVP itp.) bez otwierania appki.
-- Zapisuje surową odpowiedź; konkretna logika biznesowa (np. event_attendance)
-- konsumuje stąd dane lub czyta bezpośrednio.

CREATE TABLE IF NOT EXISTS push_inline_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES push_campaigns(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES push_campaign_recipients(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  response_type TEXT NOT NULL,                       -- np. 'rsvp', 'feedback'
  response_value TEXT NOT NULL,                      -- np. 'yes', 'no', 'maybe'
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(recipient_id)
);
CREATE INDEX IF NOT EXISTS idx_push_inline_responses_campaign ON push_inline_responses(campaign_id);
CREATE INDEX IF NOT EXISTS idx_push_inline_responses_user ON push_inline_responses(user_email);
-- Weryfikacja:
-- SELECT jobname, schedule, command FROM cron.job WHERE jobname LIKE 'push-%';;

-- ======================================================
-- ŹRÓDŁO: migrations/_install_sms_campaigns.sql
-- ======================================================
-- SMS Campaigns: kreator i broadcast SMS przez bramkę SMSAPI.pl.
-- Idempotentna migracja w stylu pozostałych modułów (push_campaigns, mailing).
--
-- Tabele:
--   sms_campaigns               - kampania (draft/scheduled/sending/sent/...)
--   sms_campaign_segments       - segmenty odbiorców (all/campus/ministry/home_group/role/custom_email/custom_phone)
--   sms_campaign_recipients     - per-odbiorca status dostarczenia + smsapi_id + points
--   sms_campaign_templates      - zapisane szablony SMS
--   sms_campaign_ab_variants    - warianty A/B (tylko body, bez title)
--   sms_user_preferences        - preferencje (quiet hours, opt-out, marketing_consent RODO)
--   sms_inline_responses        - log incoming SMS / RSVP-by-reply

-- ============================================
-- 1. sms_campaigns
-- ============================================

CREATE TABLE IF NOT EXISTS sms_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID NULL,
  name TEXT NOT NULL,
  sender TEXT NOT NULL,
  body TEXT NOT NULL,
  encoding TEXT CHECK (encoding IN ('gsm7', 'unicode')),
  parts_per_message INT DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  send_mode TEXT NOT NULL DEFAULT 'now'
    CHECK (send_mode IN ('now', 'scheduled', 'smart')),
  scheduled_at TIMESTAMPTZ,
  smart_window_hours INT,
  frequency_cap_per_day INT,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  ab_test_enabled BOOLEAN DEFAULT FALSE,
  ab_winner_metric TEXT CHECK (ab_winner_metric IN ('delivery_rate', 'reply_rate') OR ab_winner_metric IS NULL),
  ab_winner_variant TEXT,
  ab_winner_decided_at TIMESTAMPTZ,
  recipient_count INT DEFAULT 0,
  sent_count INT DEFAULT 0,
  delivered_count INT DEFAULT 0,
  replied_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  total_cost NUMERIC(10, 4) DEFAULT 0,
  created_by TEXT REFERENCES app_users(email) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sms_campaigns_status ON sms_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_sms_campaigns_campus ON sms_campaigns(campus_id);
CREATE INDEX IF NOT EXISTS idx_sms_campaigns_scheduled ON sms_campaigns(scheduled_at)
  WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_sms_campaigns_created_by ON sms_campaigns(created_by);
-- ============================================
-- 2. sms_campaign_segments
-- ============================================

CREATE TABLE IF NOT EXISTS sms_campaign_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES sms_campaigns(id) ON DELETE CASCADE,
  segment_type TEXT NOT NULL
    CHECK (segment_type IN ('all', 'campus', 'ministry', 'home_group', 'role', 'custom_email', 'custom_phone', 'tag', 'active_users', 'program_kids')),
  segment_id TEXT,
  segment_name TEXT,
  exclude BOOLEAN DEFAULT FALSE,
  emails TEXT[],
  phones TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sms_campaign_segments_campaign ON sms_campaign_segments(campaign_id);
-- ============================================
-- 3. sms_campaign_recipients
-- ============================================

CREATE TABLE IF NOT EXISTS sms_campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES sms_campaigns(id) ON DELETE CASCADE,
  user_email TEXT,
  full_name TEXT,
  phone TEXT,
  variant TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'queued', 'sent', 'delivered', 'failed', 'suppressed', 'replied')),
  smsapi_id TEXT,
  points NUMERIC(8, 4),
  delivered_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  error TEXT,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, phone)
);
CREATE INDEX IF NOT EXISTS idx_sms_campaign_recipients_campaign ON sms_campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_sms_campaign_recipients_status ON sms_campaign_recipients(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_sms_campaign_recipients_phone ON sms_campaign_recipients(phone);
CREATE INDEX IF NOT EXISTS idx_sms_campaign_recipients_smsapi_id ON sms_campaign_recipients(smsapi_id)
  WHERE smsapi_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sms_campaign_recipients_email ON sms_campaign_recipients(user_email);
-- ============================================
-- 4. sms_campaign_templates
-- ============================================

CREATE TABLE IF NOT EXISTS sms_campaign_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  default_sender TEXT,
  is_system BOOLEAN DEFAULT FALSE,
  created_by TEXT REFERENCES app_users(email) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sms_campaign_templates_campus ON sms_campaign_templates(campus_id);
-- ============================================
-- 5. sms_campaign_ab_variants
-- ============================================

CREATE TABLE IF NOT EXISTS sms_campaign_ab_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES sms_campaigns(id) ON DELETE CASCADE,
  variant TEXT NOT NULL,
  body TEXT NOT NULL,
  share_percent INT NOT NULL DEFAULT 50 CHECK (share_percent BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, variant)
);
CREATE INDEX IF NOT EXISTS idx_sms_campaign_ab_variants_campaign ON sms_campaign_ab_variants(campaign_id);
-- ============================================
-- 6. sms_user_preferences
-- ============================================

CREATE TABLE IF NOT EXISTS sms_user_preferences (
  user_email TEXT PRIMARY KEY,
  phone TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  marketing_consent BOOLEAN DEFAULT FALSE,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  timezone TEXT DEFAULT 'Europe/Warsaw',
  category_opt_outs TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- ============================================
-- 7. sms_inline_responses (incoming SMS / RSVP)
-- ============================================

CREATE TABLE IF NOT EXISTS sms_inline_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES sms_campaigns(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES sms_campaign_recipients(id) ON DELETE CASCADE,
  user_email TEXT,
  phone TEXT NOT NULL,
  smsapi_msg_id TEXT,
  response_type TEXT NOT NULL,                       -- 'rsvp' | 'reply'
  response_value TEXT NOT NULL,                      -- 'yes'/'no' lub raw text
  raw_text TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sms_inline_responses_campaign ON sms_inline_responses(campaign_id);
CREATE INDEX IF NOT EXISTS idx_sms_inline_responses_recipient ON sms_inline_responses(recipient_id);
CREATE INDEX IF NOT EXISTS idx_sms_inline_responses_phone ON sms_inline_responses(phone);
-- ============================================
-- 8. Trigger updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_sms_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_update_sms_campaigns_updated_at ON sms_campaigns;
DROP TRIGGER IF EXISTS trigger_update_sms_campaigns_updated_at ON sms_campaigns;
CREATE TRIGGER trigger_update_sms_campaigns_updated_at
  BEFORE UPDATE ON sms_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_sms_campaigns_updated_at();
DROP TRIGGER IF EXISTS trigger_update_sms_campaign_templates_updated_at ON sms_campaign_templates;
DROP TRIGGER IF EXISTS trigger_update_sms_campaign_templates_updated_at ON sms_campaign_templates;
CREATE TRIGGER trigger_update_sms_campaign_templates_updated_at
  BEFORE UPDATE ON sms_campaign_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_sms_campaigns_updated_at();
DROP TRIGGER IF EXISTS trigger_update_sms_user_preferences_updated_at ON sms_user_preferences;
DROP TRIGGER IF EXISTS trigger_update_sms_user_preferences_updated_at ON sms_user_preferences;
CREATE TRIGGER trigger_update_sms_user_preferences_updated_at
  BEFORE UPDATE ON sms_user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_sms_campaigns_updated_at();
-- ============================================
-- 9. Funkcja agregująca statystyki kampanii
-- ============================================

CREATE OR REPLACE FUNCTION update_sms_campaign_stats(p_campaign_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE sms_campaigns
  SET
    recipient_count  = (SELECT COUNT(*) FROM sms_campaign_recipients WHERE campaign_id = p_campaign_id),
    sent_count       = (SELECT COUNT(*) FROM sms_campaign_recipients WHERE campaign_id = p_campaign_id AND status IN ('sent','delivered','replied')),
    delivered_count  = (SELECT COUNT(*) FROM sms_campaign_recipients WHERE campaign_id = p_campaign_id AND status IN ('delivered','replied')),
    replied_count    = (SELECT COUNT(*) FROM sms_campaign_recipients WHERE campaign_id = p_campaign_id AND status = 'replied'),
    failed_count     = (SELECT COUNT(*) FROM sms_campaign_recipients WHERE campaign_id = p_campaign_id AND status = 'failed'),
    total_cost       = COALESCE((SELECT SUM(points) FROM sms_campaign_recipients WHERE campaign_id = p_campaign_id AND points IS NOT NULL), 0),
    updated_at       = NOW()
  WHERE id = p_campaign_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- ============================================
-- 11. Rejestracja modułu w app_modules + uprawnienia
-- ============================================

INSERT INTO app_modules (key, label, path, icon, resource_key, display_order, is_enabled)
VALUES ('sms_campaigns', 'SMS Kampanie', '/sms-campaigns', 'MessageSquare', 'module:sms_campaigns', 17, true)
ON CONFLICT (key) DO NOTHING;
INSERT INTO app_permissions (role, resource, can_read, can_write)
VALUES
  ('superadmin', 'module:sms_campaigns', true, true),
  ('admin', 'module:sms_campaigns', true, true),
  ('rada_starszych', 'module:sms_campaigns', true, true)
ON CONFLICT (role, resource) DO UPDATE SET
  can_read = EXCLUDED.can_read,
  can_write = EXCLUDED.can_write;
-- ============================================
-- 12. Domyślne szablony systemowe
-- ============================================

INSERT INTO sms_campaign_templates (name, body, is_system, created_by)
VALUES
  ('Pusty', 'Treść SMS...', true, NULL),
  ('Krótkie ogłoszenie', 'Witaj! Przypominamy o ważnym ogłoszeniu w naszej wspólnocie. Szczegóły w aplikacji.', true, NULL),
  ('Przypomnienie wydarzenia (RSVP)', 'Przypominamy o wydarzeniu. Odpowiedz TAK lub NIE aby potwierdzić obecność.', true, NULL),
  ('Powiadomienie o płatności', 'Otrzymaliśmy Twoją wpłatę. Dziękujemy za wsparcie!', true, NULL)
ON CONFLICT DO NOTHING;
-- Weryfikacja:
-- SELECT jobname, schedule, command FROM cron.job WHERE jobname LIKE 'sms-%';;

-- ======================================================
-- ŹRÓDŁO: migrations/_install_integration_settings.sql
-- ======================================================
-- Integracje zewnętrzne (SMSAPI, ew. inne dostawcy) — wrażliwa konfiguracja
-- nie do umieszczenia w app_settings (które jest czytelne dla wszystkich
-- authenticated). RLS ograniczone do superadmin/admin/rada_starszych.
--
-- Edge functions czytają z tej tabeli przez service_role (bypass RLS),
-- z fallbackiem na ENV dla przypadku bootstrap / brak rekordu.

CREATE TABLE IF NOT EXISTS integration_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  description TEXT,
  is_secret BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT REFERENCES app_users(email) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_integration_settings_key ON integration_settings(key);
CREATE OR REPLACE FUNCTION update_integration_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_update_integration_settings_updated_at ON integration_settings;
DROP TRIGGER IF EXISTS trigger_update_integration_settings_updated_at ON integration_settings;
CREATE TRIGGER trigger_update_integration_settings_updated_at
  BEFORE UPDATE ON integration_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_integration_settings_updated_at();
-- Domyślne klucze SMSAPI (puste; wypełnia admin w UI / ENV).
INSERT INTO integration_settings (key, value, description, is_secret)
VALUES
  ('smsapi_token',          NULL, 'SMSAPI Personal Access Token (Bearer). Generuj w panelu: https://ssl.smsapi.pl/react/oauth/manage', TRUE),
  ('smsapi_default_sender', NULL, 'Domyślny nadawca SMS (zarejestrowany w SMSAPI, max 11 znaków alfanumerycznych).', FALSE),
  ('smsapi_api_url',        'https://api.smsapi.pl', 'URL bramki SMSAPI (zostaw default lub podmień na sandbox).', FALSE),
  ('smsapi_webhook_secret', NULL, 'Sekret do walidacji webhooka MO. URL webhooka w panelu SMSAPI: <SUPABASE_URL>/functions/v1/sms-incoming-webhook?secret=<TEN_SEKRET>', TRUE)
ON CONFLICT (key) DO NOTHING;

-- ======================================================
-- ŹRÓDŁO: migrations/create_user_task_comments.sql
-- ======================================================
-- Komentarze do user_tasks (sekcja "Komentarze" w widgecie zadań na dashboardzie).
-- Idempotentna migracja.

-- 1. Dorzuć brakujące kolumny do user_tasks (mobile dashboard zakłada przypisywanie + załączniki).
ALTER TABLE user_tasks ADD COLUMN IF NOT EXISTS assigned_to_email TEXT;
ALTER TABLE user_tasks ADD COLUMN IF NOT EXISTS assigned_to_name TEXT;
ALTER TABLE user_tasks ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS idx_user_tasks_assigned_to ON user_tasks(assigned_to_email);
-- 2. Tabela komentarzy.
CREATE TABLE IF NOT EXISTS user_task_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES user_tasks(id) ON DELETE CASCADE,
  author_email TEXT NOT NULL,
  author_name TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_task_comments_task ON user_task_comments(task_id, created_at);
-- Trigger updated_at (konwencja per-tabela, tak jak inne migracje avenit).
CREATE OR REPLACE FUNCTION update_user_task_comments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_update_user_task_comments_updated_at ON user_task_comments;
DROP TRIGGER IF EXISTS trigger_update_user_task_comments_updated_at ON user_task_comments;
CREATE TRIGGER trigger_update_user_task_comments_updated_at
  BEFORE UPDATE ON user_task_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_user_task_comments_updated_at();

-- ======================================================
-- ŹRÓDŁO: migrations/update_members_table.sql
-- ======================================================
-- ============================================
-- Aktualizacja tabeli members
-- Nowe funkcjonalności: statusy, członkostwo, służby
-- ============================================

-- Dodaj nowe kolumny do tabeli members
ALTER TABLE members
ADD COLUMN IF NOT EXISTS home_group_id UUID REFERENCES home_groups(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS membership_date DATE,
ADD COLUMN IF NOT EXISTS membership_declaration_url TEXT,
ADD COLUMN IF NOT EXISTS ministries TEXT[] DEFAULT '{}';
-- Zaktualizuj istniejące statusy na nowe wartości
UPDATE members SET status = 'Sympatyk' WHERE status = 'Aktywny';
UPDATE members SET status = 'Gość' WHERE status = 'Nieaktywny';
UPDATE members SET status = 'Gość' WHERE status = 'Urlop';
UPDATE members SET status = 'Sympatyk' WHERE status IS NULL OR status = '';
-- Dodaj constraint dla statusów
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_status_check;
ALTER TABLE members ADD CONSTRAINT members_status_check
  CHECK (status IN ('Członek', 'Sympatyk', 'Gość'));
-- Indeksy dla nowych kolumn
CREATE INDEX IF NOT EXISTS idx_members_home_group ON members(home_group_id);
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
CREATE INDEX IF NOT EXISTS idx_members_ministries ON members USING GIN(ministries);
-- ============================================
-- Bucket do przechowywania deklaracji członkostwa
-- ============================================

-- Utwórz bucket dla deklaracji (wykonaj w Supabase Dashboard -> Storage)
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('membership-declarations', 'membership-declarations', true)
-- ON CONFLICT (id) DO NOTHING;

-- Polityki RLS dla bucketa (wykonaj w Supabase Dashboard)
-- CREATE POLICY "Authenticated users can upload declarations"
-- ON storage.objects FOR INSERT
-- WITH CHECK (bucket_id = 'membership-declarations' AND 'authenticated' = 'authenticated');

-- CREATE POLICY "Authenticated users can read declarations"
-- ON storage.objects FOR SELECT
-- USING (bucket_id = 'membership-declarations' AND 'authenticated' = 'authenticated');

-- CREATE POLICY "Authenticated users can delete declarations"
-- ON storage.objects FOR DELETE
-- USING (bucket_id = 'membership-declarations' AND 'authenticated' = 'authenticated');

-- ============================================
-- Migracja danych z home_group (string) do home_group_id (UUID)
-- ============================================

-- Jeśli istnieje kolumna home_group (string), przeprowadź migrację
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'home_group'
  ) THEN
    -- Zaktualizuj home_group_id na podstawie nazwy grupy
    UPDATE members m
    SET home_group_id = hg.id
    FROM home_groups hg
    WHERE m.home_group = hg.name AND m.home_group_id IS NULL;

    -- Opcjonalnie: usuń starą kolumnę home_group
    -- ALTER TABLE members DROP COLUMN IF EXISTS home_group;
  END IF;
END $$;
-- ============================================
-- Komentarze do kolumn
-- ============================================

COMMENT ON COLUMN members.status IS 'Status osoby: Członek, Sympatyk, Gość';
COMMENT ON COLUMN members.home_group_id IS 'ID grupy domowej (referencja do home_groups)';
COMMENT ON COLUMN members.membership_date IS 'Data przyjęcia do członkostwa';
COMMENT ON COLUMN members.membership_declaration_url IS 'URL do pliku PDF z deklaracją członkostwa';
COMMENT ON COLUMN members.ministries IS 'Tablica kluczy służb: media_team, atmosfera_team, worship_team, home_groups, kids_ministry, administration';

-- ======================================================
-- ŹRÓDŁO: migrations/optimize_programs_table.sql
-- ======================================================
-- Indeks dla szybszego wyszukiwania po dacie
CREATE INDEX IF NOT EXISTS idx_programs_date ON programs(date DESC);
-- Indeks dla wyszukiwania po dacie w zakresie
CREATE INDEX IF NOT EXISTS idx_programs_date_asc ON programs(date ASC);
-- Analiza tabeli dla lepszego planowania zapytań
ANALYZE programs;

-- ======================================================
-- ŹRÓDŁO: migrations/fix_member_id_type.sql
-- ======================================================
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

-- ======================================================
-- ŹRÓDŁO: migrations/fix_notification_link.sql
-- ======================================================
-- Aktualizacja funkcji tworzenia powiadomień - dodanie conversation_id do linku
-- Uruchom tę migrację, żeby powiadomienia z triggera kierowały do konkretnej konwersacji

CREATE OR REPLACE FUNCTION create_message_notification()
RETURNS TRIGGER AS $$
DECLARE
    participant RECORD;
    conv_name TEXT;
    sender_name TEXT;
BEGIN
    -- Pobierz nazwę konwersacji
    SELECT name INTO conv_name FROM conversations WHERE id = NEW.conversation_id;

    -- Pobierz imię nadawcy
    SELECT full_name INTO sender_name FROM app_users WHERE email = NEW.sender_email;
    IF sender_name IS NULL THEN
        sender_name := NEW.sender_email;
    END IF;

    -- Utwórz powiadomienia dla wszystkich uczestników oprócz nadawcy
    FOR participant IN
        SELECT user_email FROM conversation_participants
        WHERE conversation_id = NEW.conversation_id
        AND user_email != NEW.sender_email
    LOOP
        INSERT INTO notifications (user_email, type, title, body, link, data)
        VALUES (
            participant.user_email,
            'message',
            COALESCE(conv_name, sender_name),
            LEFT(NEW.content, 100),
            '/komunikator?conversation=' || NEW.conversation_id::text,
            jsonb_build_object(
                'conversation_id', NEW.conversation_id,
                'message_id', NEW.id,
                'sender_email', NEW.sender_email,
                'sender_name', sender_name
            )
        );
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ======================================================
-- WARSTWA AUTH / API (dodatki Avenit ponad schemat legacy)
-- ======================================================
-- Hasła i sesje trzymamy w bazie tenanta (koniec z Supabase Auth).
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens(expires_at);

-- Log logowań 2FA (używany przez UI 2FA).
CREATE TABLE IF NOT EXISTS totp_auth_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT,
  action TEXT,
  success BOOLEAN,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
