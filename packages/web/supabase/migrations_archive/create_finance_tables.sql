-- Create budget_items table
CREATE TABLE IF NOT EXISTS budget_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  year INTEGER NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  planned_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create income_transactions table
CREATE TABLE IF NOT EXISTS income_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Kolekta', 'Darowizny', 'Inne')),
  source TEXT NOT NULL,
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create expense_transactions table
CREATE TABLE IF NOT EXISTS expense_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_date DATE NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  contractor TEXT NOT NULL,
  category TEXT NOT NULL,
  responsible_person TEXT NOT NULL,
  document_url TEXT,
  document_name TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_budget_items_year ON budget_items(year);
CREATE INDEX IF NOT EXISTS idx_budget_items_category ON budget_items(category);
CREATE INDEX IF NOT EXISTS idx_income_transactions_date ON income_transactions(date);
CREATE INDEX IF NOT EXISTS idx_income_transactions_type ON income_transactions(type);
CREATE INDEX IF NOT EXISTS idx_expense_transactions_date ON expense_transactions(payment_date);
CREATE INDEX IF NOT EXISTS idx_expense_transactions_category ON expense_transactions(category);

-- Enable Row Level Security (RLS)
ALTER TABLE budget_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE income_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_transactions ENABLE ROW LEVEL SECURITY;

-- Create policies for budget_items (allow all authenticated users)
CREATE POLICY "Allow all authenticated users to view budget items"
  ON budget_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow all authenticated users to insert budget items"
  ON budget_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow all authenticated users to update budget items"
  ON budget_items FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all authenticated users to delete budget items"
  ON budget_items FOR DELETE
  TO authenticated
  USING (true);

-- Create policies for income_transactions (allow all authenticated users)
CREATE POLICY "Allow all authenticated users to view income transactions"
  ON income_transactions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow all authenticated users to insert income transactions"
  ON income_transactions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow all authenticated users to update income transactions"
  ON income_transactions FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all authenticated users to delete income transactions"
  ON income_transactions FOR DELETE
  TO authenticated
  USING (true);

-- Create policies for expense_transactions (allow all authenticated users)
CREATE POLICY "Allow all authenticated users to view expense transactions"
  ON expense_transactions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow all authenticated users to insert expense transactions"
  ON expense_transactions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow all authenticated users to update expense transactions"
  ON expense_transactions FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all authenticated users to delete expense transactions"
  ON expense_transactions FOR DELETE
  TO authenticated
  USING (true);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_budget_items_updated_at
  BEFORE UPDATE ON budget_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_income_transactions_updated_at
  BEFORE UPDATE ON income_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_expense_transactions_updated_at
  BEFORE UPDATE ON expense_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
