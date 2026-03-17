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
-- 3. Włączenie Row Level Security (RLS)
-- ============================================
ALTER TABLE app_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_module_tabs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. Polityki RLS dla app_modules
-- ============================================

-- Wszyscy zalogowani użytkownicy mogą czytać moduły
CREATE POLICY "Authenticated users can read modules" ON app_modules
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- Tylko admini mogą dodawać moduły
CREATE POLICY "Admins can insert modules" ON app_modules
    FOR INSERT
    WITH CHECK (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM app_users
            WHERE email = auth.email()
            AND role IN ('superadmin', 'rada_starszych')
        )
    );

-- Tylko admini mogą aktualizować moduły
CREATE POLICY "Admins can update modules" ON app_modules
    FOR UPDATE
    USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM app_users
            WHERE email = auth.email()
            AND role IN ('superadmin', 'rada_starszych')
        )
    );

-- Tylko admini mogą usuwać moduły (i tylko nie-systemowe)
CREATE POLICY "Admins can delete non-system modules" ON app_modules
    FOR DELETE
    USING (
        is_system = false AND
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM app_users
            WHERE email = auth.email()
            AND role IN ('superadmin', 'rada_starszych')
        )
    );

-- ============================================
-- 5. Polityki RLS dla app_module_tabs
-- ============================================

-- Wszyscy zalogowani użytkownicy mogą czytać zakładki
CREATE POLICY "Authenticated users can read tabs" ON app_module_tabs
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- Tylko admini mogą dodawać zakładki
CREATE POLICY "Admins can insert tabs" ON app_module_tabs
    FOR INSERT
    WITH CHECK (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM app_users
            WHERE email = auth.email()
            AND role IN ('superadmin', 'rada_starszych')
        )
    );

-- Tylko admini mogą aktualizować zakładki
CREATE POLICY "Admins can update tabs" ON app_module_tabs
    FOR UPDATE
    USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM app_users
            WHERE email = auth.email()
            AND role IN ('superadmin', 'rada_starszych')
        )
    );

-- Tylko admini mogą usuwać zakładki (i tylko nie-systemowe)
CREATE POLICY "Admins can delete non-system tabs" ON app_module_tabs
    FOR DELETE
    USING (
        is_system = false AND
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM app_users
            WHERE email = auth.email()
            AND role IN ('superadmin', 'rada_starszych')
        )
    );

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

-- ============================================
-- 8. Włączenie Realtime dla nowych tabel
-- ============================================
DO $$
BEGIN
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
