-- Fix push_subscriptions: align table with frontend (usePushNotifications.js)
-- and Edge Function send-push, which both expect schema:
--   user_email TEXT, endpoint TEXT UNIQUE, p256dh TEXT, auth TEXT, user_agent TEXT.
-- Production currently has the older schema with user_id/keys JSONB and
-- UNIQUE(user_id, endpoint), so upsert(onConflict: 'endpoint') fails with
-- "there is no unique or exclusion constraint matching the ON CONFLICT specification".

BEGIN;

-- 1. Make sure the table exists in some form.
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Add columns expected by app code if they are missing.
ALTER TABLE public.push_subscriptions
    ADD COLUMN IF NOT EXISTS user_email TEXT,
    ADD COLUMN IF NOT EXISTS p256dh     TEXT,
    ADD COLUMN IF NOT EXISTS auth       TEXT,
    ADD COLUMN IF NOT EXISTS user_agent TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 3. Backfill p256dh/auth from legacy `keys` JSONB column if it exists.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'push_subscriptions' AND column_name = 'keys'
    ) THEN
        UPDATE public.push_subscriptions
           SET p256dh = COALESCE(p256dh, keys->>'p256dh'),
               auth   = COALESCE(auth,   keys->>'auth')
         WHERE keys IS NOT NULL;
    END IF;
END $$;

-- 4. Drop legacy composite unique (user_id, endpoint) if present, plus the legacy `keys` column.
DO $$
DECLARE
    cname TEXT;
BEGIN
    SELECT conname INTO cname
      FROM pg_constraint
     WHERE conrelid = 'public.push_subscriptions'::regclass
       AND contype = 'u'
       AND (
           SELECT array_agg(attname ORDER BY attname)
             FROM pg_attribute
            WHERE attrelid = conrelid AND attnum = ANY(conkey)
       ) = ARRAY['endpoint','user_id']::name[];

    IF cname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.push_subscriptions DROP CONSTRAINT %I', cname);
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'push_subscriptions' AND column_name = 'keys'
    ) THEN
        ALTER TABLE public.push_subscriptions DROP COLUMN keys;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'push_subscriptions' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE public.push_subscriptions DROP COLUMN user_id;
    END IF;
END $$;

-- 5. Remove rows that cannot satisfy the new UNIQUE(endpoint) (duplicates).
--    Keep the most recent per endpoint.
DELETE FROM public.push_subscriptions a
 USING public.push_subscriptions b
 WHERE a.endpoint = b.endpoint
   AND a.created_at < b.created_at;

-- 6. Add UNIQUE(endpoint) if not already present.
DO $$
DECLARE
    has_unique_endpoint BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'public.push_subscriptions'::regclass
           AND contype = 'u'
           AND (
               SELECT array_agg(attname)
                 FROM pg_attribute
                WHERE attrelid = conrelid AND attnum = ANY(conkey)
           ) = ARRAY['endpoint']::name[]
    ) INTO has_unique_endpoint;

    IF NOT has_unique_endpoint THEN
        ALTER TABLE public.push_subscriptions
            ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);
    END IF;
END $$;

-- 7. Required-field constraints (NOT NULL where reasonable).
UPDATE public.push_subscriptions SET p256dh = '' WHERE p256dh IS NULL;
UPDATE public.push_subscriptions SET auth   = '' WHERE auth   IS NULL;
ALTER TABLE public.push_subscriptions
    ALTER COLUMN endpoint SET NOT NULL,
    ALTER COLUMN p256dh   SET NOT NULL,
    ALTER COLUMN auth     SET NOT NULL;

-- 8. Indexes.
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_email ON public.push_subscriptions(user_email);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint  ON public.push_subscriptions(endpoint);

-- 9. updated_at trigger.
CREATE OR REPLACE FUNCTION public.update_push_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_push_subscriptions_updated_at ON public.push_subscriptions;
CREATE TRIGGER trigger_update_push_subscriptions_updated_at
    BEFORE UPDATE ON public.push_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_push_subscriptions_updated_at();

-- 10. RLS — refresh policies to match user_email model.
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions_select_own"   ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions_insert_own"   ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions_update_own"   ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions_delete_own"   ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_subscriptions_service_select" ON public.push_subscriptions;

CREATE POLICY "push_subscriptions_select_own" ON public.push_subscriptions
    FOR SELECT TO authenticated
    USING (user_email = auth.jwt()->>'email');

CREATE POLICY "push_subscriptions_insert_own" ON public.push_subscriptions
    FOR INSERT TO authenticated
    WITH CHECK (user_email = auth.jwt()->>'email');

CREATE POLICY "push_subscriptions_update_own" ON public.push_subscriptions
    FOR UPDATE TO authenticated
    USING (user_email = auth.jwt()->>'email');

CREATE POLICY "push_subscriptions_delete_own" ON public.push_subscriptions
    FOR DELETE TO authenticated
    USING (user_email = auth.jwt()->>'email');

CREATE POLICY "push_subscriptions_service_select" ON public.push_subscriptions
    FOR SELECT TO service_role
    USING (true);

COMMIT;
