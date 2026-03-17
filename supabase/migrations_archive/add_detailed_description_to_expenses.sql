-- Add detailed_description field to expense_transactions
ALTER TABLE expense_transactions
ADD COLUMN IF NOT EXISTS detailed_description TEXT;
