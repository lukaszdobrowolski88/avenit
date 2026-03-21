-- ============================================
-- NAPRAWA RLS - WERSJA 3
-- ============================================

-- ============================================
-- FUNKCJA POMOCNICZA
-- ============================================

CREATE OR REPLACE FUNCTION fix_table_rls(p_table_name TEXT)
RETURNS void AS $$
DECLARE
    r RECORD;
BEGIN
    -- Sprawdź czy tabela istnieje
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables t
        WHERE t.table_name = p_table_name AND t.table_schema = 'public'
    ) THEN
        RAISE NOTICE 'Tabela % nie istnieje, pomijam', p_table_name;
        RETURN;
    END IF;

    -- Włącz RLS
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table_name);

    -- Usuń WSZYSTKIE polityki dla tej tabeli
    FOR r IN (
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = p_table_name
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, p_table_name);
    END LOOP;

    -- Twórz nowe proste polityki
    EXECUTE format('
        CREATE POLICY "allow_select_%s" ON public.%I
        FOR SELECT USING (true)
    ', p_table_name, p_table_name);

    EXECUTE format('
        CREATE POLICY "allow_insert_%s" ON public.%I
        FOR INSERT TO authenticated WITH CHECK (true)
    ', p_table_name, p_table_name);

    EXECUTE format('
        CREATE POLICY "allow_update_%s" ON public.%I
        FOR UPDATE TO authenticated USING (true) WITH CHECK (true)
    ', p_table_name, p_table_name);

    EXECUTE format('
        CREATE POLICY "allow_delete_%s" ON public.%I
        FOR DELETE TO authenticated USING (true)
    ', p_table_name, p_table_name);

    -- Nadaj uprawnienia
    EXECUTE format('GRANT ALL ON public.%I TO authenticated', p_table_name);
    EXECUTE format('GRANT SELECT ON public.%I TO anon', p_table_name);

    RAISE NOTICE 'Naprawiono RLS dla tabeli: %', p_table_name;

EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Błąd dla tabeli %: %', p_table_name, SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- NAPRAW WSZYSTKIE TABELE
-- ============================================

DO $$
DECLARE
    tbl RECORD;
BEGIN
    FOR tbl IN (
        SELECT t.table_name
        FROM information_schema.tables t
        WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND t.table_name NOT LIKE 'pg_%'
        AND t.table_name NOT LIKE '_supabase%'
    ) LOOP
        PERFORM fix_table_rls(tbl.table_name);
    END LOOP;
END $$;

-- ============================================
-- STORAGE BUCKETS
-- ============================================

DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN (
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "storage_public_select" ON storage.objects
FOR SELECT USING (true);

CREATE POLICY "storage_auth_insert" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "storage_auth_update" ON storage.objects
FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "storage_auth_delete" ON storage.objects
FOR DELETE TO authenticated USING (true);

SELECT 'Migracja RLS v3 zakończona!' as status;
