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
CREATE TRIGGER trigger_update_equipment_updated_at
    BEFORE UPDATE ON equipment
    FOR EACH ROW
    EXECUTE FUNCTION update_equipment_updated_at();

-- ============================================
-- RLS (Row Level Security)
-- ============================================
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;

-- SELECT: Wszyscy zalogowani mogą czytać wyposażenie
CREATE POLICY "equipment_select_all" ON equipment
    FOR SELECT TO authenticated
    USING (true);

-- INSERT: Liderzy i wyżej mogą dodawać
CREATE POLICY "equipment_insert_leaders" ON equipment
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM app_users
            WHERE email = auth.jwt()->>'email'
            AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
        )
    );

-- UPDATE: Liderzy i wyżej mogą aktualizować
CREATE POLICY "equipment_update_leaders" ON equipment
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM app_users
            WHERE email = auth.jwt()->>'email'
            AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
        )
    );

-- DELETE: Liderzy i wyżej mogą usuwać
CREATE POLICY "equipment_delete_leaders" ON equipment
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM app_users
            WHERE email = auth.jwt()->>'email'
            AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
        )
    );

-- ============================================
-- Włączenie Realtime (opcjonalne)
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'equipment'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE equipment;
    END IF;
END $$;
