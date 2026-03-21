-- Add missing title column to programs
ALTER TABLE programs ADD COLUMN IF NOT EXISTS title TEXT;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
