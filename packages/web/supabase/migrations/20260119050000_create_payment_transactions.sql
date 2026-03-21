-- =====================================================
-- TABELA PAYMENT_TRANSACTIONS (Transakcje płatności)
-- =====================================================

CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,

  -- Identyfikatory bramy płatności
  gateway VARCHAR(20) NOT NULL CHECK (gateway IN ('przelewy24', 'payu', 'manual', 'other')),
  gateway_session_id VARCHAR(100),      -- Session ID z bramy (token)
  gateway_transaction_id VARCHAR(100),  -- Order ID po płatności
  gateway_order_id VARCHAR(100),        -- Nasz order ID wysłany do bramy

  -- Kwota
  amount INTEGER NOT NULL,              -- grosze
  currency VARCHAR(3) DEFAULT 'PLN',

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled')),

  -- Odpowiedź bramy
  gateway_response JSONB,               -- Pełna odpowiedź z bramy
  error_message TEXT,
  error_code VARCHAR(50),

  -- Daty
  completed_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeksy
CREATE INDEX idx_payment_transactions_tenant ON payment_transactions(tenant_id);
CREATE INDEX idx_payment_transactions_invoice ON payment_transactions(invoice_id);
CREATE INDEX idx_payment_transactions_session ON payment_transactions(gateway_session_id);
CREATE INDEX idx_payment_transactions_order ON payment_transactions(gateway_order_id);
CREATE INDEX idx_payment_transactions_status ON payment_transactions(status);

-- Trigger aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_payment_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_payment_transactions_updated_at
  BEFORE UPDATE ON payment_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_payment_transactions_updated_at();

-- Trigger aktualizacji faktury po płatności
CREATE OR REPLACE FUNCTION update_invoice_on_payment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Oznacz fakturę jako opłaconą
    UPDATE invoices
    SET
      status = 'paid',
      paid_at = NEW.completed_at,
      payment_method = NEW.gateway,
      payment_id = NEW.gateway_transaction_id
    WHERE id = NEW.invoice_id;

    -- Aktywuj subskrypcję tenanta jeśli była w statusie past_due
    UPDATE tenant_subscriptions
    SET status = 'active'
    WHERE tenant_id = NEW.tenant_id
      AND status = 'past_due';

    -- Aktywuj tenanta jeśli był suspended
    UPDATE tenants
    SET status = 'active'
    WHERE id = NEW.tenant_id
      AND status = 'suspended';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_invoice_on_payment
  AFTER UPDATE ON payment_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_invoice_on_payment();

-- RLS dla payment_transactions
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

-- Super admin może wszystko
CREATE POLICY "Super admins can do everything on payments"
  ON payment_transactions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE app_users.id = auth.uid()
      AND app_users.is_super_admin = TRUE
    )
  );

-- Użytkownicy mogą widzieć płatności swojego tenanta
CREATE POLICY "Users can view their tenant payments"
  ON payment_transactions
  FOR SELECT
  USING (
    tenant_id = (
      SELECT tenant_id FROM app_users
      WHERE app_users.id = auth.uid()
    )
  );

-- Komentarz
COMMENT ON TABLE payment_transactions IS 'Historia transakcji płatności';
