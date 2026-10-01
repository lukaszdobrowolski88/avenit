-- Współrzędne grup domowych (pod mapę z pinezkami w apce mobilnej).
-- Grupy miały dotąd tylko location/address (bez lat/lng). Dodajemy kolumny; wartości
-- uzupełnia leniwe geokodowanie serwerowe (fn home-groups-map, Nominatim) albo ręcznie web.
-- geocoded_at = znacznik próby geokodowania (żeby nie ponawiać w kółko nieudanych).
-- VPS-safe: samo ALTER ... ADD COLUMN IF NOT EXISTS (bez RLS/triggerów/auth.jwt()).

ALTER TABLE home_groups ADD COLUMN IF NOT EXISTS latitude    double precision;
ALTER TABLE home_groups ADD COLUMN IF NOT EXISTS longitude   double precision;
ALTER TABLE home_groups ADD COLUMN IF NOT EXISTS geocoded_at timestamptz;
