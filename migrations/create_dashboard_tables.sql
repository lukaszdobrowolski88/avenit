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
CREATE TRIGGER trigger_update_user_absences_updated_at
    BEFORE UPDATE ON user_absences
    FOR EACH ROW
    EXECUTE FUNCTION update_user_absences_updated_at();

-- ============================================
-- Row Level Security (RLS)
-- ============================================

-- Włącz RLS dla user_dashboard_layouts
ALTER TABLE user_dashboard_layouts ENABLE ROW LEVEL SECURITY;

-- Włącz RLS dla user_absences
ALTER TABLE user_absences ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Polityki dla user_dashboard_layouts
-- ============================================

-- SELECT: Użytkownik może odczytać tylko swój układ
CREATE POLICY "Users can read own dashboard layout" ON user_dashboard_layouts
    FOR SELECT
    USING (auth.role() = 'authenticated' AND user_email = auth.email());

-- INSERT: Użytkownik może utworzyć swój układ
CREATE POLICY "Users can create own dashboard layout" ON user_dashboard_layouts
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated' AND user_email = auth.email());

-- UPDATE: Użytkownik może aktualizować tylko swój układ
CREATE POLICY "Users can update own dashboard layout" ON user_dashboard_layouts
    FOR UPDATE
    USING (auth.role() = 'authenticated' AND user_email = auth.email())
    WITH CHECK (auth.role() = 'authenticated' AND user_email = auth.email());

-- DELETE: Użytkownik może usunąć swój układ
CREATE POLICY "Users can delete own dashboard layout" ON user_dashboard_layouts
    FOR DELETE
    USING (auth.role() = 'authenticated' AND user_email = auth.email());

-- ============================================
-- Polityki dla user_absences
-- ============================================

-- SELECT: Użytkownik widzi swoje nieobecności, liderzy widzą wszystkie
CREATE POLICY "Users can read absences" ON user_absences
    FOR SELECT
    USING (
        auth.role() = 'authenticated' AND (
            user_email = auth.email() OR
            EXISTS (
                SELECT 1 FROM app_users
                WHERE email = auth.email()
                AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
            )
        )
    );

-- INSERT: Każdy zalogowany może zgłosić nieobecność
CREATE POLICY "Authenticated users can create absences" ON user_absences
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated' AND user_email = auth.email());

-- UPDATE: Użytkownik może edytować swoje nieobecności, liderzy mogą zmieniać status
CREATE POLICY "Users can update absences" ON user_absences
    FOR UPDATE
    USING (
        auth.role() = 'authenticated' AND (
            user_email = auth.email() OR
            EXISTS (
                SELECT 1 FROM app_users
                WHERE email = auth.email()
                AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
            )
        )
    );

-- DELETE: Użytkownik może usunąć swoją nieobecność
CREATE POLICY "Users can delete own absences" ON user_absences
    FOR DELETE
    USING (auth.role() = 'authenticated' AND user_email = auth.email());

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
CREATE TRIGGER trigger_update_user_tasks_updated_at
    BEFORE UPDATE ON user_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_user_tasks_updated_at();

-- Włącz RLS dla user_tasks
ALTER TABLE user_tasks ENABLE ROW LEVEL SECURITY;

-- Polityki dla user_tasks

-- SELECT: Użytkownik może odczytać tylko swoje zadania
CREATE POLICY "Users can read own tasks" ON user_tasks
    FOR SELECT
    USING (auth.role() = 'authenticated' AND user_email = auth.email());

-- INSERT: Użytkownik może utworzyć swoje zadania
CREATE POLICY "Users can create own tasks" ON user_tasks
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated' AND user_email = auth.email());

-- UPDATE: Użytkownik może aktualizować tylko swoje zadania
CREATE POLICY "Users can update own tasks" ON user_tasks
    FOR UPDATE
    USING (auth.role() = 'authenticated' AND user_email = auth.email())
    WITH CHECK (auth.role() = 'authenticated' AND user_email = auth.email());

-- DELETE: Użytkownik może usunąć swoje zadania
CREATE POLICY "Users can delete own tasks" ON user_tasks
    FOR DELETE
    USING (auth.role() = 'authenticated' AND user_email = auth.email());
