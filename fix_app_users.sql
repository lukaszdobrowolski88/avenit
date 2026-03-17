-- Run this in Supabase SQL Editor
-- First check current structure
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'app_users';
