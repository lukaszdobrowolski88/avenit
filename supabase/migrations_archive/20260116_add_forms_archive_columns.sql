-- Dodanie kolumn archiwizacji do tabeli forms
ALTER TABLE forms ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;
ALTER TABLE forms ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Indeks dla szybkiego filtrowania po is_archived
CREATE INDEX IF NOT EXISTS idx_forms_is_archived ON forms(is_archived);
