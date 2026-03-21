-- ============================================================================
-- FUNKCJE DO AUTOMATYCZNEGO TWORZENIA STRUKTUR DLA NIESTANDARDOWYCH MODUŁÓW
-- Uruchom ten skrypt w Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- 1. FUNKCJA: Tworzenie tabeli członków dla modułu
-- ============================================================================
CREATE OR REPLACE FUNCTION create_custom_members_table(table_name TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Sprawdź czy tabela już istnieje
  IF NOT EXISTS (
    SELECT FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename = table_name
  ) THEN
    -- Utwórz tabelę
    EXECUTE format('
      CREATE TABLE public.%I (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        full_name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        role TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )', table_name);

    -- Włącz RLS
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);

    -- Utwórz politykę RLS dla uwierzytelnionych użytkowników
    EXECUTE format('
      CREATE POLICY "Allow all for authenticated users" ON public.%I
      FOR ALL USING (auth.role() = ''authenticated'')
    ', table_name);

    -- Dodaj indeks na full_name
    EXECUTE format('CREATE INDEX idx_%I_full_name ON public.%I(full_name)', table_name, table_name);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION create_custom_members_table(TEXT) TO authenticated;

-- ============================================================================
-- 2. FUNKCJA: Tworzenie kolumny grafiku w tabeli programs
-- ============================================================================
CREATE OR REPLACE FUNCTION create_schedule_column(module_key TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  col_name TEXT := 'custom_' || module_key || '_schedule';
BEGIN
  -- Sprawdź czy kolumna już istnieje
  IF NOT EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'programs'
    AND column_name = col_name
  ) THEN
    -- Dodaj kolumnę JSONB do tabeli programs
    EXECUTE format('ALTER TABLE public.programs ADD COLUMN IF NOT EXISTS %I JSONB DEFAULT ''{}''::jsonb', col_name);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION create_schedule_column(TEXT) TO authenticated;

-- ============================================================================
-- 3. FUNKCJA: Tworzenie tabeli zadań dla modułu
-- ============================================================================
CREATE OR REPLACE FUNCTION create_custom_tasks_table(table_name TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename = table_name
  ) THEN
    EXECUTE format('
      CREATE TABLE public.%I (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT ''todo'',
        priority TEXT DEFAULT ''medium'',
        assigned_to TEXT,
        due_date DATE,
        created_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )', table_name);

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('
      CREATE POLICY "Allow all for authenticated users" ON public.%I
      FOR ALL USING (auth.role() = ''authenticated'')
    ', table_name);
    EXECUTE format('CREATE INDEX idx_%I_status ON public.%I(status)', table_name, table_name);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION create_custom_tasks_table(TEXT) TO authenticated;

-- ============================================================================
-- 4. FUNKCJA: Tworzenie tabeli wpisów na tablicy (wall) dla modułu
-- ============================================================================
CREATE OR REPLACE FUNCTION create_custom_wall_table(table_name TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename = table_name
  ) THEN
    EXECUTE format('
      CREATE TABLE public.%I (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        content TEXT NOT NULL,
        author_email TEXT,
        author_name TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )', table_name);

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('
      CREATE POLICY "Allow all for authenticated users" ON public.%I
      FOR ALL USING (auth.role() = ''authenticated'')
    ', table_name);
    EXECUTE format('CREATE INDEX idx_%I_created ON public.%I(created_at DESC)', table_name, table_name);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION create_custom_wall_table(TEXT) TO authenticated;

-- ============================================================================
-- 5. FUNKCJA: Główna funkcja inicjalizacji wszystkich struktur dla modułu
-- ============================================================================
CREATE OR REPLACE FUNCTION initialize_custom_module(module_key TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Utwórz tabelę członków
  PERFORM create_custom_members_table('custom_' || module_key || '_members');

  -- Utwórz tabelę zadań
  PERFORM create_custom_tasks_table('custom_' || module_key || '_tasks');

  -- Utwórz tabelę tablicy
  PERFORM create_custom_wall_table('custom_' || module_key || '_wall');

  -- Utwórz kolumnę grafiku w programs
  PERFORM create_schedule_column(module_key);
END;
$$;

GRANT EXECUTE ON FUNCTION initialize_custom_module(TEXT) TO authenticated;

-- ============================================================================
-- 6. FUNKCJA: Usuwanie wszystkich struktur modułu (przy usuwaniu modułu)
-- ============================================================================
CREATE OR REPLACE FUNCTION cleanup_custom_module(module_key TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  col_name TEXT := 'custom_' || module_key || '_schedule';
BEGIN
  -- Usuń tabele (jeśli istnieją)
  EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', 'custom_' || module_key || '_members');
  EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', 'custom_' || module_key || '_tasks');
  EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', 'custom_' || module_key || '_wall');

  -- Usuń kolumnę grafiku z programs (jeśli istnieje)
  IF EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'programs'
    AND column_name = col_name
  ) THEN
    EXECUTE format('ALTER TABLE public.programs DROP COLUMN IF EXISTS %I', col_name);
  END IF;

  -- Usuń służby (roles) związane z tym modułem
  DELETE FROM public.team_roles WHERE team_type = module_key;
  DELETE FROM public.team_member_roles WHERE member_table = 'custom_' || module_key || '_members';
END;
$$;

GRANT EXECUTE ON FUNCTION cleanup_custom_module(TEXT) TO authenticated;

-- ============================================================================
-- 7. TRIGGER: Automatyczne tworzenie struktur przy dodawaniu modułu
-- ============================================================================
CREATE OR REPLACE FUNCTION on_module_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Tylko dla niesystemowych modułów
  IF NEW.is_system = false THEN
    PERFORM initialize_custom_module(NEW.key);
  END IF;
  RETURN NEW;
END;
$$;

-- Usuń istniejący trigger jeśli istnieje
DROP TRIGGER IF EXISTS trigger_module_created ON public.app_modules;

-- Utwórz trigger
CREATE TRIGGER trigger_module_created
  AFTER INSERT ON public.app_modules
  FOR EACH ROW
  EXECUTE FUNCTION on_module_created();

-- ============================================================================
-- 8. TRIGGER: Automatyczne usuwanie struktur przy usuwaniu modułu
-- ============================================================================
CREATE OR REPLACE FUNCTION on_module_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Tylko dla niesystemowych modułów
  IF OLD.is_system = false THEN
    PERFORM cleanup_custom_module(OLD.key);
  END IF;
  RETURN OLD;
END;
$$;

-- Usuń istniejący trigger jeśli istnieje
DROP TRIGGER IF EXISTS trigger_module_deleted ON public.app_modules;

-- Utwórz trigger
CREATE TRIGGER trigger_module_deleted
  AFTER DELETE ON public.app_modules
  FOR EACH ROW
  EXECUTE FUNCTION on_module_deleted();
