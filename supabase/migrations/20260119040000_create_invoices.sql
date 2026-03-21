-- =====================================================
-- TABELA INVOICES (Faktury)
-- =====================================================

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES tenant_subscriptions(id),
  invoice_number VARCHAR(50) UNIQUE NOT NULL,  -- FN/001/01/2026

  -- Dane nabywcy (snapshot z tenanta w momencie wystawienia)
  buyer_name VARCHAR(255) NOT NULL,
  buyer_company_name VARCHAR(255),
  buyer_tax_id VARCHAR(50),
  buyer_address TEXT,
  buyer_email VARCHAR(255),

  -- Kwoty (w groszach)
  subtotal INTEGER NOT NULL,            -- netto
  tax_rate NUMERIC(5,2) DEFAULT 23.00,  -- %
  tax_amount INTEGER NOT NULL,          -- VAT
  total INTEGER NOT NULL,               -- brutto
  currency VARCHAR(3) DEFAULT 'PLN',

  -- Pozycje faktury
  items JSONB NOT NULL,                 -- [{description, quantity, unit_price, total}]

  -- Status i płatność
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('draft', 'pending', 'paid', 'overdue', 'cancelled', 'refunded')),
  payment_url TEXT,                     -- Link do P24
  payment_id VARCHAR(100),              -- Order ID z P24
  paid_at TIMESTAMPTZ,
  payment_method VARCHAR(50),           -- przelewy24, manual, etc.

  -- Daty
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  period_start DATE,                    -- Okres, którego dotyczy faktura
  period_end DATE,

  -- PDF
  pdf_url TEXT,

  -- Notatki
  notes TEXT,
  internal_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeksy
CREATE INDEX idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);
CREATE INDEX idx_invoices_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_payment_id ON invoices(payment_id);

-- Trigger aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_invoices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_invoices_updated_at();

-- Sekwencja dla numerów faktur
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1;

-- Funkcja generowania numeru faktury
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS VARCHAR(50) AS $$
DECLARE
  year_str VARCHAR(4);
  month_str VARCHAR(2);
  seq_num INTEGER;
  result VARCHAR(50);
BEGIN
  year_str := TO_CHAR(NOW(), 'YYYY');
  month_str := TO_CHAR(NOW(), 'MM');

  -- Pobierz następny numer w sekwencji dla tego miesiąca
  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(invoice_number, '/', 2) AS INTEGER)
  ), 0) + 1 INTO seq_num
  FROM invoices
  WHERE invoice_number LIKE 'FN/%/' || month_str || '/' || year_str;

  -- Format: FN/001/01/2026
  result := 'FN/' || LPAD(seq_num::TEXT, 3, '0') || '/' || month_str || '/' || year_str;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Trigger automatycznego nadawania numeru faktury
CREATE OR REPLACE FUNCTION set_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := generate_invoice_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_invoice_number
  BEFORE INSERT ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION set_invoice_number();

-- Trigger automatycznego ustawiania statusu overdue
CREATE OR REPLACE FUNCTION check_invoice_overdue()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'pending' AND NEW.due_date < CURRENT_DATE THEN
    NEW.status := 'overdue';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_invoice_overdue
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION check_invoice_overdue();

-- RLS dla invoices
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Super admin może wszystko
CREATE POLICY "Super admins can do everything on invoices"
  ON invoices
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE app_users.id = auth.uid()
      AND app_users.is_super_admin = TRUE
    )
  );

-- Użytkownicy mogą widzieć faktury swojego tenanta
CREATE POLICY "Users can view their tenant invoices"
  ON invoices
  FOR SELECT
  USING (
    tenant_id = (
      SELECT tenant_id FROM app_users
      WHERE app_users.id = auth.uid()
    )
  );

-- Komentarz
COMMENT ON TABLE invoices IS 'Faktury wystawiane klientom';
