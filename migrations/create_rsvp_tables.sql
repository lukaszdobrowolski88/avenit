-- ============================================
-- RSVP / PRE-CHECK-IN — potwierdzanie obecności
-- Wyślij zaproszenie (push/e-mail/SMS) z linkiem „Będę / Nie będę"; odbiorca
-- klika, a odpowiedź zapisuje się przy jego zaproszeniu. Uniwersalne: nabożeństwa,
-- grupy domowe, szkółka niedzielna, wydarzenia, spotkania służb.
-- ============================================

-- 1. Kampania zaproszeń (jedno wydarzenie / okazja)
CREATE TABLE IF NOT EXISTS rsvp_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT DEFAULT 'event',          -- event/home_group/kids/service/custom
  event_ref_id UUID,                         -- opcjonalne powiązanie z wydarzeniem/grupą
  event_date DATE,
  event_time TEXT,
  location TEXT,
  channels JSONB DEFAULT '["push"]',         -- kanały wysyłki: push/email/sms
  message TEXT,                              -- treść zaproszenia
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','sending','sent')),
  sent_at TIMESTAMPTZ,
  created_by TEXT,
  campus_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Zaproszenie pojedynczej osoby (+ jej odpowiedź)
CREATE TABLE IF NOT EXISTS rsvp_invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES rsvp_campaigns(id) ON DELETE CASCADE,
  member_id UUID,
  name TEXT,
  email TEXT,
  phone TEXT,
  token TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','yes','no','maybe')),
  guests_count INTEGER DEFAULT 0,            -- ile osób towarzyszących (np. rodzina)
  responded_at TIMESTAMPTZ,
  sent_channels JSONB DEFAULT '[]',
  campus_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rsvp_inv_campaign ON rsvp_invitations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_rsvp_inv_token ON rsvp_invitations(token);
CREATE INDEX IF NOT EXISTS idx_rsvp_inv_status ON rsvp_invitations(status);
CREATE INDEX IF NOT EXISTS idx_rsvp_campaigns_campus ON rsvp_campaigns(campus_id);

-- Trigger updated_at (kampanie)
CREATE OR REPLACE FUNCTION update_rsvp_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_rsvp_campaigns_updated ON rsvp_campaigns;
CREATE TRIGGER trg_rsvp_campaigns_updated BEFORE UPDATE ON rsvp_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_rsvp_updated_at();

-- RLS
ALTER TABLE rsvp_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE rsvp_invitations ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['rsvp_campaigns','rsvp_invitations'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "read_%1$s" ON %1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS "manage_%1$s" ON %1$s', t);
    EXECUTE format('CREATE POLICY "read_%1$s" ON %1$s FOR SELECT USING (true)', t);
    EXECUTE format('CREATE POLICY "manage_%1$s" ON %1$s FOR ALL USING (auth.role() = ''authenticated'')', t);
  END LOOP;
END $$;

-- Rejestracja modułu (personel). Trasa /rsvp; publiczna odpowiedź to /rsvp/:token.
INSERT INTO app_modules (key, label, icon, path, resource_key, display_order, is_system, component_name)
VALUES ('rsvp', 'Obecność (RSVP)', 'CalendarCheck', '/rsvp', 'module:rsvp', 23, true, 'RsvpModule')
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label, icon = EXCLUDED.icon, path = EXCLUDED.path,
  resource_key = EXCLUDED.resource_key, component_name = EXCLUDED.component_name;

INSERT INTO app_permissions (role, resource, can_read, can_write)
VALUES
  ('superadmin', 'module:rsvp', true, true),
  ('rada_starszych', 'module:rsvp', true, true),
  ('admin', 'module:rsvp', true, true),
  ('koordynator', 'module:rsvp', true, true),
  ('lider', 'module:rsvp', true, true)
ON CONFLICT (role, resource) DO UPDATE SET
  can_read = EXCLUDED.can_read, can_write = EXCLUDED.can_write;
