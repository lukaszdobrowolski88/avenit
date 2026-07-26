-- ============================================
-- MODUŁ SŁUŻBY (Serve)
-- Samoobsługowa niedostępność wolontariuszy (blockout)
-- oraz ewidencja wykonań pieśni do raportu CCLI.
-- ============================================

-- 1. Niedostępności wolontariuszy (blockout)
-- member_id: luźne powiązanie z members(id); bez twardego FK, bo members
-- mogło powstać poza katalogiem migracji (import ze starego środowiska).
CREATE TABLE IF NOT EXISTS volunteer_blockouts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  campus_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Ewidencja wykonań pieśni (raport CCLI)
-- song_id: luźne powiązanie z songs(id); program_id: opcjonalne powiązanie z programs(id).
CREATE TABLE IF NOT EXISTS song_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  song_id UUID,
  program_id UUID,
  used_date DATE NOT NULL,
  ccli_number TEXT,
  note TEXT,
  campus_id INTEGER,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeksy
CREATE INDEX IF NOT EXISTS idx_volunteer_blockouts_member ON volunteer_blockouts(member_id);
CREATE INDEX IF NOT EXISTS idx_volunteer_blockouts_dates ON volunteer_blockouts(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_volunteer_blockouts_campus ON volunteer_blockouts(campus_id);
CREATE INDEX IF NOT EXISTS idx_song_usage_song ON song_usage(song_id);
CREATE INDEX IF NOT EXISTS idx_song_usage_program ON song_usage(program_id);
CREATE INDEX IF NOT EXISTS idx_song_usage_date ON song_usage(used_date);
CREATE INDEX IF NOT EXISTS idx_song_usage_campus ON song_usage(campus_id);

-- RLS
ALTER TABLE volunteer_blockouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE song_usage ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['volunteer_blockouts','song_usage'] LOOP
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
VALUES ('serve', 'Służba', 'CalendarCheck', '/serve', 'module:serve', 22, true, 'ServeModule')
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label, icon = EXCLUDED.icon, path = EXCLUDED.path,
  resource_key = EXCLUDED.resource_key, component_name = EXCLUDED.component_name;

-- ============================================
-- Uprawnienia domyślne
-- ============================================
INSERT INTO app_permissions (role, resource, can_read, can_write)
VALUES
  ('superadmin', 'module:serve', true, true),
  ('rada_starszych', 'module:serve', true, true),
  ('admin', 'module:serve', true, true),
  ('koordynator', 'module:serve', true, true),
  ('lider', 'module:serve', true, false)
ON CONFLICT (role, resource) DO UPDATE SET
  can_read = EXCLUDED.can_read,
  can_write = EXCLUDED.can_write;
