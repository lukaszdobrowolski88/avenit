-- Dodaj pole ministry do tabeli budget_items
ALTER TABLE budget_items ADD COLUMN IF NOT EXISTS ministry TEXT;

-- Dodaj pole ministry do tabeli expense_transactions
ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS ministry TEXT;

-- Dodaj indeksy dla szybszego filtrowania
CREATE INDEX IF NOT EXISTS idx_budget_items_ministry ON budget_items(ministry);
CREATE INDEX IF NOT EXISTS idx_expense_transactions_ministry ON expense_transactions(ministry);

-- Zaktualizuj istniejące rekordy, przypisując ministry na podstawie category
UPDATE budget_items SET ministry = category WHERE ministry IS NULL;
UPDATE expense_transactions SET ministry = category WHERE ministry IS NULL;
