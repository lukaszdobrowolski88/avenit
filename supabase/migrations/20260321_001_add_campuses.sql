-- =====================================================
-- MULTI-CAMPUS SUPPORT
-- =====================================================

-- 1. Tabela campuses
CREATE TABLE IF NOT EXISTS campuses (
    id SERIAL PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
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

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
