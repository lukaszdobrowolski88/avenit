-- Wzbogacenie danych członka: notatki duszpasterskie, tagi, data urodzenia.
ALTER TABLE members ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE members ADD COLUMN IF NOT EXISTS birth_date DATE;
