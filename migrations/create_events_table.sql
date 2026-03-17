-- Tabela dla ogólnych wydarzeń (nie nabożeństw)
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  date DATE NOT NULL,
  time VARCHAR(10),
  end_time VARCHAR(10),
  location VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indeks dla szybkiego wyszukiwania po dacie
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);

-- RLS (Row Level Security)
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Polityka pozwalająca na pełny dostęp dla uwierzytelnionych użytkowników
CREATE POLICY "Allow full access for authenticated users" ON events
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
