-- Rozbudowa Finansów, Fazy 2-4: workflow akceptacji + faktury + okresy budżetu +
-- transakcje cykliczne + rejestr kontrahentów. Wszystko addytywne i idempotentne;
-- domyślne wartości dobrane tak, by istniejące dane działały jak dotąd.

-- === Faza 2: workflow akceptacji wydatków ===
-- status: draft | submitted | approved | rejected | paid. Istniejące = 'approved'.
ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS submitted_by TEXT;
ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- === Faza 4: faktury na wydatku ===
ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT true;   -- istniejące = opłacone
ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS paid_date DATE;

-- === Faza 4: okresy budżetu ===
ALTER TABLE budget_items ADD COLUMN IF NOT EXISTS period_type TEXT DEFAULT 'year';         -- year | quarter | month
ALTER TABLE budget_items ADD COLUMN IF NOT EXISTS period_value TEXT;                        -- np. 'Q1' / '2026-03'

-- === Faza 2: transakcje cykliczne ===
CREATE TABLE IF NOT EXISTS finance_recurring (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  kind TEXT NOT NULL DEFAULT 'expense',        -- income | expense
  title TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  category TEXT,                                -- służba/pozycja budżetu (wydatek) lub typ (wpływ)
  cost_category TEXT,
  team_type TEXT,
  contractor TEXT,
  frequency TEXT NOT NULL DEFAULT 'monthly',    -- weekly | biweekly | monthly | quarterly | yearly
  day_of_month INTEGER,
  next_run_date DATE,
  end_date DATE,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_finance_recurring_next ON finance_recurring (next_run_date) WHERE is_active;

-- === Faza 4: rejestr kontrahentów ===
CREATE TABLE IF NOT EXISTS finance_vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  name TEXT NOT NULL,
  nip TEXT,
  contact TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_vendors_name ON finance_vendors (lower(name));
