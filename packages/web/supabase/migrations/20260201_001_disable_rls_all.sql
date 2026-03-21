-- Disable RLS on all tables to allow access
-- This is temporary - proper RLS policies should be added later for production

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ALTER TABLE IF EXISTS %I DISABLE ROW LEVEL SECURITY', tbl);
    END LOOP;
END $$;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
