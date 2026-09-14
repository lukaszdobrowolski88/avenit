-- Przypisanie wydarzenia do konkretnej grupy domowej (opcjonalne). Używane w module
-- Grupy domowe → zakładka Wydarzenia (wybór grupy w modalu + filtr). NULL = całej społeczności.
ALTER TABLE events ADD COLUMN IF NOT EXISTS home_group_id uuid;
CREATE INDEX IF NOT EXISTS idx_events_home_group ON events(home_group_id);
