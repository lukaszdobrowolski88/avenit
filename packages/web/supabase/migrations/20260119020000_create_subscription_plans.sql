-- =====================================================
-- TABELA SUBSCRIPTION_PLANS (Plany subskrypcji)
-- =====================================================

CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  price_monthly INTEGER NOT NULL,       -- grosze (9900 = 99 PLN)
  price_yearly INTEGER,                 -- grosze (opcjonalnie, rabat ~17%)
  max_members INTEGER DEFAULT -1,       -- -1 = unlimited
  max_users INTEGER DEFAULT -1,
  max_groups INTEGER DEFAULT -1,
  max_kids INTEGER DEFAULT -1,
  max_events INTEGER DEFAULT -1,
  max_storage_mb INTEGER DEFAULT 100,   -- MB
  trial_days INTEGER DEFAULT 14,
  features JSONB DEFAULT '{}'::jsonb,   -- {"calendar": true, "kids_checkin": true, ...}
  is_active BOOLEAN DEFAULT TRUE,
  is_public BOOLEAN DEFAULT TRUE,       -- Czy widoczny na stronie cennika
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeksy
CREATE INDEX idx_subscription_plans_slug ON subscription_plans(slug);
CREATE INDEX idx_subscription_plans_active ON subscription_plans(is_active);
CREATE INDEX idx_subscription_plans_sort ON subscription_plans(sort_order);

-- Trigger aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_subscription_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_subscription_plans_updated_at
  BEFORE UPDATE ON subscription_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_subscription_plans_updated_at();

-- Domyślne plany
INSERT INTO subscription_plans (name, slug, description, price_monthly, price_yearly, max_members, max_users, max_groups, max_kids, max_events, max_storage_mb, trial_days, features, sort_order) VALUES
(
  'Starter',
  'starter',
  'Idealny dla małych kościołów rozpoczynających swoją przygodę z zarządzaniem',
  4900,
  49000,
  50,
  2,
  5,
  20,
  10,
  100,
  14,
  '{"calendar": true, "members": true, "groups": true, "basic_reports": true}'::jsonb,
  1
),
(
  'Standard',
  'standard',
  'Wszystkie podstawowe funkcje plus check-in dzieci i wydarzenia',
  9900,
  99000,
  200,
  5,
  20,
  100,
  50,
  500,
  14,
  '{"calendar": true, "members": true, "groups": true, "kids_checkin": true, "events": true, "email": true, "basic_reports": true}'::jsonb,
  2
),
(
  'Professional',
  'professional',
  'Zaawansowane funkcje dla rozwijających się kościołów',
  19900,
  199000,
  500,
  10,
  -1,
  -1,
  -1,
  2000,
  14,
  '{"calendar": true, "members": true, "groups": true, "kids_checkin": true, "events": true, "email": true, "finance": true, "forms": true, "advanced_reports": true, "api": true}'::jsonb,
  3
),
(
  'Enterprise',
  'enterprise',
  'Pełna funkcjonalność dla dużych organizacji z dedykowanym wsparciem',
  39900,
  399000,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  30,
  '{"calendar": true, "members": true, "groups": true, "kids_checkin": true, "events": true, "email": true, "finance": true, "forms": true, "advanced_reports": true, "api": true, "white_label": true, "priority_support": true, "custom_domain": true}'::jsonb,
  4
);

-- RLS dla subscription_plans
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

-- Wszyscy mogą przeglądać aktywne plany
CREATE POLICY "Anyone can view active plans"
  ON subscription_plans
  FOR SELECT
  USING (is_active = TRUE AND is_public = TRUE);

-- Super admin może wszystko
CREATE POLICY "Super admins can do everything on plans"
  ON subscription_plans
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE app_users.id = auth.uid()
      AND app_users.is_super_admin = TRUE
    )
  );

-- Komentarz
COMMENT ON TABLE subscription_plans IS 'Dostępne plany subskrypcji';
