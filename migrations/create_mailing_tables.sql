-- ============================================
-- MAILING MODULE TABLES
-- ============================================

-- Tabela szablonów email
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  json_design JSONB, -- dla edytora drag & drop (opcjonalne)
  thumbnail_url TEXT,
  category TEXT DEFAULT 'general', -- 'newsletter', 'event', 'announcement', 'general'
  is_system BOOLEAN DEFAULT false, -- szablony systemowe (nieusuwalne)
  created_by TEXT REFERENCES app_users(email),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela kampanii email
CREATE TABLE IF NOT EXISTS email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'draft', -- 'draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled'
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_by TEXT REFERENCES app_users(email),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Statystyki kampanii
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  opened_count INTEGER DEFAULT 0,
  clicked_count INTEGER DEFAULT 0,
  bounced_count INTEGER DEFAULT 0,
  unsubscribed_count INTEGER DEFAULT 0
);

-- Tabela odbiorców kampanii
CREATE TABLE IF NOT EXISTS email_campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES email_campaigns(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'unsubscribed'
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(campaign_id, email)
);

-- Tabela segmentów odbiorców (jakie grupy/służby zostały wybrane)
CREATE TABLE IF NOT EXISTS email_recipient_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES email_campaigns(id) ON DELETE CASCADE,
  segment_type TEXT NOT NULL, -- 'all', 'ministry', 'home_group', 'role', 'custom'
  segment_id UUID, -- id grupy/służby (null dla 'all' i 'custom')
  segment_name TEXT, -- nazwa dla wyświetlania
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela osób wypisanych z newslettera
CREATE TABLE IF NOT EXISTS email_unsubscribes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  reason TEXT,
  campaign_id UUID REFERENCES email_campaigns(id) ON DELETE SET NULL, -- z jakiej kampanii się wypisał
  unsubscribed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEKSY
-- ============================================

CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_created_by ON email_campaigns(created_by);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_scheduled_at ON email_campaigns(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_campaign ON email_campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_status ON email_campaign_recipients(status);
CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_email ON email_campaign_recipients(email);
CREATE INDEX IF NOT EXISTS idx_email_templates_category ON email_templates(category);
CREATE INDEX IF NOT EXISTS idx_email_recipient_segments_campaign ON email_recipient_segments(campaign_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_recipient_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_unsubscribes ENABLE ROW LEVEL SECURITY;

-- Szablony - wszyscy mogą czytać, tylko admini mogą edytować
CREATE POLICY "Anyone can view email templates" ON email_templates
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage email templates" ON email_templates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE email = auth.jwt()->>'email'
      AND role IN ('superadmin', 'admin', 'rada_starszych')
    )
  );

-- Kampanie - wszyscy mogą czytać, tylko admini mogą edytować
CREATE POLICY "Anyone can view email campaigns" ON email_campaigns
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage email campaigns" ON email_campaigns
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE email = auth.jwt()->>'email'
      AND role IN ('superadmin', 'admin', 'rada_starszych')
    )
  );

-- Odbiorcy kampanii - tylko admini
CREATE POLICY "Admins can view campaign recipients" ON email_campaign_recipients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE email = auth.jwt()->>'email'
      AND role IN ('superadmin', 'admin', 'rada_starszych')
    )
  );

CREATE POLICY "Admins can manage campaign recipients" ON email_campaign_recipients
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE email = auth.jwt()->>'email'
      AND role IN ('superadmin', 'admin', 'rada_starszych')
    )
  );

-- Segmenty - tylko admini
CREATE POLICY "Admins can view recipient segments" ON email_recipient_segments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE email = auth.jwt()->>'email'
      AND role IN ('superadmin', 'admin', 'rada_starszych')
    )
  );

CREATE POLICY "Admins can manage recipient segments" ON email_recipient_segments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE email = auth.jwt()->>'email'
      AND role IN ('superadmin', 'admin', 'rada_starszych')
    )
  );

-- Unsubscribes - tylko admini mogą czytać, każdy może się wypisać
CREATE POLICY "Admins can view unsubscribes" ON email_unsubscribes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE email = auth.jwt()->>'email'
      AND role IN ('superadmin', 'admin', 'rada_starszych')
    )
  );

CREATE POLICY "Anyone can unsubscribe" ON email_unsubscribes
  FOR INSERT WITH CHECK (true);

-- ============================================
-- FUNKCJE POMOCNICZE
-- ============================================

-- Funkcja do aktualizacji statystyk kampanii
CREATE OR REPLACE FUNCTION update_campaign_stats(p_campaign_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE email_campaigns
  SET
    total_recipients = (SELECT COUNT(*) FROM email_campaign_recipients WHERE campaign_id = p_campaign_id),
    sent_count = (SELECT COUNT(*) FROM email_campaign_recipients WHERE campaign_id = p_campaign_id AND status IN ('sent', 'delivered', 'opened', 'clicked')),
    delivered_count = (SELECT COUNT(*) FROM email_campaign_recipients WHERE campaign_id = p_campaign_id AND status IN ('delivered', 'opened', 'clicked')),
    opened_count = (SELECT COUNT(*) FROM email_campaign_recipients WHERE campaign_id = p_campaign_id AND status IN ('opened', 'clicked')),
    clicked_count = (SELECT COUNT(*) FROM email_campaign_recipients WHERE campaign_id = p_campaign_id AND status = 'clicked'),
    bounced_count = (SELECT COUNT(*) FROM email_campaign_recipients WHERE campaign_id = p_campaign_id AND status = 'bounced'),
    unsubscribed_count = (SELECT COUNT(*) FROM email_campaign_recipients WHERE campaign_id = p_campaign_id AND status = 'unsubscribed'),
    updated_at = NOW()
  WHERE id = p_campaign_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger do automatycznej aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_email_templates_updated_at') THEN
    CREATE TRIGGER update_email_templates_updated_at
      BEFORE UPDATE ON email_templates
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_email_campaigns_updated_at') THEN
    CREATE TRIGGER update_email_campaigns_updated_at
      BEFORE UPDATE ON email_campaigns
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ============================================
-- DOMYŚLNE SZABLONY SYSTEMOWE
-- ============================================

INSERT INTO email_templates (name, subject, html_content, category, is_system, created_by)
VALUES
(
  'Pusty szablon',
  'Temat wiadomości',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 20px 0; }
    .content { padding: 20px 0; }
    .footer { text-align: center; padding: 20px 0; font-size: 12px; color: #666; border-top: 1px solid #eee; }
    .button { display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #ec4899, #f97316); color: white; text-decoration: none; border-radius: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Nagłówek</h1>
    </div>
    <div class="content">
      <p>Drogi {{imie}},</p>
      <p>Treść wiadomości...</p>
    </div>
    <div class="footer">
      <p>Z błogosławieństwem,<br>Twój Kościół</p>
      <p><a href="{{unsubscribe_url}}">Wypisz się z newslettera</a></p>
    </div>
  </div>
</body>
</html>',
  'general',
  true,
  NULL
),
(
  'Newsletter',
  'Newsletter - {{data}}',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; }
    .header { background: linear-gradient(135deg, #ec4899, #f97316); color: white; text-align: center; padding: 30px 20px; }
    .header h1 { margin: 0; font-size: 28px; }
    .content { padding: 30px 20px; }
    .section { margin-bottom: 25px; }
    .section h2 { color: #ec4899; font-size: 20px; margin-bottom: 10px; }
    .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; background: #f9f9f9; }
    .button { display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #ec4899, #f97316); color: white; text-decoration: none; border-radius: 8px; margin: 10px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Newsletter Kościoła</h1>
      <p>{{data}}</p>
    </div>
    <div class="content">
      <p>Drogi {{imie}},</p>

      <div class="section">
        <h2>Nadchodzące wydarzenia</h2>
        <p>Informacje o wydarzeniach...</p>
      </div>

      <div class="section">
        <h2>Ogłoszenia</h2>
        <p>Ważne ogłoszenia...</p>
      </div>

      <div class="section">
        <h2>Słowo na dziś</h2>
        <p><em>"Cytat biblijny..."</em></p>
      </div>

      <p style="text-align: center;">
        <a href="#" class="button">Odwiedź naszą stronę</a>
      </p>
    </div>
    <div class="footer">
      <p>Z błogosławieństwem,<br>Twój Kościół</p>
      <p><a href="{{unsubscribe_url}}">Wypisz się z newslettera</a></p>
    </div>
  </div>
</body>
</html>',
  'newsletter',
  true,
  NULL
),
(
  'Zaproszenie na wydarzenie',
  'Zaproszenie: {{event_name}}',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; }
    .header { background: linear-gradient(135deg, #8b5cf6, #ec4899); color: white; text-align: center; padding: 40px 20px; }
    .header h1 { margin: 0; font-size: 32px; }
    .event-details { background: #f9f9f9; padding: 25px; margin: 20px; border-radius: 12px; }
    .event-details p { margin: 8px 0; }
    .event-details strong { color: #8b5cf6; }
    .content { padding: 20px 30px; }
    .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
    .button { display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #8b5cf6, #ec4899); color: white; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Zapraszamy!</h1>
      <p style="font-size: 18px; margin-top: 10px;">{{event_name}}</p>
    </div>
    <div class="content">
      <p>Drogi {{imie}},</p>
      <p>Serdecznie zapraszamy Cię na wyjątkowe wydarzenie w naszym kościele!</p>

      <div class="event-details">
        <p><strong>Data:</strong> [Data wydarzenia]</p>
        <p><strong>Godzina:</strong> [Godzina]</p>
        <p><strong>Miejsce:</strong> [Adres]</p>
      </div>

      <p>Opis wydarzenia...</p>

      <p style="text-align: center; margin: 30px 0;">
        <a href="#" class="button">Zapisz się teraz</a>
      </p>

      <p>Do zobaczenia!</p>
    </div>
    <div class="footer">
      <p>Z błogosławieństwem,<br>Twój Kościół</p>
      <p><a href="{{unsubscribe_url}}">Wypisz się z newslettera</a></p>
    </div>
  </div>
</body>
</html>',
  'event',
  true,
  NULL
),
(
  'Ogłoszenie',
  'Ważne ogłoszenie',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .alert-box { background: linear-gradient(135deg, #fef3c7, #fde68a); border-left: 4px solid #f59e0b; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0; }
    .content { padding: 20px 0; }
    .footer { text-align: center; padding: 20px 0; font-size: 12px; color: #666; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Ważne ogłoszenie</h1>

    <div class="content">
      <p>Drogi {{imie}},</p>

      <div class="alert-box">
        <p><strong>Treść ogłoszenia...</strong></p>
      </div>

      <p>Dodatkowe informacje...</p>
    </div>

    <div class="footer">
      <p>Z błogosławieństwem,<br>Twój Kościół</p>
      <p><a href="{{unsubscribe_url}}">Wypisz się z newslettera</a></p>
    </div>
  </div>
</body>
</html>',
  'announcement',
  true,
  NULL
)
ON CONFLICT DO NOTHING;

-- ============================================
-- DODANIE MODUŁU MAILING DO APP_MODULES
-- ============================================

INSERT INTO app_modules (key, label, path, icon, resource_key, display_order, is_enabled)
VALUES ('mailing', 'Mailing', '/mailing', 'Mail', 'module:mailing', 15, true)
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- DODANIE UPRAWNIEŃ DLA MODUŁU MAILING
-- ============================================

-- Superadmin i admin mają pełne uprawnienia
INSERT INTO app_permissions (role, resource, can_read, can_write)
VALUES
  ('superadmin', 'module:mailing', true, true),
  ('admin', 'module:mailing', true, true),
  ('rada_starszych', 'module:mailing', true, true)
ON CONFLICT (role, resource) DO UPDATE SET
  can_read = EXCLUDED.can_read,
  can_write = EXCLUDED.can_write;
