-- ============================================
-- MODUŁ KAZANIA (Sermons)
-- Publiczna dystrybucja kazań (audio/wideo), odtwarzacz
-- oraz odnośniki biblijne. Publiczne archiwum dostępne
-- pod trasą /sermon/:slug (podpięcie w App.jsx po stronie koordynatora).
-- ============================================

-- 1. Kazania
CREATE TABLE IF NOT EXISTS sermons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  speaker TEXT,                              -- mówca / kaznodzieja
  series TEXT,                               -- seria / cykl kazań
  sermon_date DATE,
  scripture_ref TEXT,                        -- odnośnik biblijny, np. „J 3,16"
  description TEXT,
  audio_url TEXT,                            -- bezpośredni link do pliku audio (mp3 itp.)
  video_url TEXT,                            -- YouTube / Vimeo / link do pliku wideo
  notes TEXT,                                -- notatki / konspekt
  slug TEXT,                                 -- identyfikator do trasy publicznej /sermon/:slug
  is_published BOOLEAN DEFAULT false,        -- czy widoczne publicznie
  campus_id INTEGER,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeksy
CREATE INDEX IF NOT EXISTS idx_sermons_date ON sermons(sermon_date);
CREATE INDEX IF NOT EXISTS idx_sermons_published ON sermons(is_published);
CREATE INDEX IF NOT EXISTS idx_sermons_slug ON sermons(slug);
CREATE INDEX IF NOT EXISTS idx_sermons_series ON sermons(series);
CREATE INDEX IF NOT EXISTS idx_sermons_campus ON sermons(campus_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_sermons_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sermons_updated ON sermons;
CREATE TRIGGER trg_sermons_updated BEFORE UPDATE ON sermons
  FOR EACH ROW EXECUTE FUNCTION update_sermons_updated_at();

-- RLS
-- SELECT USING(true): archiwum jest publiczne (potrzebne dla trasy /sermon/:slug bez logowania).
-- Zapis tylko dla zalogowanych.
ALTER TABLE sermons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_sermons" ON sermons;
DROP POLICY IF EXISTS "manage_sermons" ON sermons;
CREATE POLICY "read_sermons" ON sermons FOR SELECT USING (true);
CREATE POLICY "manage_sermons" ON sermons FOR ALL USING (auth.role() = 'authenticated');

-- ============================================
-- Rejestracja modułu w nawigacji
-- ============================================
INSERT INTO app_modules (key, label, icon, path, resource_key, display_order, is_system, component_name)
VALUES ('sermons', 'Kazania', 'Podcast', '/sermons', 'module:sermons', 20, true, 'SermonsModule')
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label, icon = EXCLUDED.icon, path = EXCLUDED.path,
  resource_key = EXCLUDED.resource_key, component_name = EXCLUDED.component_name;

-- ============================================
-- Uprawnienia domyślne
-- ============================================
INSERT INTO app_permissions (role, resource, can_read, can_write)
VALUES
  ('superadmin', 'module:sermons', true, true),
  ('rada_starszych', 'module:sermons', true, true),
  ('admin', 'module:sermons', true, true),
  ('koordynator', 'module:sermons', true, true),
  ('lider', 'module:sermons', true, false)
ON CONFLICT (role, resource) DO UPDATE SET
  can_read = EXCLUDED.can_read,
  can_write = EXCLUDED.can_write;
