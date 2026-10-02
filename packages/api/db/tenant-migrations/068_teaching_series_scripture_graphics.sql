-- Serie nauczania: brakujące kolumny używane przez UI (SeriesSection w TeachingModule):
--  - scripture: „Fragment biblijny" serii
--  - graphics:  galeria grafik serii (jsonb: [{ name, url }])
-- Bez nich insert/update serii zwracał: column "scripture" of relation "teaching_series" does not exist.
ALTER TABLE teaching_series ADD COLUMN IF NOT EXISTS scripture TEXT;
ALTER TABLE teaching_series ADD COLUMN IF NOT EXISTS graphics JSONB DEFAULT '[]'::jsonb;
