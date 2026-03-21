-- Remove foreign key constraint on auth_user_id
-- This allows importing users without having corresponding auth.users entries

ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_auth_user_id_fkey;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
