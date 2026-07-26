-- ============================================
-- MODUŁ REZERWACJI SAL I ZASOBÓW (Rooms)
-- Sale i sprzęt jako zasoby, rezerwacje z wykrywaniem konfliktów
-- (nakładanie się czasu) oraz rezerwacje cykliczne (recurrence_group).
-- ============================================

-- 1. Zasoby: sale i sprzęt
CREATE TABLE IF NOT EXISTS resources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'room' CHECK (type IN ('room','equipment')),
  capacity INTEGER,
  color TEXT DEFAULT '#3b82f6',
  location TEXT,
  is_active BOOLEAN DEFAULT true,
  campus_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Rezerwacje zasobów
-- recurrence_group: wspólny UUID dla wpisów jednej serii cyklicznej
-- (generowany po stronie klienta przy zapisie).
CREATE TABLE IF NOT EXISTS resource_bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  resource_id UUID REFERENCES resources(id) ON DELETE CASCADE,
  title TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  booked_by TEXT,
  note TEXT,
  recurrence_group UUID,
  campus_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeksy
CREATE INDEX IF NOT EXISTS idx_resources_campus ON resources(campus_id);
CREATE INDEX IF NOT EXISTS idx_resources_active ON resources(is_active);
CREATE INDEX IF NOT EXISTS idx_resource_bookings_resource ON resource_bookings(resource_id);
CREATE INDEX IF NOT EXISTS idx_resource_bookings_range ON resource_bookings(resource_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_resource_bookings_start ON resource_bookings(start_at);
CREATE INDEX IF NOT EXISTS idx_resource_bookings_campus ON resource_bookings(campus_id);
CREATE INDEX IF NOT EXISTS idx_resource_bookings_group ON resource_bookings(recurrence_group);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_rooms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_resources_updated ON resources;
CREATE TRIGGER trg_resources_updated BEFORE UPDATE ON resources
  FOR EACH ROW EXECUTE FUNCTION update_rooms_updated_at();
DROP TRIGGER IF EXISTS trg_resource_bookings_updated ON resource_bookings;
CREATE TRIGGER trg_resource_bookings_updated BEFORE UPDATE ON resource_bookings
  FOR EACH ROW EXECUTE FUNCTION update_rooms_updated_at();

-- RLS
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_bookings ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['resources','resource_bookings'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "read_%1$s" ON %1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS "manage_%1$s" ON %1$s', t);
    EXECUTE format('CREATE POLICY "read_%1$s" ON %1$s FOR SELECT USING (true)', t);
    EXECUTE format('CREATE POLICY "manage_%1$s" ON %1$s FOR ALL USING (auth.role() = ''authenticated'')', t);
  END LOOP;
END $$;

-- ============================================
-- Rejestracja modułu w nawigacji
-- ============================================
INSERT INTO app_modules (key, label, icon, path, resource_key, display_order, is_system, component_name)
VALUES ('rooms', 'Rezerwacje sal', 'DoorOpen', '/rooms', 'module:rooms', 21, true, 'RoomsModule')
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label, icon = EXCLUDED.icon, path = EXCLUDED.path,
  resource_key = EXCLUDED.resource_key, component_name = EXCLUDED.component_name;

-- ============================================
-- Uprawnienia domyślne
-- ============================================
INSERT INTO app_permissions (role, resource, can_read, can_write)
VALUES
  ('superadmin', 'module:rooms', true, true),
  ('rada_starszych', 'module:rooms', true, true),
  ('admin', 'module:rooms', true, true),
  ('koordynator', 'module:rooms', true, true),
  ('lider', 'module:rooms', true, false)
ON CONFLICT (role, resource) DO UPDATE SET
  can_read = EXCLUDED.can_read,
  can_write = EXCLUDED.can_write;

-- ============================================
-- Zasoby startowe (jeśli tabela pusta)
-- ============================================
INSERT INTO resources (name, type, capacity, color, location, is_active)
SELECT * FROM (VALUES
  ('Sala główna', 'room', 200, '#3b82f6', 'Parter', true),
  ('Sala konferencyjna', 'room', 30, '#10b981', 'Piętro 1', true),
  ('Sala dziecięca', 'room', 40, '#f59e0b', 'Parter', true),
  ('Rzutnik przenośny', 'equipment', NULL, '#8b5cf6', 'Magazyn', true)
) AS v(name, type, capacity, color, location, is_active)
WHERE NOT EXISTS (SELECT 1 FROM resources);
