-- ============================================
-- MODUŁ AI (Asystent oparty na Claude)
-- Historia konwersacji z asystentem AI oraz rejestracja modułu w nawigacji.
-- ============================================

-- 1. Historia konwersacji z asystentem AI
CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT,
  task TEXT,
  input TEXT,
  result TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations(user_email);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_created ON ai_conversations(created_at);

-- RLS
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['ai_conversations'] LOOP
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
VALUES ('ai', 'Asystent AI', 'Sparkles', '/ai', 'module:ai', 19, true, 'AiAssistantModule')
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label, icon = EXCLUDED.icon, path = EXCLUDED.path,
  resource_key = EXCLUDED.resource_key, component_name = EXCLUDED.component_name;

-- ============================================
-- Uprawnienia domyślne
-- ============================================
INSERT INTO app_permissions (role, resource, can_read, can_write)
VALUES
  ('superadmin', 'module:ai', true, true),
  ('rada_starszych', 'module:ai', true, true),
  ('admin', 'module:ai', true, true),
  ('koordynator', 'module:ai', true, true),
  ('lider', 'module:ai', true, false)
ON CONFLICT (role, resource) DO UPDATE SET
  can_read = EXCLUDED.can_read,
  can_write = EXCLUDED.can_write;
