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
-- 7. Włączenie Row Level Security (RLS)
-- ============================================
ALTER TABLE mlodziezowka_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE mlodziezowka_leaders ENABLE ROW LEVEL SECURITY;
ALTER TABLE mlodziezowka_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE mlodziezowka_task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE mlodziezowka_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE mlodziezowka_event_participants ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 8. Polityki RLS dla mlodziezowka_members
-- ============================================

-- SELECT: Liderzy i wyżej mogą widzieć członków
CREATE POLICY "Leaders can read mlodziezowka members" ON mlodziezowka_members
    FOR SELECT
    USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM app_users
            WHERE email = auth.email()
            AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
        )
    );

-- INSERT: Liderzy i wyżej mogą dodawać członków
CREATE POLICY "Leaders can create mlodziezowka members" ON mlodziezowka_members
    FOR INSERT
    WITH CHECK (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM app_users
            WHERE email = auth.email()
            AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
        )
    );

-- UPDATE: Liderzy i wyżej mogą edytować członków
CREATE POLICY "Leaders can update mlodziezowka members" ON mlodziezowka_members
    FOR UPDATE
    USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM app_users
            WHERE email = auth.email()
            AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
        )
    );

-- DELETE: Liderzy i wyżej mogą usuwać członków
CREATE POLICY "Leaders can delete mlodziezowka members" ON mlodziezowka_members
    FOR DELETE
    USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM app_users
            WHERE email = auth.email()
            AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
        )
    );

-- ============================================
-- 9. Polityki RLS dla mlodziezowka_leaders
-- ============================================

-- SELECT: Liderzy i wyżej mogą widzieć liderów
CREATE POLICY "Leaders can read mlodziezowka leaders" ON mlodziezowka_leaders
    FOR SELECT
    USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM app_users
            WHERE email = auth.email()
            AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
        )
    );

-- INSERT: Koordynatorzy i wyżej mogą dodawać liderów
CREATE POLICY "Coordinators can create mlodziezowka leaders" ON mlodziezowka_leaders
    FOR INSERT
    WITH CHECK (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM app_users
            WHERE email = auth.email()
            AND role IN ('superadmin', 'rada_starszych', 'koordynator')
        )
    );

-- UPDATE: Koordynatorzy i wyżej mogą edytować liderów
CREATE POLICY "Coordinators can update mlodziezowka leaders" ON mlodziezowka_leaders
    FOR UPDATE
    USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM app_users
            WHERE email = auth.email()
            AND role IN ('superadmin', 'rada_starszych', 'koordynator')
        )
    );

-- DELETE: Koordynatorzy i wyżej mogą usuwać liderów
CREATE POLICY "Coordinators can delete mlodziezowka leaders" ON mlodziezowka_leaders
    FOR DELETE
    USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM app_users
            WHERE email = auth.email()
            AND role IN ('superadmin', 'rada_starszych', 'koordynator')
        )
    );

-- ============================================
-- 10. Polityki RLS dla mlodziezowka_tasks
-- ============================================

-- SELECT: Wszyscy zalogowani mogą widzieć zadania
CREATE POLICY "Authenticated users can read mlodziezowka tasks" ON mlodziezowka_tasks
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- INSERT: Wszyscy zalogowani mogą tworzyć zadania
CREATE POLICY "Authenticated users can create mlodziezowka tasks" ON mlodziezowka_tasks
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- UPDATE: Autor lub liderzy mogą edytować zadania
CREATE POLICY "Authors and leaders can update mlodziezowka tasks" ON mlodziezowka_tasks
    FOR UPDATE
    USING (
        auth.role() = 'authenticated' AND (
            created_by = auth.email() OR
            auth.email() = ANY(assigned_to) OR
            EXISTS (
                SELECT 1 FROM app_users
                WHERE email = auth.email()
                AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
            )
        )
    );

-- DELETE: Autor lub liderzy mogą usuwać zadania
CREATE POLICY "Authors and leaders can delete mlodziezowka tasks" ON mlodziezowka_tasks
    FOR DELETE
    USING (
        auth.role() = 'authenticated' AND (
            created_by = auth.email() OR
            EXISTS (
                SELECT 1 FROM app_users
                WHERE email = auth.email()
                AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
            )
        )
    );

-- ============================================
-- 11. Polityki RLS dla mlodziezowka_task_comments
-- ============================================

-- SELECT: Wszyscy zalogowani mogą widzieć komentarze
CREATE POLICY "Authenticated users can read mlodziezowka task comments" ON mlodziezowka_task_comments
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- INSERT: Wszyscy zalogowani mogą dodawać komentarze
CREATE POLICY "Authenticated users can create mlodziezowka task comments" ON mlodziezowka_task_comments
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated' AND author_email = auth.email());

-- UPDATE: Autor może edytować swój komentarz
CREATE POLICY "Authors can update own mlodziezowka task comments" ON mlodziezowka_task_comments
    FOR UPDATE
    USING (auth.role() = 'authenticated' AND author_email = auth.email());

-- DELETE: Autor może usunąć swój komentarz
CREATE POLICY "Authors can delete own mlodziezowka task comments" ON mlodziezowka_task_comments
    FOR DELETE
    USING (auth.role() = 'authenticated' AND author_email = auth.email());

-- ============================================
-- 12. Polityki RLS dla mlodziezowka_events
-- ============================================

-- SELECT: Wszyscy zalogowani mogą widzieć wydarzenia
CREATE POLICY "Authenticated users can read mlodziezowka events" ON mlodziezowka_events
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- INSERT: Liderzy i wyżej mogą tworzyć wydarzenia
CREATE POLICY "Leaders can create mlodziezowka events" ON mlodziezowka_events
    FOR INSERT
    WITH CHECK (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM app_users
            WHERE email = auth.email()
            AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
        )
    );

-- UPDATE: Liderzy i wyżej mogą edytować wydarzenia
CREATE POLICY "Leaders can update mlodziezowka events" ON mlodziezowka_events
    FOR UPDATE
    USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM app_users
            WHERE email = auth.email()
            AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
        )
    );

-- DELETE: Liderzy i wyżej mogą usuwać wydarzenia
CREATE POLICY "Leaders can delete mlodziezowka events" ON mlodziezowka_events
    FOR DELETE
    USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM app_users
            WHERE email = auth.email()
            AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
        )
    );

-- ============================================
-- 13. Polityki RLS dla mlodziezowka_event_participants
-- ============================================

-- SELECT: Wszyscy zalogowani mogą widzieć uczestników
CREATE POLICY "Authenticated users can read mlodziezowka event participants" ON mlodziezowka_event_participants
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- INSERT: Użytkownik może zarejestrować siebie
CREATE POLICY "Users can register for mlodziezowka events" ON mlodziezowka_event_participants
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated' AND user_email = auth.email());

-- UPDATE: Użytkownik może aktualizować swoją rejestrację lub liderzy
CREATE POLICY "Users and leaders can update mlodziezowka event registration" ON mlodziezowka_event_participants
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

-- DELETE: Użytkownik może anulować swoją rejestrację lub liderzy
CREATE POLICY "Users and leaders can delete mlodziezowka event registration" ON mlodziezowka_event_participants
    FOR DELETE
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

-- ============================================
-- 14. Włączenie Realtime dla wybranych tabel
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'mlodziezowka_tasks'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE mlodziezowka_tasks;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'mlodziezowka_events'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE mlodziezowka_events;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'mlodziezowka_task_comments'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE mlodziezowka_task_comments;
    END IF;
END $$;

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
-- ============================================
