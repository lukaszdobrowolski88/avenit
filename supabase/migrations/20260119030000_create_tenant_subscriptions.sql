-- =====================================================
-- TABELA TENANT_SUBSCRIPTIONS (Subskrypcje klientów)
-- =====================================================

CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES subscription_plans(id),
  status VARCHAR(20) DEFAULT 'trialing' CHECK (status IN ('trialing', 'active', 'past_due', 'cancelled', 'suspended')),
  billing_cycle VARCHAR(10) DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  next_invoice_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeksy
CREATE INDEX idx_tenant_subscriptions_tenant ON tenant_subscriptions(tenant_id);
CREATE INDEX idx_tenant_subscriptions_status ON tenant_subscriptions(status);
CREATE INDEX idx_tenant_subscriptions_period_end ON tenant_subscriptions(current_period_end);

-- Tylko jedna aktywna subskrypcja na tenanta
CREATE UNIQUE INDEX idx_tenant_subscriptions_active
  ON tenant_subscriptions(tenant_id)
  WHERE status IN ('trialing', 'active', 'past_due');

-- Trigger aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_tenant_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_tenant_subscriptions_updated_at
  BEFORE UPDATE ON tenant_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_tenant_subscriptions_updated_at();

-- RLS dla tenant_subscriptions
ALTER TABLE tenant_subscriptions ENABLE ROW LEVEL SECURITY;

-- Super admin może wszystko
CREATE POLICY "Super admins can do everything on subscriptions"
  ON tenant_subscriptions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE app_users.id = auth.uid()
      AND app_users.is_super_admin = TRUE
    )
  );

-- Użytkownicy mogą widzieć subskrypcję swojego tenanta
CREATE POLICY "Users can view their tenant subscription"
  ON tenant_subscriptions
  FOR SELECT
  USING (
    tenant_id = (
      SELECT tenant_id FROM app_users
      WHERE app_users.id = auth.uid()
    )
  );

-- Funkcja pomocnicza do pobierania aktywnej subskrypcji
CREATE OR REPLACE FUNCTION get_tenant_subscription(p_tenant_id UUID)
RETURNS TABLE (
  subscription_id UUID,
  plan_name VARCHAR,
  plan_slug VARCHAR,
  status VARCHAR,
  billing_cycle VARCHAR,
  current_period_end TIMESTAMPTZ,
  features JSONB,
  max_members INTEGER,
  max_users INTEGER,
  max_groups INTEGER,
  max_kids INTEGER,
  max_events INTEGER,
  max_storage_mb INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ts.id as subscription_id,
    sp.name as plan_name,
    sp.slug as plan_slug,
    ts.status,
    ts.billing_cycle,
    ts.current_period_end,
    sp.features,
    sp.max_members,
    sp.max_users,
    sp.max_groups,
    sp.max_kids,
    sp.max_events,
    sp.max_storage_mb
  FROM tenant_subscriptions ts
  JOIN subscription_plans sp ON ts.plan_id = sp.id
  WHERE ts.tenant_id = p_tenant_id
    AND ts.status IN ('trialing', 'active', 'past_due')
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Komentarz
COMMENT ON TABLE tenant_subscriptions IS 'Subskrypcje klientów powiązane z planami';
