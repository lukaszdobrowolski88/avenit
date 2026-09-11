-- Pliki (Materiały) — Drive-like. Kod (useMaterials/FileCard) czyta/zapisuje kolumny,
-- których brakuje w schemacie: description, download_count, updated_at (pliki) oraz
-- updated_at (foldery — potrzebne do zmiany nazwy/przenoszenia). Addytywne, idempotentne.
ALTER TABLE materials_files ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE materials_files ADD COLUMN IF NOT EXISTS download_count INTEGER DEFAULT 0;
ALTER TABLE materials_files ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();
ALTER TABLE materials_folders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();
