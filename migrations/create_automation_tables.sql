-- ============================================
-- MODUŁ AUTOMATYZACJI + ASYMILACJA GOŚCI (Automation)
-- Definiowanie automatyzacji warunkowych (workflow + kroki)
-- oraz dziennik uruchomień. Samo wykonanie kroków realizuje
-- zewnętrzny worker (cron) — tutaj tylko projektowanie i podgląd.
-- ============================================

-- 1. Workflow / automatyzacje
CREATE TABLE IF NOT EXISTS automation_workflows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (trigger_type IN ('new_member','new_guest','birthday','absence','manual','date')),
  trigger_config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  campus_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Kroki (akcje) w ramach workflow
CREATE TABLE IF NOT EXISTS automation_steps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID REFERENCES automation_workflows(id) ON DELETE CASCADE,
  step_order INTEGER DEFAULT 0,
  action_type TEXT NOT NULL DEFAULT 'send_email'
    CHECK (action_type IN ('send_email','send_sms','send_push','create_task','add_tag','wait')),
  action_config JSONB DEFAULT '{}',
  delay_days INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Uruchomienia (dziennik wykonań workflow dla osoby)
CREATE TABLE IF NOT EXISTS automation_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID REFERENCES automation_workflows(id) ON DELETE CASCADE,
  member_id UUID,                            -- luźne powiązanie z members(id)
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending','running','done','failed')),
  current_step INTEGER DEFAULT 0,
  log JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeksy
CREATE INDEX IF NOT EXISTS idx_automation_workflows_active ON automation_workflows(is_active);
CREATE INDEX IF NOT EXISTS idx_automation_workflows_trigger ON automation_workflows(trigger_type);
CREATE INDEX IF NOT EXISTS idx_automation_workflows_campus ON automation_workflows(campus_id);
CREATE INDEX IF NOT EXISTS idx_automation_steps_workflow ON automation_steps(workflow_id, step_order);
CREATE INDEX IF NOT EXISTS idx_automation_runs_workflow ON automation_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_automation_runs_member ON automation_runs(member_id);
CREATE INDEX IF NOT EXISTS idx_automation_runs_status ON automation_runs(status);

-- Trigger updated_at (tylko workflow ma updated_at)
CREATE OR REPLACE FUNCTION update_automation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_automation_workflows_updated ON automation_workflows;
CREATE TRIGGER trg_automation_workflows_updated BEFORE UPDATE ON automation_workflows
  FOR EACH ROW EXECUTE FUNCTION update_automation_updated_at();

-- RLS
ALTER TABLE automation_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['automation_workflows','automation_steps','automation_runs'] LOOP
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
VALUES ('automation', 'Automatyzacje', 'Workflow', '/automation', 'module:automation', 18, true, 'AutomationModule')
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label, icon = EXCLUDED.icon, path = EXCLUDED.path,
  resource_key = EXCLUDED.resource_key, component_name = EXCLUDED.component_name;

-- ============================================
-- Uprawnienia domyślne
-- ============================================
INSERT INTO app_permissions (role, resource, can_read, can_write)
VALUES
  ('superadmin', 'module:automation', true, true),
  ('rada_starszych', 'module:automation', true, true),
  ('admin', 'module:automation', true, true),
  ('koordynator', 'module:automation', true, true),
  ('lider', 'module:automation', true, false)
ON CONFLICT (role, resource) DO UPDATE SET
  can_read = EXCLUDED.can_read,
  can_write = EXCLUDED.can_write;
