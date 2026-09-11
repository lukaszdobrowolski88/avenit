-- Finanse — budżet przychodów i wydatków + wersjonowanie/log zmian + propozycje służb.

-- 1) Budżet obejmuje ZARÓWNO planowane przychody, jak i wydatki.
ALTER TABLE budget_items ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'expense';  -- income | expense

-- 2) Log zmian budżetu (kto/kiedy/co) + nazwane wersje (migawki całego roku).
CREATE TABLE IF NOT EXISTS budget_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  year INTEGER,
  item_id UUID,
  action TEXT,                 -- created | updated | deleted
  category TEXT,
  description TEXT,
  before JSONB,
  after JSONB,
  actor TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_budget_audit_year ON budget_audit (year, created_at DESC);

CREATE TABLE IF NOT EXISTS budget_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  year INTEGER,
  label TEXT,
  snapshot JSONB,             -- pełny stan budget_items dla roku w chwili zapisu
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_budget_versions_year ON budget_versions (year, created_at DESC);

-- 4) Propozycje budżetu od służb (leaderzy zgłaszają, admin zatwierdza do budżetu).
CREATE TABLE IF NOT EXISTS budget_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  year INTEGER,
  kind TEXT DEFAULT 'expense',
  team_type TEXT,
  category TEXT,
  description TEXT,
  amount NUMERIC(10,2),
  note TEXT,
  submitted_by TEXT,
  status TEXT DEFAULT 'pending',   -- pending | approved | rejected
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_budget_proposals_status ON budget_proposals (year, status);
