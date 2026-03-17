-- =====================================================
-- TABELA COUPONS (Kupony rabatowe)
-- =====================================================

CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,     -- Kod kuponu (np. WELCOME20)
  name VARCHAR(100) NOT NULL,           -- Nazwa opisowa
  description TEXT,

  -- Typ rabatu
  discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percent', 'fixed_amount', 'free_months')),
  discount_value NUMERIC(10,2) NOT NULL, -- procent lub kwota w groszach lub liczba miesięcy

  -- Ograniczenia
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  max_uses INTEGER,                     -- Maksymalna liczba użyć (NULL = bez limitu)
  max_uses_per_tenant INTEGER DEFAULT 1, -- Max użyć przez jednego tenanta
  current_uses INTEGER DEFAULT 0,       -- Aktualna liczba użyć

  -- Ograniczenia do planów
  applicable_plan_ids UUID[],           -- Puste = wszystkie plany
  applicable_billing_cycles VARCHAR[] DEFAULT ARRAY['monthly', 'yearly'],

  -- Czas trwania rabatu
  duration_months INTEGER,              -- Przez ile miesięcy obowiązuje (NULL = zawsze)

  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeksy
CREATE INDEX idx_coupons_code ON coupons(code);
CREATE INDEX idx_coupons_active ON coupons(is_active);
CREATE INDEX idx_coupons_valid ON coupons(valid_from, valid_until);

-- Trigger aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_coupons_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_coupons_updated_at
  BEFORE UPDATE ON coupons
  FOR EACH ROW
  EXECUTE FUNCTION update_coupons_updated_at();

-- Historia użycia kuponów
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES tenant_subscriptions(id),
  discount_applied INTEGER NOT NULL,    -- Kwota rabatu w groszach
  redeemed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeksy
CREATE INDEX idx_coupon_redemptions_coupon ON coupon_redemptions(coupon_id);
CREATE INDEX idx_coupon_redemptions_tenant ON coupon_redemptions(tenant_id);

-- Trigger inkrementacji current_uses
CREATE OR REPLACE FUNCTION increment_coupon_uses()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE coupons SET current_uses = current_uses + 1 WHERE id = NEW.coupon_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_increment_coupon_uses
  AFTER INSERT ON coupon_redemptions
  FOR EACH ROW
  EXECUTE FUNCTION increment_coupon_uses();

-- Funkcja walidacji kuponu
CREATE OR REPLACE FUNCTION validate_coupon(
  p_code VARCHAR,
  p_tenant_id UUID,
  p_plan_id UUID DEFAULT NULL,
  p_billing_cycle VARCHAR DEFAULT 'monthly'
)
RETURNS TABLE (
  is_valid BOOLEAN,
  coupon_id UUID,
  discount_type VARCHAR,
  discount_value NUMERIC,
  duration_months INTEGER,
  error_message VARCHAR
) AS $$
DECLARE
  v_coupon RECORD;
  v_tenant_uses INTEGER;
BEGIN
  -- Znajdź kupon
  SELECT * INTO v_coupon FROM coupons WHERE code = UPPER(p_code);

  IF v_coupon IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::VARCHAR, NULL::NUMERIC, NULL::INTEGER, 'Nieprawidłowy kod kuponu'::VARCHAR;
    RETURN;
  END IF;

  -- Sprawdź czy aktywny
  IF NOT v_coupon.is_active THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::VARCHAR, NULL::NUMERIC, NULL::INTEGER, 'Kupon nieaktywny'::VARCHAR;
    RETURN;
  END IF;

  -- Sprawdź daty ważności
  IF v_coupon.valid_from IS NOT NULL AND v_coupon.valid_from > NOW() THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::VARCHAR, NULL::NUMERIC, NULL::INTEGER, 'Kupon jeszcze nie jest aktywny'::VARCHAR;
    RETURN;
  END IF;

  IF v_coupon.valid_until IS NOT NULL AND v_coupon.valid_until < NOW() THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::VARCHAR, NULL::NUMERIC, NULL::INTEGER, 'Kupon wygasł'::VARCHAR;
    RETURN;
  END IF;

  -- Sprawdź limit globalny
  IF v_coupon.max_uses IS NOT NULL AND v_coupon.current_uses >= v_coupon.max_uses THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::VARCHAR, NULL::NUMERIC, NULL::INTEGER, 'Kupon został wykorzystany maksymalną liczbę razy'::VARCHAR;
    RETURN;
  END IF;

  -- Sprawdź limit per tenant
  SELECT COUNT(*) INTO v_tenant_uses FROM coupon_redemptions WHERE coupon_id = v_coupon.id AND tenant_id = p_tenant_id;
  IF v_coupon.max_uses_per_tenant IS NOT NULL AND v_tenant_uses >= v_coupon.max_uses_per_tenant THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::VARCHAR, NULL::NUMERIC, NULL::INTEGER, 'Już wykorzystałeś ten kupon'::VARCHAR;
    RETURN;
  END IF;

  -- Sprawdź plan
  IF v_coupon.applicable_plan_ids IS NOT NULL AND array_length(v_coupon.applicable_plan_ids, 1) > 0 THEN
    IF p_plan_id IS NULL OR NOT (p_plan_id = ANY(v_coupon.applicable_plan_ids)) THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, NULL::VARCHAR, NULL::NUMERIC, NULL::INTEGER, 'Kupon nie dotyczy tego planu'::VARCHAR;
      RETURN;
    END IF;
  END IF;

  -- Sprawdź cykl rozliczeniowy
  IF NOT (p_billing_cycle = ANY(v_coupon.applicable_billing_cycles)) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::VARCHAR, NULL::NUMERIC, NULL::INTEGER, 'Kupon nie dotyczy tego cyklu rozliczeniowego'::VARCHAR;
    RETURN;
  END IF;

  -- Kupon jest ważny
  RETURN QUERY SELECT
    TRUE,
    v_coupon.id,
    v_coupon.discount_type,
    v_coupon.discount_value,
    v_coupon.duration_months,
    NULL::VARCHAR;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS dla coupons
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

-- Tylko super admin może zarządzać kuponami
CREATE POLICY "Super admins can manage coupons"
  ON coupons
  FOR ALL
  USING (is_super_admin());

-- Wszyscy mogą sprawdzać aktywne kupony (przez funkcję validate_coupon)
CREATE POLICY "Anyone can view active coupons"
  ON coupons
  FOR SELECT
  USING (is_active = TRUE);

-- RLS dla coupon_redemptions
ALTER TABLE coupon_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage redemptions"
  ON coupon_redemptions
  FOR ALL
  USING (is_super_admin());

CREATE POLICY "Tenants can view their redemptions"
  ON coupon_redemptions
  FOR SELECT
  USING (tenant_id = get_current_tenant_id());

-- Przykładowe kupony
INSERT INTO coupons (code, name, description, discount_type, discount_value, valid_until, max_uses) VALUES
('WELCOME20', 'Rabat powitalny 20%', 'Rabat 20% dla nowych klientów', 'percent', 20, NOW() + INTERVAL '1 year', 100),
('YEARLY50', 'Rabat na plan roczny', 'Rabat 50 PLN przy wyborze planu rocznego', 'fixed_amount', 5000, NULL, NULL);

-- Komentarze
COMMENT ON TABLE coupons IS 'Kupony rabatowe';
COMMENT ON TABLE coupon_redemptions IS 'Historia wykorzystania kuponów';
