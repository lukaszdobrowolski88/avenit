-- ============================================
-- MODUŁ OPIEKA I CRM (Care)
-- Warstwa duszpasterska/CRM nad istniejącą tabelą members:
-- tagi, notatki, log opieki (kontakty), kamienie milowe,
-- definicje pól własnych i ich wartości per członek.
-- Nie modyfikuje tabeli members ani modułu Members.
-- member_id: luźne powiązanie z members(id) — bez twardego FK,
-- bo members mogła powstać poza katalogiem migracji (import).
-- ============================================

-- 1. Kolorowe tagi przypisane do członka
CREATE TABLE IF NOT EXISTS member_tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID NOT NULL,
  tag TEXT NOT NULL,
  color TEXT DEFAULT '#10b981',
  campus_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Notatki duszpasterskie
CREATE TABLE IF NOT EXISTS member_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID NOT NULL,
  author_email TEXT,
  body TEXT NOT NULL,
  campus_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Log opieki (kontakty: wizyta/telefon/email/modlitwa/spotkanie)
CREATE TABLE IF NOT EXISTS member_care_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID NOT NULL,
  care_type TEXT NOT NULL DEFAULT 'wizyta'
    CHECK (care_type IN ('wizyta','telefon','email','modlitwa','spotkanie')),
  note TEXT,
  care_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by TEXT,
  campus_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Kamienie milowe (nawrócenie/chrzest/członkostwo/ślub/inne)
CREATE TABLE IF NOT EXISTS member_milestones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID NOT NULL,
  milestone_type TEXT NOT NULL DEFAULT 'inne'
    CHECK (milestone_type IN ('nawrócenie','chrzest','członkostwo','ślub','inne')),
  milestone_date DATE,
  note TEXT,
  campus_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Definicje pól własnych (globalne, wspólne dla wszystkich członków)
CREATE TABLE IF NOT EXISTS member_custom_fields (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  field_key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text'
    CHECK (field_type IN ('text','number','date','select')),
  options JSONB DEFAULT '[]',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Wartości pól własnych per członek
CREATE TABLE IF NOT EXISTS member_custom_values (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID NOT NULL,
  field_key TEXT NOT NULL,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (member_id, field_key)
);

-- Indeksy
CREATE INDEX IF NOT EXISTS idx_member_tags_member ON member_tags(member_id);
CREATE INDEX IF NOT EXISTS idx_member_tags_campus ON member_tags(campus_id);
CREATE INDEX IF NOT EXISTS idx_member_notes_member ON member_notes(member_id);
CREATE INDEX IF NOT EXISTS idx_member_notes_campus ON member_notes(campus_id);
CREATE INDEX IF NOT EXISTS idx_member_care_log_member ON member_care_log(member_id);
CREATE INDEX IF NOT EXISTS idx_member_care_log_date ON member_care_log(care_date);
CREATE INDEX IF NOT EXISTS idx_member_care_log_campus ON member_care_log(campus_id);
CREATE INDEX IF NOT EXISTS idx_member_milestones_member ON member_milestones(member_id);
CREATE INDEX IF NOT EXISTS idx_member_milestones_campus ON member_milestones(campus_id);
CREATE INDEX IF NOT EXISTS idx_member_custom_fields_sort ON member_custom_fields(sort_order);
CREATE INDEX IF NOT EXISTS idx_member_custom_values_member ON member_custom_values(member_id);
CREATE INDEX IF NOT EXISTS idx_member_custom_values_key ON member_custom_values(field_key);

-- Trigger updated_at (dla member_custom_values)
CREATE OR REPLACE FUNCTION update_crm_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_member_custom_values_updated ON member_custom_values;
CREATE TRIGGER trg_member_custom_values_updated BEFORE UPDATE ON member_custom_values
  FOR EACH ROW EXECUTE FUNCTION update_crm_updated_at();

-- RLS
ALTER TABLE member_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_care_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_custom_values ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'member_tags','member_notes','member_care_log',
    'member_milestones','member_custom_fields','member_custom_values'
  ] LOOP
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
VALUES ('care', 'Opieka i CRM', 'HeartPulse', '/care', 'module:care', 15, true, 'CareModule')
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label, icon = EXCLUDED.icon, path = EXCLUDED.path,
  resource_key = EXCLUDED.resource_key, component_name = EXCLUDED.component_name;

-- ============================================
-- Uprawnienia domyślne
-- ============================================
INSERT INTO app_permissions (role, resource, can_read, can_write)
VALUES
  ('superadmin', 'module:care', true, true),
  ('rada_starszych', 'module:care', true, true),
  ('admin', 'module:care', true, true),
  ('koordynator', 'module:care', true, true),
  ('lider', 'module:care', true, false)
ON CONFLICT (role, resource) DO UPDATE SET
  can_read = EXCLUDED.can_read,
  can_write = EXCLUDED.can_write;
