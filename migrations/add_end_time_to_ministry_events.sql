-- ============================================
-- Dodanie kolumny end_time do tabel wydarzeń służb
-- Przechowuje godzinę zakończenia w formacie HH:MM
-- ============================================

-- Tabela worship_events
ALTER TABLE worship_events ADD COLUMN IF NOT EXISTS end_time VARCHAR(5);
COMMENT ON COLUMN worship_events.end_time IS 'Godzina zakończenia w formacie HH:MM';

-- Tabela media_events
ALTER TABLE media_events ADD COLUMN IF NOT EXISTS end_time VARCHAR(5);
COMMENT ON COLUMN media_events.end_time IS 'Godzina zakończenia w formacie HH:MM';

-- Tabela atmosfera_events
ALTER TABLE atmosfera_events ADD COLUMN IF NOT EXISTS end_time VARCHAR(5);
COMMENT ON COLUMN atmosfera_events.end_time IS 'Godzina zakończenia w formacie HH:MM';

-- Tabela kids_events
ALTER TABLE kids_events ADD COLUMN IF NOT EXISTS end_time VARCHAR(5);
COMMENT ON COLUMN kids_events.end_time IS 'Godzina zakończenia w formacie HH:MM';

-- Tabela homegroups_events
ALTER TABLE homegroups_events ADD COLUMN IF NOT EXISTS end_time VARCHAR(5);
COMMENT ON COLUMN homegroups_events.end_time IS 'Godzina zakończenia w formacie HH:MM';
