-- 083: usunięcie wydarzenia sprząta jego przydziały w grafiku i podpięte materiały.
-- schedule_assignments.event_id i event_materials.event_id nie miały klucza obcego — po
-- usunięciu wydarzenia zostawały „duchy” (przydziały w „Moja służba”, materiały bez wydarzenia),
-- a sprzątanie z przeglądarki zależało od uprawnień osoby usuwającej. Idempotentne.

-- Najpierw osierocone wiersze (inaczej dodanie klucza się nie powiedzie).
DELETE FROM schedule_assignments s
 WHERE s.event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM events e WHERE e.id = s.event_id);
DELETE FROM event_materials m
 WHERE m.event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM events e WHERE e.id = m.event_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schedule_assignments_event_id_fkey') THEN
    ALTER TABLE schedule_assignments
      ADD CONSTRAINT schedule_assignments_event_id_fkey FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_materials_event_id_fkey') THEN
    ALTER TABLE event_materials
      ADD CONSTRAINT event_materials_event_id_fkey FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_schedule_assignments_event_id ON schedule_assignments(event_id);
CREATE INDEX IF NOT EXISTS idx_event_materials_event_id ON event_materials(event_id);
