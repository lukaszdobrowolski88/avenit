-- 044: Brakujące kolumny w `forms` (dryf schematu: kod używa status/is_archived/is_template,
-- a stara tabela ma tylko is_active) → „column status does not exist" przy tworzeniu formularza.
ALTER TABLE forms ADD COLUMN IF NOT EXISTS status            text DEFAULT 'draft';
ALTER TABLE forms ADD COLUMN IF NOT EXISTS is_archived       boolean DEFAULT false;
ALTER TABLE forms ADD COLUMN IF NOT EXISTS is_template       boolean DEFAULT false;
ALTER TABLE forms ADD COLUMN IF NOT EXISTS template_category text;
-- Istniejące formularze: status z is_active (aktywne → published).
UPDATE forms SET status = CASE WHEN is_active THEN 'published' ELSE 'draft' END WHERE status IS NULL OR status = 'draft';
