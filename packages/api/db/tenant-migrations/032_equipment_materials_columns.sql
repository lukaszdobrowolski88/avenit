-- Rozjazd schematu: frontend (shared/EquipmentTab, modules/Materials) używa kolumn,
-- których nie ma w starych tabelach na produkcji (szablon miał zdublowaną definicję
-- `equipment`, a `materials_files`/`materials_folders` używały innych nazw kolumn).
-- Dodajemy brakujące kolumny ZGODNIE z tym, co frontend wysyła i czyta — addytywnie
-- i idempotentnie. Naprawia zapis Wyposażenia (equipment) oraz Plików/Folderów (materials_*).

-- Wyposażenie: pola z formularza EquipmentTab + updated_at (wymagane przez trigger przy edycji).
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS unit_value NUMERIC(10,2) DEFAULT 0;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS responsible_person TEXT;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Pliki: frontend zapisuje i czyta file_size/mime_type/uploaded_by (stare size/file_type/created_by zostają nieużywane).
ALTER TABLE materials_files ADD COLUMN IF NOT EXISTS file_size INTEGER;
ALTER TABLE materials_files ADD COLUMN IF NOT EXISTS mime_type TEXT;
ALTER TABLE materials_files ADD COLUMN IF NOT EXISTS uploaded_by TEXT;

-- Foldery: created_by trzymamy jako e-mail (TEXT). Na produkcji kolumna była UUID → insert e-maila padał.
ALTER TABLE materials_folders ALTER COLUMN created_by TYPE TEXT USING created_by::text;
