-- Faza 1 rozbudowy Finansów: własne kategorie (wpływy/wydatki) + kolorowa paleta tagów.

-- Wspólna tabela kategorii (istniejąca expense_categories) rozszerzona o RODZAJ.
ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'expense';

-- Kategoria kosztu na wydatku — klasyfikacja niezależna od powiązania z budżetem/służbą
-- (dotychczasowe expense_transactions.category = służba/pozycja budżetu zostaje bez zmian).
ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS cost_category TEXT;

-- Paleta tagów finansów (nazwa → kolor), wspólna dla wpływów i wydatków. Same tagi na
-- transakcjach nadal są w kolumnie jsonb `tags`; tu trzymamy tylko kolory/podpowiedzi.
CREATE TABLE IF NOT EXISTS finance_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_tags_name ON finance_tags (lower(name));

-- Seed domyślnych kategorii (idempotentnie — tylko gdy brak takiej nazwy w danym rodzaju).
INSERT INTO expense_categories (name, kind, color, is_active)
SELECT v.name, 'income', v.color, true FROM (VALUES
  ('Kolekta', '#10b981'), ('Darowizny', '#6366f1'), ('Inne', '#94a3b8')
) AS v(name, color)
WHERE NOT EXISTS (
  SELECT 1 FROM expense_categories e WHERE lower(e.name) = lower(v.name) AND e.kind = 'income'
);

INSERT INTO expense_categories (name, kind, color, is_active)
SELECT v.name, 'expense', v.color, true FROM (VALUES
  ('Sprzęt', '#f59e0b'), ('Materiały', '#0ea5e9'), ('Transport', '#ef4444'),
  ('Catering', '#a855f7'), ('Wynajem', '#14b8a6'), ('Inne', '#94a3b8')
) AS v(name, color)
WHERE NOT EXISTS (
  SELECT 1 FROM expense_categories e WHERE lower(e.name) = lower(v.name) AND e.kind = 'expense'
);
