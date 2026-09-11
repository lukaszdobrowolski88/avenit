-- Udostępnianie plików/folderów osobom, grupom i grupom domowym (Drive-like „Udostępnij").
CREATE TABLE IF NOT EXISTS materials_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  file_id UUID REFERENCES materials_files(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES materials_folders(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,          -- user | group | home_group
  target_id TEXT NOT NULL,            -- e-mail (osoba) lub uuid (grupa / grupa domowa)
  target_label TEXT,                  -- nazwa do wyświetlenia
  permission TEXT DEFAULT 'view',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_materials_shares_target ON materials_shares (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_materials_shares_file ON materials_shares (file_id);
CREATE INDEX IF NOT EXISTS idx_materials_shares_folder ON materials_shares (folder_id);
