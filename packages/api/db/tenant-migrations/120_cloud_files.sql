-- 120: Integracje — Faza 3: pliki z Dysku Google i OneDrive / SharePoint BEZ kopiowania.
--
-- Odnośnik do pliku w chmurze to zwykły wiersz materials_files (Pliki modułów, materiały wydarzeń
-- przez event_materials, foldery grup domowych) z kolumnami external_*: dzięki temu działają na nim
-- te same zakresy co na plikach z magazynu (team_type / przestrzenie wrażliwe, udostępnienia,
-- własność uploaded_by — materialsScope.js, rundy 5/6). storage_path zostaje NULL — Avenit nie
-- przechowuje treści pliku. Załączniki Komunikatora (messages.attachments jsonb) nie wymagają zmian
-- schematu: odnośnik to element tablicy z kind = 'cloud'.
--
-- workspace_integration_settings.files — ustawienia kościoła: wyłączenie plików z chmury per
-- dostawca oraz (Google) własny klucz API i numer projektu dla Google Picker.
--
-- Idempotentnie i bezpiecznie dla żywego tenanta (nowe kolumny są puste).

ALTER TABLE materials_files ADD COLUMN IF NOT EXISTS external_provider TEXT;
ALTER TABLE materials_files ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE materials_files ADD COLUMN IF NOT EXISTS external_drive_id TEXT;
ALTER TABLE materials_files ADD COLUMN IF NOT EXISTS external_url TEXT;

-- Produkcja bywa rozbieżna z szablonem — odnośnik nie ma ścieżki w magazynie.
ALTER TABLE materials_files ALTER COLUMN storage_path DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'materials_files_external_chk_120') THEN
    ALTER TABLE materials_files ADD CONSTRAINT materials_files_external_chk_120 CHECK (
      external_provider IS NULL
      OR (external_provider IN ('google_drive', 'onedrive', 'sharepoint')
          AND external_id IS NOT NULL
          AND external_url LIKE 'https://%')
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_materials_files_external_120
    ON materials_files (external_provider, external_id) WHERE external_provider IS NOT NULL;

DO $$
BEGIN
  IF to_regclass('public.workspace_integration_settings') IS NOT NULL THEN
    ALTER TABLE workspace_integration_settings ADD COLUMN IF NOT EXISTS files JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;
