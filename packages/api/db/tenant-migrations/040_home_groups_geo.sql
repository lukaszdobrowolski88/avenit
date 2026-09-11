-- Współrzędne grup domowych — zapisywane po geokodowaniu adresu (szybsze ładowanie mapy).
ALTER TABLE home_groups ADD COLUMN IF NOT EXISTS lat NUMERIC;
ALTER TABLE home_groups ADD COLUMN IF NOT EXISTS lng NUMERIC;
