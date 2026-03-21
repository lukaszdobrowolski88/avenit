-- ============================================
-- NAPRAWA RLS DLA APP_USERS
-- ============================================
-- Problem: "due to access control checks"

-- Usuń wszystkie polityki dla app_users
DROP POLICY IF EXISTS "allow_select_app_users" ON public.app_users;
DROP POLICY IF EXISTS "allow_insert_app_users" ON public.app_users;
DROP POLICY IF EXISTS "allow_update_app_users" ON public.app_users;
DROP POLICY IF EXISTS "allow_delete_app_users" ON public.app_users;
DROP POLICY IF EXISTS "app_users_select_policy" ON public.app_users;
DROP POLICY IF EXISTS "app_users_insert_policy" ON public.app_users;
DROP POLICY IF EXISTS "app_users_update_policy" ON public.app_users;
DROP POLICY IF EXISTS "app_users_delete_policy" ON public.app_users;

-- Włącz RLS
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

-- SELECT - WSZYSCY mogą czytać (anon + authenticated)
CREATE POLICY "app_users_select_all" ON public.app_users
FOR SELECT USING (true);

-- INSERT - tylko authenticated
CREATE POLICY "app_users_insert_auth" ON public.app_users
FOR INSERT TO authenticated WITH CHECK (true);

-- UPDATE - tylko authenticated
CREATE POLICY "app_users_update_auth" ON public.app_users
FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- DELETE - tylko authenticated
CREATE POLICY "app_users_delete_auth" ON public.app_users
FOR DELETE TO authenticated USING (true);

-- Nadaj pełne uprawnienia
GRANT ALL ON public.app_users TO authenticated;
GRANT SELECT ON public.app_users TO anon;

-- To samo dla user_presence
DROP POLICY IF EXISTS "allow_select_user_presence" ON public.user_presence;
DROP POLICY IF EXISTS "allow_insert_user_presence" ON public.user_presence;
DROP POLICY IF EXISTS "allow_update_user_presence" ON public.user_presence;
DROP POLICY IF EXISTS "allow_delete_user_presence" ON public.user_presence;

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_presence_select_all" ON public.user_presence
FOR SELECT USING (true);

CREATE POLICY "user_presence_insert_auth" ON public.user_presence
FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "user_presence_update_auth" ON public.user_presence
FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "user_presence_delete_auth" ON public.user_presence
FOR DELETE TO authenticated USING (true);

GRANT ALL ON public.user_presence TO authenticated;
GRANT SELECT ON public.user_presence TO anon;

SELECT 'Naprawiono RLS dla app_users i user_presence!' as status;
