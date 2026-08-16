-- Foldery/workspace'y tablic — kolumna dla istniejących tenantów.
ALTER TABLE boards ADD COLUMN IF NOT EXISTS folder TEXT;
CREATE INDEX IF NOT EXISTS idx_boards_folder ON boards(folder);
