-- =====================================================================
-- AVENIT — schemat bazy PLATFORM (control plane)
-- =====================================================================
-- Jedna baza dla całej platformy: tenanci, plany, subskrypcje, faktury,
-- płatności, kupony, windykacja, administratorzy platformy, moduły per tenant,
-- log audytowy.
--
-- Wygenerowane z konsolidacji migracji supabase/migrations/20260119*.
-- Usunięto: RLS/POLICY, odwołania do auth.uid()/auth.users, funkcje
-- get_current_tenant_id()/is_super_admin() (autoryzacja jest w API).
-- Idempotentne (IF NOT EXISTS / OR REPLACE) — bezpieczne do wielokrotnego
-- uruchomienia przez runner migracji.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── TENANTS (klienci/kościoły) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  subdomain VARCHAR(63) UNIQUE NOT NULL,       -- etykieta DNS (schwro.avenit.pl)
  db_name VARCHAR(63) UNIQUE NOT NULL,         -- nazwa bazy tenanta
  email VARCHAR(255) NOT NULL,
  company_name VARCHAR(255),
  tax_id VARCHAR(50),
  address TEXT,
  city VARCHAR(100),
  postal_code VARCHAR(20),
  country VARCHAR(50) DEFAULT 'Polska',
  phone VARCHAR(50),
  logo_url TEXT,
  status VARCHAR(20) DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'suspended', 'cancelled')),
  trial_ends_at TIMESTAMPTZ,
  settings JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_subdomain ON tenants(subdomain);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

-- Wspólny trigger updated_at dla całej bazy platform.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_tenants_updated_at ON tenants;
CREATE TRIGGER trigger_tenants_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── SUBSCRIPTION_PLANS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  price_monthly INTEGER NOT NULL,
  price_yearly INTEGER,
  max_members INTEGER DEFAULT -1,
  max_users INTEGER DEFAULT -1,
  max_groups INTEGER DEFAULT -1,
  max_kids INTEGER DEFAULT -1,
  max_events INTEGER DEFAULT -1,
  max_storage_mb INTEGER DEFAULT 100,
  trial_days INTEGER DEFAULT 14,
  features JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  is_public BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- UWAGA: kod odwołuje się do subscription_plans po kolumnie `key`
-- (provisioning.js: WHERE key = $1). W oryginale kolumna nazywa się `slug`.
-- Dodajemy alias `key` jako kolumnę generowaną, by nie łamać żadnej strony.
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS key VARCHAR(50);
UPDATE subscription_plans SET key = slug WHERE key IS NULL;
CREATE INDEX IF NOT EXISTS idx_subscription_plans_slug ON subscription_plans(slug);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON subscription_plans(is_active);

DROP TRIGGER IF EXISTS trigger_subscription_plans_updated_at ON subscription_plans;
CREATE TRIGGER trigger_subscription_plans_updated_at BEFORE UPDATE ON subscription_plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO subscription_plans (name, slug, key, description, price_monthly, price_yearly, max_members, max_users, max_groups, max_kids, max_events, max_storage_mb, trial_days, features, sort_order) VALUES
('Starter', 'starter', 'starter', 'Idealny dla małych kościołów rozpoczynających swoją przygodę z zarządzaniem', 4900, 49000, 50, 2, 5, 20, 10, 100, 14, '{"calendar": true, "members": true, "groups": true, "basic_reports": true}'::jsonb, 1),
('Standard', 'standard', 'standard', 'Wszystkie podstawowe funkcje plus check-in dzieci i wydarzenia', 9900, 99000, 200, 5, 20, 100, 50, 500, 14, '{"calendar": true, "members": true, "groups": true, "kids_checkin": true, "events": true, "email": true, "basic_reports": true}'::jsonb, 2),
('Professional', 'professional', 'professional', 'Zaawansowane funkcje dla rozwijających się kościołów', 19900, 199000, 500, 10, -1, -1, -1, 2000, 14, '{"calendar": true, "members": true, "groups": true, "kids_checkin": true, "events": true, "email": true, "finance": true, "forms": true, "advanced_reports": true, "api": true}'::jsonb, 3),
('Enterprise', 'enterprise', 'enterprise', 'Pełna funkcjonalność dla dużych organizacji z dedykowanym wsparciem', 39900, 399000, -1, -1, -1, -1, -1, -1, 30, '{"calendar": true, "members": true, "groups": true, "kids_checkin": true, "events": true, "email": true, "finance": true, "forms": true, "advanced_reports": true, "api": true, "white_label": true, "priority_support": true, "custom_domain": true}'::jsonb, 4)
ON CONFLICT (slug) DO NOTHING;

-- ── TENANT_SUBSCRIPTIONS ─────────────────────────────────────────────
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
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_tenant ON tenant_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_status ON tenant_subscriptions(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_subscriptions_active
  ON tenant_subscriptions(tenant_id) WHERE status IN ('trialing', 'active', 'past_due');

DROP TRIGGER IF EXISTS trigger_tenant_subscriptions_updated_at ON tenant_subscriptions;
CREATE TRIGGER trigger_tenant_subscriptions_updated_at BEFORE UPDATE ON tenant_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── INVOICES ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES tenant_subscriptions(id),
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  buyer_name VARCHAR(255) NOT NULL,
  buyer_company_name VARCHAR(255),
  buyer_tax_id VARCHAR(50),
  buyer_address TEXT,
  buyer_email VARCHAR(255),
  subtotal INTEGER NOT NULL,
  tax_rate NUMERIC(5,2) DEFAULT 23.00,
  tax_amount INTEGER NOT NULL,
  total INTEGER NOT NULL,
  currency VARCHAR(3) DEFAULT 'PLN',
  items JSONB NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('draft', 'pending', 'paid', 'overdue', 'cancelled', 'refunded')),
  payment_url TEXT,
  payment_id VARCHAR(100),
  paid_at TIMESTAMPTZ,
  payment_method VARCHAR(50),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  period_start DATE,
  period_end DATE,
  pdf_url TEXT,
  notes TEXT,
  internal_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);

DROP TRIGGER IF EXISTS trigger_invoices_updated_at ON invoices;
CREATE TRIGGER trigger_invoices_updated_at BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS VARCHAR(50) AS $$
DECLARE
  year_str VARCHAR(4);
  month_str VARCHAR(2);
  seq_num INTEGER;
BEGIN
  year_str := TO_CHAR(NOW(), 'YYYY');
  month_str := TO_CHAR(NOW(), 'MM');
  SELECT COALESCE(MAX(CAST(SPLIT_PART(invoice_number, '/', 2) AS INTEGER)), 0) + 1 INTO seq_num
  FROM invoices WHERE invoice_number LIKE 'FN/%/' || month_str || '/' || year_str;
  RETURN 'FN/' || LPAD(seq_num::TEXT, 3, '0') || '/' || month_str || '/' || year_str;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := generate_invoice_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_set_invoice_number ON invoices;
CREATE TRIGGER trigger_set_invoice_number BEFORE INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_invoice_number();

-- ── PAYMENT_TRANSACTIONS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  gateway VARCHAR(20) NOT NULL CHECK (gateway IN ('przelewy24', 'payu', 'manual', 'other')),
  gateway_session_id VARCHAR(100),
  gateway_transaction_id VARCHAR(100),
  gateway_order_id VARCHAR(100),
  amount INTEGER NOT NULL,
  currency VARCHAR(3) DEFAULT 'PLN',
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled')),
  gateway_response JSONB,
  error_message TEXT,
  error_code VARCHAR(50),
  completed_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_tenant ON payment_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_invoice ON payment_transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status);

DROP TRIGGER IF EXISTS trigger_payment_transactions_updated_at ON payment_transactions;
CREATE TRIGGER trigger_payment_transactions_updated_at BEFORE UPDATE ON payment_transactions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Po zakończonej płatności: oznacz fakturę jako opłaconą i odblokuj tenanta.
CREATE OR REPLACE FUNCTION update_invoice_on_payment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    UPDATE invoices SET status = 'paid', paid_at = NEW.completed_at,
           payment_method = NEW.gateway, payment_id = NEW.gateway_transaction_id
     WHERE id = NEW.invoice_id;
    UPDATE tenant_subscriptions SET status = 'active'
     WHERE tenant_id = NEW.tenant_id AND status = 'past_due';
    UPDATE tenants SET status = 'active'
     WHERE id = NEW.tenant_id AND status = 'suspended';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_update_invoice_on_payment ON payment_transactions;
CREATE TRIGGER trigger_update_invoice_on_payment AFTER UPDATE ON payment_transactions
  FOR EACH ROW EXECUTE FUNCTION update_invoice_on_payment();

-- ── DUNNING ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dunning_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage INTEGER NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  days_after_due INTEGER NOT NULL,
  action VARCHAR(50) NOT NULL CHECK (action IN ('email', 'suspend', 'cancel')),
  email_template VARCHAR(50),
  email_subject VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO dunning_config (stage, name, days_after_due, action, email_template, email_subject) VALUES
(1, 'Pierwsze przypomnienie', 3, 'email', 'dunning_reminder_1', 'Przypomnienie o płatności - faktura FN/{invoice_number}'),
(2, 'Drugie przypomnienie', 7, 'email', 'dunning_reminder_2', 'Pilne: Nieuregulowana faktura FN/{invoice_number}'),
(3, 'Ostrzeżenie przed zawieszeniem', 14, 'email', 'dunning_final_warning', 'Ostatnie ostrzeżenie - zawieszenie konta za 7 dni'),
(4, 'Zawieszenie konta', 21, 'suspend', 'dunning_suspension', 'Twoje konto zostało zawieszone')
ON CONFLICT (stage) DO NOTHING;

-- Funkcja windykacji: zwraca faktury zaległe wymagające akcji (używa process-dunning.js).
CREATE OR REPLACE FUNCTION process_dunning()
RETURNS TABLE (
  tenant_id UUID, invoice_id UUID, invoice_number VARCHAR, tenant_email VARCHAR,
  days_overdue INTEGER, next_stage INTEGER, action_to_take VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT i.tenant_id, i.id, i.invoice_number, t.email,
    (CURRENT_DATE - i.due_date)::INTEGER AS days_overdue,
    COALESCE((SELECT MIN(dc.stage) FROM dunning_config dc
      WHERE dc.is_active AND dc.days_after_due <= (CURRENT_DATE - i.due_date)
        AND NOT EXISTS (SELECT 1 FROM dunning_log dl WHERE dl.invoice_id = i.id AND dl.stage = dc.stage)), 0) AS next_stage,
    (SELECT dc.action FROM dunning_config dc WHERE dc.stage = COALESCE(
      (SELECT MIN(dc2.stage) FROM dunning_config dc2
        WHERE dc2.is_active AND dc2.days_after_due <= (CURRENT_DATE - i.due_date)
          AND NOT EXISTS (SELECT 1 FROM dunning_log dl WHERE dl.invoice_id = i.id AND dl.stage = dc2.stage)), 0)) AS action_to_take
  FROM invoices i JOIN tenants t ON i.tenant_id = t.id
  WHERE i.status = 'overdue' AND t.status != 'cancelled';
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS dunning_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  config_id UUID REFERENCES dunning_config(id),
  stage INTEGER NOT NULL,
  action_taken VARCHAR(50) NOT NULL,
  email_sent_to VARCHAR(255),
  email_sent_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dunning_log_tenant ON dunning_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dunning_log_invoice ON dunning_log(invoice_id);

-- ── COUPONS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percent', 'fixed_amount', 'free_months')),
  discount_value NUMERIC(10,2) NOT NULL,
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  max_uses INTEGER,
  max_uses_per_tenant INTEGER DEFAULT 1,
  current_uses INTEGER DEFAULT 0,
  applicable_plan_ids UUID[],
  applicable_billing_cycles VARCHAR[] DEFAULT ARRAY['monthly', 'yearly'],
  duration_months INTEGER,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);

DROP TRIGGER IF EXISTS trigger_coupons_updated_at ON coupons;
CREATE TRIGGER trigger_coupons_updated_at BEFORE UPDATE ON coupons
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES tenant_subscriptions(id),
  discount_applied INTEGER NOT NULL,
  redeemed_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon ON coupon_redemptions(coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_tenant ON coupon_redemptions(tenant_id);

CREATE OR REPLACE FUNCTION increment_coupon_uses()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE coupons SET current_uses = current_uses + 1 WHERE id = NEW.coupon_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_increment_coupon_uses ON coupon_redemptions;
CREATE TRIGGER trigger_increment_coupon_uses AFTER INSERT ON coupon_redemptions
  FOR EACH ROW EXECUTE FUNCTION increment_coupon_uses();

-- ── PLATFORM_ADMINS (operatorzy platformy) ───────────────────────────
CREATE TABLE IF NOT EXISTS platform_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  password_hash TEXT NOT NULL,
  totp_secret TEXT,
  totp_enabled BOOLEAN DEFAULT FALSE,
  totp_backup_codes JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
DROP TRIGGER IF EXISTS trigger_platform_admins_updated_at ON platform_admins;
CREATE TRIGGER trigger_platform_admins_updated_at BEFORE UPDATE ON platform_admins
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS admin_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES platform_admins(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_admin_refresh_tokens_admin ON admin_refresh_tokens(admin_id);

-- ── TENANT_MODULES (włączanie modułów per tenant z poziomu platformy) ─
CREATE TABLE IF NOT EXISTS tenant_modules (
  id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_key VARCHAR(100) NOT NULL,
  is_enabled BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, module_key)
);
CREATE INDEX IF NOT EXISTS idx_tenant_modules_tenant ON tenant_modules(tenant_id);

-- ── AUDIT_LOG (operacje adminów platformy) ───────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  admin_id UUID REFERENCES platform_admins(id),
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(50),
  target_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_admin ON audit_log(admin_id);
