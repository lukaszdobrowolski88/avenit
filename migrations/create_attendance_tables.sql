-- ============================================
-- MODUŁ FREKWENCJA DOROSŁYCH (Attendance)
-- Obecność dorosłych na nabożeństwach/spotkaniach/modlitwach
-- (szybka liczba headcount lub imienna lista obecnych)
-- oraz analityka trendów. Uzupełnia istniejący check-in dzieci.
-- ============================================

-- 1. Sesje frekwencji (nabożeństwo / grupa / wydarzenie / modlitwa)
CREATE TABLE IF NOT EXISTS attendance_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT,
  session_date DATE NOT NULL,
  session_type TEXT DEFAULT 'service' CHECK (session_type IN ('service','group','event','prayer')),
  headcount INTEGER,                          -- szybka liczba obecnych (bez listy imiennej)
  note TEXT,
  campus_id INTEGER,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Imienne wpisy obecności
-- member_id: luźne powiązanie z members(id); NULL dla gościa (guest_name).
-- Nie dodajemy twardego FK do members, bo bazowa tabela members mogła powstać
-- poza katalogiem migracji (import ze starego środowiska).
CREATE TABLE IF NOT EXISTS attendance_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  member_id UUID,
  guest_name TEXT,
  present BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeksy
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_date ON attendance_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_type ON attendance_sessions(session_type);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_campus ON attendance_sessions(campus_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_session ON attendance_records(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_member ON attendance_records(member_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_attendance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_attendance_sessions_updated ON attendance_sessions;
CREATE TRIGGER trg_attendance_sessions_updated BEFORE UPDATE ON attendance_sessions
  FOR EACH ROW EXECUTE FUNCTION update_attendance_updated_at();

-- RLS
ALTER TABLE attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['attendance_sessions','attendance_records'] LOOP
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
VALUES ('attendance', 'Frekwencja', 'ClipboardCheck', '/attendance', 'module:attendance', 16, true, 'AttendanceModule')
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label, icon = EXCLUDED.icon, path = EXCLUDED.path,
  resource_key = EXCLUDED.resource_key, component_name = EXCLUDED.component_name;

-- ============================================
-- Uprawnienia domyślne
-- ============================================
INSERT INTO app_permissions (role, resource, can_read, can_write)
VALUES
  ('superadmin', 'module:attendance', true, true),
  ('rada_starszych', 'module:attendance', true, true),
  ('admin', 'module:attendance', true, true),
  ('koordynator', 'module:attendance', true, true),
  ('lider', 'module:attendance', true, false)
ON CONFLICT (role, resource) DO UPDATE SET
  can_read = EXCLUDED.can_read,
  can_write = EXCLUDED.can_write;
