-- Push Campaigns: kreator i broadcast push notifications (web + mobile).
-- Idempotentna migracja w stylu pozostałych modułów (mailing, user_task_comments).
--
-- Tabele:
--   push_campaigns              - kampania (draft/scheduled/sending/sent/...)
--   push_campaign_segments      - segmenty odbiorców (all/campus/ministry/home_group/role/custom)
--   push_campaign_actions       - przyciski akcji (deep_link / inline_rsvp / open_form / external_url)
--   push_campaign_recipients    - per-odbiorca status dostarczenia + ticket Expo
--   push_campaign_templates     - zapisane szablony pushy
--   push_campaign_ab_variants   - warianty A/B
--   push_user_preferences       - preferencje użytkownika (quiet hours, opt-out kategorii)

-- ============================================
-- 1. push_campaigns
-- ============================================

CREATE TABLE IF NOT EXISTS push_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID NULL,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  icon TEXT,
  big_image TEXT,
  tag TEXT,
  link TEXT,
  category_id TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  send_mode TEXT NOT NULL DEFAULT 'now'
    CHECK (send_mode IN ('now', 'scheduled', 'smart')),
  scheduled_at TIMESTAMPTZ,
  smart_window_hours INT,
  frequency_cap_per_day INT,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  ab_test_enabled BOOLEAN DEFAULT FALSE,
  ab_winner_metric TEXT CHECK (ab_winner_metric IN ('open_rate', 'action_rate') OR ab_winner_metric IS NULL),
  ab_winner_variant TEXT,
  ab_winner_decided_at TIMESTAMPTZ,
  recipient_count INT DEFAULT 0,
  sent_count INT DEFAULT 0,
  delivered_count INT DEFAULT 0,
  opened_count INT DEFAULT 0,
  action_clicked_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  created_by TEXT REFERENCES app_users(email) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_push_campaigns_status ON push_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_push_campaigns_campus ON push_campaigns(campus_id);
CREATE INDEX IF NOT EXISTS idx_push_campaigns_scheduled ON push_campaigns(scheduled_at)
  WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_push_campaigns_created_by ON push_campaigns(created_by);

-- ============================================
-- 2. push_campaign_segments
-- ============================================

CREATE TABLE IF NOT EXISTS push_campaign_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES push_campaigns(id) ON DELETE CASCADE,
  segment_type TEXT NOT NULL
    CHECK (segment_type IN ('all', 'campus', 'ministry', 'home_group', 'role', 'custom_email', 'tag', 'active_users', 'program_kids')),
  segment_id TEXT,
  segment_name TEXT,
  exclude BOOLEAN DEFAULT FALSE,
  emails TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_campaign_segments_campaign ON push_campaign_segments(campaign_id);

-- ============================================
-- 3. push_campaign_actions
-- ============================================

CREATE TABLE IF NOT EXISTS push_campaign_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES push_campaigns(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  label TEXT NOT NULL,
  action_type TEXT NOT NULL
    CHECK (action_type IN ('deep_link', 'inline_rsvp', 'open_form', 'external_url')),
  action_value TEXT,
  destructive BOOLEAN DEFAULT FALSE,
  authentication_required BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_campaign_actions_campaign ON push_campaign_actions(campaign_id, position);

-- ============================================
-- 4. push_campaign_recipients
-- ============================================

CREATE TABLE IF NOT EXISTS push_campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES push_campaigns(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  full_name TEXT,
  variant TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'queued', 'sent', 'delivered', 'opened', 'action_clicked', 'failed', 'suppressed')),
  channels JSONB DEFAULT '{"web": null, "mobile": null}'::jsonb,
  expo_tickets JSONB DEFAULT '[]'::jsonb,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  action_clicked_at TIMESTAMPTZ,
  action_id UUID REFERENCES push_campaign_actions(id) ON DELETE SET NULL,
  error TEXT,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, user_email)
);

CREATE INDEX IF NOT EXISTS idx_push_campaign_recipients_campaign ON push_campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_push_campaign_recipients_status ON push_campaign_recipients(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_push_campaign_recipients_email ON push_campaign_recipients(user_email);

-- ============================================
-- 5. push_campaign_templates
-- ============================================

CREATE TABLE IF NOT EXISTS push_campaign_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  icon TEXT,
  category_id TEXT,
  default_actions JSONB DEFAULT '[]'::jsonb,
  is_system BOOLEAN DEFAULT FALSE,
  created_by TEXT REFERENCES app_users(email) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_campaign_templates_campus ON push_campaign_templates(campus_id);
-- Częściowy unique: szablony systemowe mają unikalne nazwy (chroni przed duplikatami przy re-runie migracji).
CREATE UNIQUE INDEX IF NOT EXISTS uq_push_campaign_templates_system_name
  ON push_campaign_templates(name) WHERE is_system = TRUE;

-- ============================================
-- 6. push_campaign_ab_variants
-- ============================================

CREATE TABLE IF NOT EXISTS push_campaign_ab_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES push_campaigns(id) ON DELETE CASCADE,
  variant TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  share_percent INT NOT NULL DEFAULT 50 CHECK (share_percent BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, variant)
);

CREATE INDEX IF NOT EXISTS idx_push_campaign_ab_variants_campaign ON push_campaign_ab_variants(campaign_id);

-- ============================================
-- 7. push_user_preferences
-- ============================================

CREATE TABLE IF NOT EXISTS push_user_preferences (
  user_email TEXT PRIMARY KEY,
  enabled BOOLEAN DEFAULT TRUE,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  timezone TEXT DEFAULT 'Europe/Warsaw',
  category_opt_outs TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 8. Trigger updated_at (per-tabela, konwencja appschtomy)
-- ============================================

CREATE OR REPLACE FUNCTION update_push_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_push_campaigns_updated_at ON push_campaigns;
CREATE TRIGGER trigger_update_push_campaigns_updated_at
  BEFORE UPDATE ON push_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_push_campaigns_updated_at();

DROP TRIGGER IF EXISTS trigger_update_push_campaign_templates_updated_at ON push_campaign_templates;
CREATE TRIGGER trigger_update_push_campaign_templates_updated_at
  BEFORE UPDATE ON push_campaign_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_push_campaigns_updated_at();

DROP TRIGGER IF EXISTS trigger_update_push_user_preferences_updated_at ON push_user_preferences;
CREATE TRIGGER trigger_update_push_user_preferences_updated_at
  BEFORE UPDATE ON push_user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_push_campaigns_updated_at();

-- ============================================
-- 9. Funkcja agregująca statystyki kampanii
-- ============================================

CREATE OR REPLACE FUNCTION update_push_campaign_stats(p_campaign_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE push_campaigns
  SET
    recipient_count       = (SELECT COUNT(*) FROM push_campaign_recipients WHERE campaign_id = p_campaign_id),
    sent_count            = (SELECT COUNT(*) FROM push_campaign_recipients WHERE campaign_id = p_campaign_id AND status IN ('sent','delivered','opened','action_clicked')),
    delivered_count       = (SELECT COUNT(*) FROM push_campaign_recipients WHERE campaign_id = p_campaign_id AND status IN ('delivered','opened','action_clicked')),
    opened_count          = (SELECT COUNT(*) FROM push_campaign_recipients WHERE campaign_id = p_campaign_id AND status IN ('opened','action_clicked')),
    action_clicked_count  = (SELECT COUNT(*) FROM push_campaign_recipients WHERE campaign_id = p_campaign_id AND status = 'action_clicked'),
    failed_count          = (SELECT COUNT(*) FROM push_campaign_recipients WHERE campaign_id = p_campaign_id AND status = 'failed'),
    updated_at            = NOW()
  WHERE id = p_campaign_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 10. RLS
-- ============================================

ALTER TABLE push_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_campaign_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_campaign_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_campaign_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_campaign_ab_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_campaigns_admin_all" ON push_campaigns;
CREATE POLICY "push_campaigns_admin_all" ON push_campaigns
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE email = auth.jwt() ->> 'email'
      AND role IN ('superadmin', 'admin', 'rada_starszych')
    )
  );

DROP POLICY IF EXISTS "push_campaign_segments_admin_all" ON push_campaign_segments;
CREATE POLICY "push_campaign_segments_admin_all" ON push_campaign_segments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE email = auth.jwt() ->> 'email'
      AND role IN ('superadmin', 'admin', 'rada_starszych')
    )
  );

DROP POLICY IF EXISTS "push_campaign_actions_admin_all" ON push_campaign_actions;
CREATE POLICY "push_campaign_actions_admin_all" ON push_campaign_actions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE email = auth.jwt() ->> 'email'
      AND role IN ('superadmin', 'admin', 'rada_starszych')
    )
  );

-- Recipients widzą tylko admini (analytics).
DROP POLICY IF EXISTS "push_campaign_recipients_admin_select" ON push_campaign_recipients;
CREATE POLICY "push_campaign_recipients_admin_select" ON push_campaign_recipients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE email = auth.jwt() ->> 'email'
      AND role IN ('superadmin', 'admin', 'rada_starszych')
    )
  );

-- INSERT/UPDATE/DELETE w recipients tylko service_role (edge functions).

DROP POLICY IF EXISTS "push_campaign_templates_admin_all" ON push_campaign_templates;
CREATE POLICY "push_campaign_templates_admin_all" ON push_campaign_templates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE email = auth.jwt() ->> 'email'
      AND role IN ('superadmin', 'admin', 'rada_starszych')
    )
  );

DROP POLICY IF EXISTS "push_campaign_ab_variants_admin_all" ON push_campaign_ab_variants;
CREATE POLICY "push_campaign_ab_variants_admin_all" ON push_campaign_ab_variants
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE email = auth.jwt() ->> 'email'
      AND role IN ('superadmin', 'admin', 'rada_starszych')
    )
  );

-- User widzi i edytuje TYLKO swoje preferences.
DROP POLICY IF EXISTS "push_user_preferences_self_select" ON push_user_preferences;
CREATE POLICY "push_user_preferences_self_select" ON push_user_preferences
  FOR SELECT USING (user_email = auth.jwt() ->> 'email');

DROP POLICY IF EXISTS "push_user_preferences_self_upsert" ON push_user_preferences;
CREATE POLICY "push_user_preferences_self_upsert" ON push_user_preferences
  FOR INSERT WITH CHECK (user_email = auth.jwt() ->> 'email');

DROP POLICY IF EXISTS "push_user_preferences_self_update" ON push_user_preferences;
CREATE POLICY "push_user_preferences_self_update" ON push_user_preferences
  FOR UPDATE USING (user_email = auth.jwt() ->> 'email');

-- Service role ma pełen dostęp do wszystkich tabel kampanii.
GRANT ALL ON push_campaigns, push_campaign_segments, push_campaign_actions,
              push_campaign_recipients, push_campaign_templates,
              push_campaign_ab_variants, push_user_preferences TO service_role;

-- ============================================
-- 11. Powiązanie z notifications (inbox) — opcjonalne pole campaign_id
-- ============================================

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS push_campaign_id UUID
  REFERENCES push_campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_push_campaign ON notifications(push_campaign_id)
  WHERE push_campaign_id IS NOT NULL;

-- ============================================
-- 12. Rejestracja modułu w app_modules + uprawnienia
-- ============================================

INSERT INTO app_modules (key, label, path, icon, resource_key, display_order, is_enabled)
VALUES ('push_campaigns', 'Push Kampanie', '/push-campaigns', 'Bell', 'module:push_campaigns', 16, true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_permissions (role, resource, can_read, can_write)
VALUES
  ('superadmin', 'module:push_campaigns', true, true),
  ('admin', 'module:push_campaigns', true, true),
  ('rada_starszych', 'module:push_campaigns', true, true)
ON CONFLICT (role, resource) DO UPDATE SET
  can_read = EXCLUDED.can_read,
  can_write = EXCLUDED.can_write;

-- ============================================
-- 13. Domyślne szablony systemowe
-- ============================================

INSERT INTO push_campaign_templates (name, title, body, category_id, default_actions, is_system, created_by)
VALUES
  ('Pusty', 'Tytuł powiadomienia', 'Treść powiadomienia...', 'cm_open_link', '[]'::jsonb, true, NULL),
  ('Ogłoszenie', 'Ważne ogłoszenie', 'Krótka treść ogłoszenia.', 'cm_open_link', '[{"label":"Otwórz","action_type":"deep_link","action_value":"/announcements"}]'::jsonb, true, NULL),
  ('Przypomnienie o wydarzeniu', 'Wydarzenie wkrótce', 'Pamiętaj o nadchodzącym wydarzeniu.', 'cm_rsvp_yes_no', '[{"label":"Potwierdzam","action_type":"inline_rsvp","action_value":"yes"},{"label":"Nie mogę","action_type":"inline_rsvp","action_value":"no"}]'::jsonb, true, NULL),
  ('Nowy formularz', 'Wypełnij formularz', 'Mamy dla Ciebie krótki formularz.', 'cm_form', '[{"label":"Wypełnij","action_type":"open_form","action_value":""},{"label":"Później","action_type":"deep_link","action_value":"/"}]'::jsonb, true, NULL)
ON CONFLICT (name) WHERE is_system = TRUE DO NOTHING;
