-- Struktura własnych sekcji i ról dodanych ad-hoc na wydarzeniu (zakładka „Służby").
-- { sections: [{ key, label }], roles: { [sectionKey]: [{ key, label }] } }
-- Przypisania (kto) nadal w events.assignments[sectionKey][roleKey] (CSV imion).
ALTER TABLE events ADD COLUMN IF NOT EXISTS team_layout jsonb DEFAULT '{}'::jsonb;
