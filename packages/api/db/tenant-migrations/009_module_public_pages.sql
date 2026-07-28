-- Migracja 009: publiczne strony kreatora (zakładka jako mikrostrona bez logowania).
ALTER TABLE app_module_tabs ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;
ALTER TABLE app_module_tabs ADD COLUMN IF NOT EXISTS public_slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_module_tabs_public_slug
  ON app_module_tabs(public_slug) WHERE public_slug IS NOT NULL;
