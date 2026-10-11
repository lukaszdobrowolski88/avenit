-- Finanse: własne obszary budżetu (np. Administracja, Wynajem budynku), projekty
-- oraz kategorie/tagi/projekt na pozycjach budżetu. Wszystko addytywne (IF NOT EXISTS).

-- Własne obszary budżetu — obok służb (modułów) na liście „Służba / obszar”.
-- Nazwa trafia do budget_items.category/team_type i expense_transactions.category
-- tak samo jak etykieta służby (wiązanie po tekście, jak dotąd).
CREATE TABLE IF NOT EXISTS finance_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_areas_name ON finance_areas (lower(name));

-- Projekty finansowe (np. remont, wyjazd, zbiórka) — przekrój niezależny od służby i roku.
CREATE TABLE IF NOT EXISTS finance_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  status TEXT NOT NULL DEFAULT 'active',      -- active | closed
  start_date DATE,
  end_date DATE,
  budget_amount NUMERIC(12,2),                -- planowany koszt projektu (opcjonalnie)
  income_goal NUMERIC(12,2),                  -- cel zbiórki / planowane wpływy (opcjonalnie)
  responsible_person TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE budget_items ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES finance_projects(id) ON DELETE SET NULL;
ALTER TABLE budget_items ADD COLUMN IF NOT EXISTS cost_category TEXT;
ALTER TABLE budget_items ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;

ALTER TABLE income_transactions ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES finance_projects(id) ON DELETE SET NULL;
ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES finance_projects(id) ON DELETE SET NULL;

ALTER TABLE finance_recurring ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES finance_projects(id) ON DELETE SET NULL;
ALTER TABLE finance_recurring ADD COLUMN IF NOT EXISTS cost_category TEXT;
ALTER TABLE finance_recurring ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_budget_items_project ON budget_items (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_income_transactions_project ON income_transactions (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expense_transactions_project ON expense_transactions (project_id) WHERE project_id IS NOT NULL;

-- Harmonogram raportów: które sekcje trafiają do maila (NULL = wszystkie, jak dotąd).
ALTER TABLE finance_report_schedules ADD COLUMN IF NOT EXISTS sections JSONB;
