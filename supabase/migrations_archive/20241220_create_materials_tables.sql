-- ==================================================
-- MODUŁ MATERIAŁY - Tabele i polityki RLS
-- ==================================================

-- TABELA: materials_folders
-- Struktura folderów dla materiałów
CREATE TABLE IF NOT EXISTS materials_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  parent_id UUID REFERENCES materials_folders(id) ON DELETE CASCADE,
  ministry_key TEXT, -- NULL = folder globalny, wartość = folder służby
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name, parent_id, ministry_key)
);

-- Indeksy dla wydajności
CREATE INDEX IF NOT EXISTS idx_materials_folders_parent ON materials_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_materials_folders_ministry ON materials_folders(ministry_key);
CREATE INDEX IF NOT EXISTS idx_materials_folders_created_by ON materials_folders(created_by);

-- TABELA: materials_files
-- Pliki materiałów z metadanymi
CREATE TABLE IF NOT EXISTS materials_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  folder_id UUID REFERENCES materials_folders(id) ON DELETE SET NULL,
  ministry_key TEXT,
  uploaded_by TEXT NOT NULL,
  description TEXT,
  download_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeksy dla wydajności
CREATE INDEX IF NOT EXISTS idx_materials_files_folder ON materials_files(folder_id);
CREATE INDEX IF NOT EXISTS idx_materials_files_ministry ON materials_files(ministry_key);
CREATE INDEX IF NOT EXISTS idx_materials_files_uploaded_by ON materials_files(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_materials_files_name ON materials_files(name);

-- ==================================================
-- RLS (Row Level Security)
-- ==================================================
ALTER TABLE materials_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials_files ENABLE ROW LEVEL SECURITY;

-- FOLDERS: Wszyscy zalogowani mogą czytać
CREATE POLICY "materials_folders_select_all" ON materials_folders
  FOR SELECT TO authenticated
  USING (true);

-- FOLDERS: Liderzy+ mogą dodawać
CREATE POLICY "materials_folders_insert_leaders" ON materials_folders
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE email = auth.jwt()->>'email'
      AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
    )
  );

-- FOLDERS: Liderzy+ lub twórca mogą aktualizować
CREATE POLICY "materials_folders_update_leaders" ON materials_folders
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.jwt()->>'email' OR
    EXISTS (
      SELECT 1 FROM app_users
      WHERE email = auth.jwt()->>'email'
      AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
    )
  );

-- FOLDERS: Liderzy+ lub twórca mogą usuwać
CREATE POLICY "materials_folders_delete_leaders" ON materials_folders
  FOR DELETE TO authenticated
  USING (
    created_by = auth.jwt()->>'email' OR
    EXISTS (
      SELECT 1 FROM app_users
      WHERE email = auth.jwt()->>'email'
      AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
    )
  );

-- FILES: Wszyscy zalogowani mogą czytać
CREATE POLICY "materials_files_select_all" ON materials_files
  FOR SELECT TO authenticated
  USING (true);

-- FILES: Liderzy+ mogą dodawać
CREATE POLICY "materials_files_insert_leaders" ON materials_files
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE email = auth.jwt()->>'email'
      AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
    )
  );

-- FILES: Liderzy+ lub uploadujący mogą aktualizować
CREATE POLICY "materials_files_update_leaders" ON materials_files
  FOR UPDATE TO authenticated
  USING (
    uploaded_by = auth.jwt()->>'email' OR
    EXISTS (
      SELECT 1 FROM app_users
      WHERE email = auth.jwt()->>'email'
      AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
    )
  );

-- FILES: Liderzy+ lub uploadujący mogą usuwać
CREATE POLICY "materials_files_delete_leaders" ON materials_files
  FOR DELETE TO authenticated
  USING (
    uploaded_by = auth.jwt()->>'email' OR
    EXISTS (
      SELECT 1 FROM app_users
      WHERE email = auth.jwt()->>'email'
      AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
    )
  );

-- ==================================================
-- STORAGE BUCKET
-- ==================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('materials', 'materials', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "materials_bucket_select_all"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'materials');

CREATE POLICY "materials_bucket_insert_leaders"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'materials' AND
  EXISTS (
    SELECT 1 FROM app_users
    WHERE email = auth.jwt()->>'email'
    AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
  )
);

CREATE POLICY "materials_bucket_delete_leaders"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'materials' AND
  EXISTS (
    SELECT 1 FROM app_users
    WHERE email = auth.jwt()->>'email'
    AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
  )
);

-- Publiczny dostęp do odczytu (dla pobierania bez autoryzacji)
CREATE POLICY "materials_bucket_public_select"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'materials');
