-- Add description field to expense_transactions
ALTER TABLE expense_transactions
ADD COLUMN IF NOT EXISTS description TEXT;

-- Change document fields to arrays for multiple attachments
ALTER TABLE expense_transactions
DROP COLUMN IF EXISTS document_url,
DROP COLUMN IF EXISTS document_name;

ALTER TABLE expense_transactions
ADD COLUMN IF NOT EXISTS documents JSONB DEFAULT '[]';

-- documents will be stored as array of objects: [{ url: 'string', name: 'string' }]
