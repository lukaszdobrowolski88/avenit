-- Fix app_dictionaries structure

-- Add missing columns to app_dictionaries
ALTER TABLE app_dictionaries ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE app_dictionaries ADD COLUMN IF NOT EXISTS key TEXT;
ALTER TABLE app_dictionaries ADD COLUMN IF NOT EXISTS value TEXT;
ALTER TABLE app_dictionaries ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE app_dictionaries ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE app_dictionaries ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE app_dictionaries ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE app_dictionaries ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Add missing columns to home_group_leaders
ALTER TABLE home_group_leaders ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE home_group_leaders ADD COLUMN IF NOT EXISTS user_name TEXT;
ALTER TABLE home_group_leaders ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
