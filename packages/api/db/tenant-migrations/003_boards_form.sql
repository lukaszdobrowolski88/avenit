-- Publiczny formularz tablicy (WorkForms-style) — kolumny dla istniejących tenantów.
ALTER TABLE boards ADD COLUMN IF NOT EXISTS form_enabled BOOLEAN DEFAULT false;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS form_token TEXT;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS form_settings JSONB DEFAULT '{}'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS idx_boards_form_token ON boards(form_token) WHERE form_token IS NOT NULL;
