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

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
