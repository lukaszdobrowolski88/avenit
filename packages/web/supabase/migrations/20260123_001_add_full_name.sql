-- Add full_name column to app_users
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
