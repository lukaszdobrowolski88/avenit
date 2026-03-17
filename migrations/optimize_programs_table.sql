-- Indeks dla szybszego wyszukiwania po dacie
CREATE INDEX IF NOT EXISTS idx_programs_date ON programs(date DESC);

-- Indeks dla wyszukiwania po dacie w zakresie
CREATE INDEX IF NOT EXISTS idx_programs_date_asc ON programs(date ASC);

-- Analiza tabeli dla lepszego planowania zapytań
ANALYZE programs;
