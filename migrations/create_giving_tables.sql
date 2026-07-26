-- ============================================
-- MODUŁ DAWANIA (Giving)
-- Darowizny per członek, dawanie cykliczne, kampanie/pledge,
-- fundusze/cele oraz zestawienia roczne do odpisu (PIT).
-- ============================================

-- 1. Fundusze / cele darowizn
CREATE TABLE IF NOT EXISTS giving_funds (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#10b981',
  is_active BOOLEAN DEFAULT true,
  is_tax_deductible BOOLEAN DEFAULT true,   -- czy wliczać do zestawienia PIT / odpisu
  sort_order INTEGER DEFAULT 0,
  campus_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Kampanie zbiórkowe / pledge
CREATE TABLE IF NOT EXISTS giving_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  goal_amount NUMERIC(12,2) DEFAULT 0,
  fund_id UUID REFERENCES giving_funds(id) ON DELETE SET NULL,
  start_date DATE,
  end_date DATE,
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  campus_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Deklaracje (pledge) w ramach kampanii
CREATE TABLE IF NOT EXISTS giving_pledges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES giving_campaigns(id) ON DELETE CASCADE,
  member_id UUID,                            -- luźne powiązanie z members(id)
  donor_name TEXT,
  pledge_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  note TEXT,
  campus_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Plany cyklicznego dawania
CREATE TABLE IF NOT EXISTS giving_recurring (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID,                            -- luźne powiązanie z members(id)
  donor_name TEXT,
  fund_id UUID REFERENCES giving_funds(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT DEFAULT 'PLN',
  frequency TEXT DEFAULT 'monthly' CHECK (frequency IN ('weekly','biweekly','monthly','quarterly','yearly')),
  day_of_month INTEGER,
  method TEXT DEFAULT 'transfer',
  start_date DATE DEFAULT CURRENT_DATE,
  end_date DATE,
  next_run_date DATE,
  is_active BOOLEAN DEFAULT true,
  campus_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Darowizny (dary)
-- member_id: luźne powiązanie z members(id); NULL dla darczyńcy spoza bazy.
-- Nie dodajemy twardego FK do members, bo bazowa tabela members mogła powstać
-- poza katalogiem migracji (import ze starego środowiska).
CREATE TABLE IF NOT EXISTS donations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID,
  donor_name TEXT,                           -- dla darczyńcy niebędącego członkiem
  donor_email TEXT,
  donor_address TEXT,                        -- adres do zestawienia PIT
  fund_id UUID REFERENCES giving_funds(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES giving_campaigns(id) ON DELETE SET NULL,
  recurring_id UUID REFERENCES giving_recurring(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT DEFAULT 'PLN',
  donation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  method TEXT DEFAULT 'cash' CHECK (method IN ('cash','transfer','card','blik','online','przelewy24','paypal','other')),
  status TEXT DEFAULT 'completed' CHECK (status IN ('completed','pending','failed','refunded')),
  is_recurring BOOLEAN DEFAULT false,
  is_anonymous BOOLEAN DEFAULT false,
  receipt_number TEXT,
  payment_transaction_id UUID,
  note TEXT,
  campus_id INTEGER,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeksy
CREATE INDEX IF NOT EXISTS idx_donations_member ON donations(member_id);
CREATE INDEX IF NOT EXISTS idx_donations_fund ON donations(fund_id);
CREATE INDEX IF NOT EXISTS idx_donations_campaign ON donations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_donations_date ON donations(donation_date);
CREATE INDEX IF NOT EXISTS idx_donations_campus ON donations(campus_id);
CREATE INDEX IF NOT EXISTS idx_giving_recurring_active ON giving_recurring(is_active, next_run_date);
CREATE INDEX IF NOT EXISTS idx_giving_pledges_campaign ON giving_pledges(campaign_id);
CREATE INDEX IF NOT EXISTS idx_giving_campaigns_active ON giving_campaigns(is_active);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_giving_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_giving_funds_updated ON giving_funds;
CREATE TRIGGER trg_giving_funds_updated BEFORE UPDATE ON giving_funds
  FOR EACH ROW EXECUTE FUNCTION update_giving_updated_at();
DROP TRIGGER IF EXISTS trg_giving_campaigns_updated ON giving_campaigns;
CREATE TRIGGER trg_giving_campaigns_updated BEFORE UPDATE ON giving_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_giving_updated_at();
DROP TRIGGER IF EXISTS trg_giving_recurring_updated ON giving_recurring;
CREATE TRIGGER trg_giving_recurring_updated BEFORE UPDATE ON giving_recurring
  FOR EACH ROW EXECUTE FUNCTION update_giving_updated_at();
DROP TRIGGER IF EXISTS trg_donations_updated ON donations;
CREATE TRIGGER trg_donations_updated BEFORE UPDATE ON donations
  FOR EACH ROW EXECUTE FUNCTION update_giving_updated_at();

-- RLS
ALTER TABLE giving_funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE giving_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE giving_pledges ENABLE ROW LEVEL SECURITY;
ALTER TABLE giving_recurring ENABLE ROW LEVEL SECURITY;
ALTER TABLE donations ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['giving_funds','giving_campaigns','giving_pledges','giving_recurring','donations'] LOOP
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
VALUES ('giving', 'Dawanie', 'Gift', '/giving', 'module:giving', 9, true, 'GivingModule')
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label, icon = EXCLUDED.icon, path = EXCLUDED.path,
  resource_key = EXCLUDED.resource_key, component_name = EXCLUDED.component_name;

-- ============================================
-- Uprawnienia domyślne
-- ============================================
INSERT INTO app_permissions (role, resource, can_read, can_write)
VALUES
  ('superadmin', 'module:giving', true, true),
  ('rada_starszych', 'module:giving', true, true),
  ('admin', 'module:giving', true, true),
  ('koordynator', 'module:giving', true, true),
  ('lider', 'module:giving', true, false)
ON CONFLICT (role, resource) DO UPDATE SET
  can_read = EXCLUDED.can_read,
  can_write = EXCLUDED.can_write;

-- ============================================
-- Fundusze startowe (jeśli tabela pusta)
-- ============================================
INSERT INTO giving_funds (name, description, color, is_tax_deductible, sort_order)
SELECT * FROM (VALUES
  ('Dziesięcina', 'Regularna dziesięcina', '#10b981', true, 0),
  ('Ofiara', 'Ofiary niedzielne', '#3b82f6', true, 1),
  ('Misje', 'Wsparcie misji', '#f59e0b', true, 2),
  ('Budowa / remont', 'Fundusz inwestycyjny', '#8b5cf6', true, 3)
) AS v(name, description, color, is_tax_deductible, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM giving_funds);
