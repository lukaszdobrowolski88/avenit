-- Tabela do przechowywania stanów początkowych kont finansowych
CREATE TABLE IF NOT EXISTS finance_balances (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    year INTEGER NOT NULL,
    bank_pln DECIMAL(12, 2) DEFAULT 0,
    bank_currency DECIMAL(12, 2) DEFAULT 0,
    cash_pln DECIMAL(12, 2) DEFAULT 0,
    cash_currency DECIMAL(12, 2) DEFAULT 0,
    currency_type VARCHAR(3) DEFAULT 'EUR',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(year)
);

-- Indeks na rok dla szybkiego wyszukiwania
CREATE INDEX IF NOT EXISTS idx_finance_balances_year ON finance_balances(year);

-- Trigger do automatycznej aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_finance_balances_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_finance_balances_updated_at ON finance_balances;
CREATE TRIGGER trigger_update_finance_balances_updated_at
    BEFORE UPDATE ON finance_balances
    FOR EACH ROW
    EXECUTE FUNCTION update_finance_balances_updated_at();

-- Włącz RLS (Row Level Security)
ALTER TABLE finance_balances ENABLE ROW LEVEL SECURITY;

-- Polityka pozwalająca na wszystkie operacje (dostosuj według potrzeb)
CREATE POLICY "Allow all operations on finance_balances" ON finance_balances
    FOR ALL
    USING (true)
    WITH CHECK (true);
