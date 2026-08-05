-- 010: Naprawa schematu finansów — dopasowanie do FinanceModule.
-- Żywa baza (schwro) i szablon miały STARSZY schemat finansów (date/team_type/name),
-- a kod oczekuje year/payment_date/contractor itd. → błędy 42703 „column does not exist".
-- Nie-destrukcyjne: ADD COLUMN IF NOT EXISTS + relaks starych NOT NULL (tabele były puste).

-- budget_items: kod używa year + description (ma już category, planned_amount, campus_id)
ALTER TABLE budget_items ADD COLUMN IF NOT EXISTS year INTEGER;
ALTER TABLE budget_items ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE budget_items ALTER COLUMN name DROP NOT NULL;

-- income_transactions: kod używa type/notes/tags (data = 'date', już jest)
ALTER TABLE income_transactions ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE income_transactions ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE income_transactions ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]';
ALTER TABLE income_transactions ALTER COLUMN category DROP NOT NULL;
ALTER TABLE income_transactions ALTER COLUMN description DROP NOT NULL;

-- expense_transactions: kod używa payment_date/contractor/detailed_description/responsible_person/documents/tags
ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS payment_date DATE;
ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS contractor TEXT;
ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS detailed_description TEXT;
ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS responsible_person TEXT;
ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS documents JSONB DEFAULT '[]';
ALTER TABLE expense_transactions ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]';
ALTER TABLE expense_transactions ALTER COLUMN date DROP NOT NULL;

-- finance_balances: kod używa year + bank/cash + currency_type (stary schemat: team_type/balance)
ALTER TABLE finance_balances ADD COLUMN IF NOT EXISTS year INTEGER;
ALTER TABLE finance_balances ADD COLUMN IF NOT EXISTS bank_pln NUMERIC(12,2) DEFAULT 0;
ALTER TABLE finance_balances ADD COLUMN IF NOT EXISTS bank_currency NUMERIC(12,2) DEFAULT 0;
ALTER TABLE finance_balances ADD COLUMN IF NOT EXISTS cash_pln NUMERIC(12,2) DEFAULT 0;
ALTER TABLE finance_balances ADD COLUMN IF NOT EXISTS cash_currency NUMERIC(12,2) DEFAULT 0;
ALTER TABLE finance_balances ADD COLUMN IF NOT EXISTS currency_type TEXT DEFAULT 'EUR';
ALTER TABLE finance_balances ALTER COLUMN team_type DROP NOT NULL;

-- Indeksy pod zapytania rocznikowe
CREATE INDEX IF NOT EXISTS idx_budget_items_year ON budget_items(year);
CREATE INDEX IF NOT EXISTS idx_expense_payment_date ON expense_transactions(payment_date);
CREATE INDEX IF NOT EXISTS idx_finance_balances_year ON finance_balances(year);
