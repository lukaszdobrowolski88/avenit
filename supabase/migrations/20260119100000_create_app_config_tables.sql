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

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read settings" ON app_settings;
CREATE POLICY "Authenticated users can read settings" ON app_settings
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage settings" ON app_settings;
CREATE POLICY "Admins can manage settings" ON app_settings
    FOR ALL USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM app_users
            WHERE auth_user_id = auth.uid()
            AND (role = 'superadmin' OR is_super_admin = true)
        )
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

ALTER TABLE app_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read permissions" ON app_permissions;
CREATE POLICY "Authenticated users can read permissions" ON app_permissions
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage permissions" ON app_permissions;
CREATE POLICY "Admins can manage permissions" ON app_permissions
    FOR ALL USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM app_users
            WHERE auth_user_id = auth.uid()
            AND (role = 'superadmin' OR is_super_admin = true)
        )
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

ALTER TABLE app_modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read modules" ON app_modules;
CREATE POLICY "Authenticated users can read modules" ON app_modules
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage modules" ON app_modules;
CREATE POLICY "Admins can manage modules" ON app_modules
    FOR ALL USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM app_users
            WHERE auth_user_id = auth.uid()
            AND (role = 'superadmin' OR is_super_admin = true)
        )
    );

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

ALTER TABLE app_module_tabs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read tabs" ON app_module_tabs;
CREATE POLICY "Authenticated users can read tabs" ON app_module_tabs
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage tabs" ON app_module_tabs;
CREATE POLICY "Admins can manage tabs" ON app_module_tabs
    FOR ALL USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM app_users
            WHERE auth_user_id = auth.uid()
            AND (role = 'superadmin' OR is_super_admin = true)
        )
    );

-- =====================================================
-- 5. Włączenie Realtime
-- =====================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'app_settings'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE app_settings;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'app_permissions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE app_permissions;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'app_modules'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE app_modules;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'app_module_tabs'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE app_module_tabs;
    END IF;
END $$;
