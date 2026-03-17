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
CREATE TRIGGER trigger_update_homegroups_events_updated_at
    BEFORE UPDATE ON homegroups_events
    FOR EACH ROW
    EXECUTE FUNCTION update_homegroups_events_updated_at();

-- ============================================
-- 6. Włączenie Row Level Security (RLS)
-- ============================================
ALTER TABLE worship_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE atmosfera_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE kids_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE homegroups_events ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 7. Polityki RLS dla worship_events
-- ============================================
CREATE POLICY "Authenticated users can read worship events" ON worship_events
    FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Leaders can create worship events" ON worship_events
    FOR INSERT
    WITH CHECK (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM app_users
            WHERE email = auth.email()
            AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
        )
    );

CREATE POLICY "Leaders can update worship events" ON worship_events
    FOR UPDATE
    USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM app_users
            WHERE email = auth.email()
            AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
        )
    );

CREATE POLICY "Leaders can delete worship events" ON worship_events
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
-- 8. Polityki RLS dla media_events
-- ============================================
CREATE POLICY "Authenticated users can read media events" ON media_events
    FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Leaders can create media events" ON media_events
    FOR INSERT
    WITH CHECK (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM app_users
            WHERE email = auth.email()
            AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
        )
    );

CREATE POLICY "Leaders can update media events" ON media_events
    FOR UPDATE
    USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM app_users
            WHERE email = auth.email()
            AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
        )
    );

CREATE POLICY "Leaders can delete media events" ON media_events
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
-- 9. Polityki RLS dla atmosfera_events
-- ============================================
CREATE POLICY "Authenticated users can read atmosfera events" ON atmosfera_events
    FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Leaders can create atmosfera events" ON atmosfera_events
    FOR INSERT
    WITH CHECK (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM app_users
            WHERE email = auth.email()
            AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
        )
    );

CREATE POLICY "Leaders can update atmosfera events" ON atmosfera_events
    FOR UPDATE
    USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM app_users
            WHERE email = auth.email()
            AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
        )
    );

CREATE POLICY "Leaders can delete atmosfera events" ON atmosfera_events
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
-- 10. Polityki RLS dla kids_events
-- ============================================
CREATE POLICY "Authenticated users can read kids events" ON kids_events
    FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Leaders can create kids events" ON kids_events
    FOR INSERT
    WITH CHECK (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM app_users
            WHERE email = auth.email()
            AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
        )
    );

CREATE POLICY "Leaders can update kids events" ON kids_events
    FOR UPDATE
    USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM app_users
            WHERE email = auth.email()
            AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
        )
    );

CREATE POLICY "Leaders can delete kids events" ON kids_events
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
-- 11. Polityki RLS dla homegroups_events
-- ============================================
CREATE POLICY "Authenticated users can read homegroups events" ON homegroups_events
    FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Leaders can create homegroups events" ON homegroups_events
    FOR INSERT
    WITH CHECK (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM app_users
            WHERE email = auth.email()
            AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
        )
    );

CREATE POLICY "Leaders can update homegroups events" ON homegroups_events
    FOR UPDATE
    USING (
        auth.role() = 'authenticated' AND
        EXISTS (
            SELECT 1 FROM app_users
            WHERE email = auth.email()
            AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
        )
    );

CREATE POLICY "Leaders can delete homegroups events" ON homegroups_events
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
-- 12. Włączenie Realtime dla nowych tabel
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'worship_events'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE worship_events;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'media_events'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE media_events;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'atmosfera_events'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE atmosfera_events;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'kids_events'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE kids_events;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'homegroups_events'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE homegroups_events;
    END IF;
END $$;
