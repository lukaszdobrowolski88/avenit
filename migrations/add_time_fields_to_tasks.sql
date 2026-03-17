-- Dodaj pola due_time i end_time do tabeli tasks
-- Te pola przechowują godzinę rozpoczęcia i zakończenia wydarzenia

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_time VARCHAR(5);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS end_time VARCHAR(5);

-- Komentarze do kolumn
COMMENT ON COLUMN tasks.due_time IS 'Godzina rozpoczęcia w formacie HH:MM';
COMMENT ON COLUMN tasks.end_time IS 'Godzina zakończenia w formacie HH:MM';
