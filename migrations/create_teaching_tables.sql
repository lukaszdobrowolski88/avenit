-- Tabela dla mówców
CREATE TABLE IF NOT EXISTS teaching_speakers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  bio TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dodaj kolumnę email do istniejącej tabeli (dla migracji)
ALTER TABLE teaching_speakers ADD COLUMN IF NOT EXISTS email TEXT;

-- Tabela dla serii nauczania
CREATE TABLE IF NOT EXISTS teaching_series (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  scripture TEXT,
  start_date DATE,
  end_date DATE,
  graphics JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dodaj kolumnę teaching do tabeli programs (jeśli nie istnieje)
-- Kolumna teaching przechowuje dane nauczania dla każdego programu nabożeństwa
-- Struktura: { speaker_id, series_id, title, scripture, main_point, notes }
ALTER TABLE programs ADD COLUMN IF NOT EXISTS teaching JSONB DEFAULT '{}';

-- Indeksy
CREATE INDEX IF NOT EXISTS idx_teaching_series_dates ON teaching_series(start_date, end_date);

-- RLS (Row Level Security)
ALTER TABLE teaching_speakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE teaching_series ENABLE ROW LEVEL SECURITY;

-- Usuń istniejące polityki (jeśli istnieją)
DROP POLICY IF EXISTS "Anyone can read teaching_speakers" ON teaching_speakers;
DROP POLICY IF EXISTS "Authenticated users can manage teaching_speakers" ON teaching_speakers;
DROP POLICY IF EXISTS "Anyone can read teaching_series" ON teaching_series;
DROP POLICY IF EXISTS "Authenticated users can manage teaching_series" ON teaching_series;

-- Polityki dla teaching_speakers
CREATE POLICY "Anyone can read teaching_speakers" ON teaching_speakers
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage teaching_speakers" ON teaching_speakers
  FOR ALL USING (auth.role() = 'authenticated');

-- Polityki dla teaching_series
CREATE POLICY "Anyone can read teaching_series" ON teaching_series
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage teaching_series" ON teaching_series
  FOR ALL USING (auth.role() = 'authenticated');
