-- Łącznik wydarzenie ↔ materiał (plik z systemu Materiałów/Pliki). Pozwala podpiąć do wydarzenia
-- materiały już istniejące w grupach domowych oraz nowo wgrane. events.id = integer, materials_files.id = uuid.
CREATE TABLE IF NOT EXISTS event_materials (
  id serial PRIMARY KEY,
  event_id integer NOT NULL,
  file_id uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_materials ON event_materials(event_id, file_id);
CREATE INDEX IF NOT EXISTS idx_event_materials_event ON event_materials(event_id);
