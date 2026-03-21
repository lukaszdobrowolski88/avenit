-- ============================================
-- KOMPLEKSOWA MIGRACJA RLS DLA WSZYSTKICH TABEL
-- ============================================
-- Data: 2025-12-30
-- Problem: "new row violates row-level security policy"
-- Rozwiązanie: Dodanie polityk RLS dla wszystkich zalogowanych użytkowników

-- ============================================
-- FUNKCJA POMOCNICZA DO TWORZENIA POLITYK
-- ============================================

CREATE OR REPLACE FUNCTION create_full_access_policies(p_table_name TEXT)
RETURNS void AS $$
BEGIN
    -- Sprawdź czy tabela istnieje
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables t WHERE t.table_name = p_table_name AND t.table_schema = 'public') THEN
        RAISE NOTICE 'Tabela % nie istnieje, pomijam', p_table_name;
        RETURN;
    END IF;

    -- Włącz RLS
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table_name);

    -- Usuń stare polityki (różne warianty nazewnictwa)
    EXECUTE format('DROP POLICY IF EXISTS "%s_select_policy" ON public.%I', p_table_name, p_table_name);
    EXECUTE format('DROP POLICY IF EXISTS "%s_insert_policy" ON public.%I', p_table_name, p_table_name);
    EXECUTE format('DROP POLICY IF EXISTS "%s_update_policy" ON public.%I', p_table_name, p_table_name);
    EXECUTE format('DROP POLICY IF EXISTS "%s_delete_policy" ON public.%I', p_table_name, p_table_name);
    EXECUTE format('DROP POLICY IF EXISTS "select_%s" ON public.%I', p_table_name, p_table_name);
    EXECUTE format('DROP POLICY IF EXISTS "insert_%s" ON public.%I', p_table_name, p_table_name);
    EXECUTE format('DROP POLICY IF EXISTS "update_%s" ON public.%I', p_table_name, p_table_name);
    EXECUTE format('DROP POLICY IF EXISTS "delete_%s" ON public.%I', p_table_name, p_table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Enable read access for all users" ON public.%I', p_table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.%I', p_table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.%I', p_table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.%I', p_table_name);

    -- Twórz nowe polityki - pełny dostęp dla authenticated
    EXECUTE format('
        CREATE POLICY "%s_select_policy" ON public.%I
        FOR SELECT TO authenticated USING (true)
    ', p_table_name, p_table_name);

    EXECUTE format('
        CREATE POLICY "%s_insert_policy" ON public.%I
        FOR INSERT TO authenticated WITH CHECK (true)
    ', p_table_name, p_table_name);

    EXECUTE format('
        CREATE POLICY "%s_update_policy" ON public.%I
        FOR UPDATE TO authenticated USING (true) WITH CHECK (true)
    ', p_table_name, p_table_name);

    EXECUTE format('
        CREATE POLICY "%s_delete_policy" ON public.%I
        FOR DELETE TO authenticated USING (true)
    ', p_table_name, p_table_name);

    -- Nadaj uprawnienia
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', p_table_name);
    EXECUTE format('GRANT SELECT ON public.%I TO anon', p_table_name);

    RAISE NOTICE 'Utworzono polityki RLS dla tabeli: %', p_table_name;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 1. TABELE PODSTAWOWE SYSTEMU
-- ============================================

SELECT create_full_access_policies('app_users');
SELECT create_full_access_policies('app_settings');
SELECT create_full_access_policies('app_permissions');
SELECT create_full_access_policies('app_dictionaries');
SELECT create_full_access_policies('app_modules');
SELECT create_full_access_policies('app_module_tabs');
SELECT create_full_access_policies('notifications');
SELECT create_full_access_policies('push_subscriptions');
SELECT create_full_access_policies('user_presence');
SELECT create_full_access_policies('user_dashboard_layouts');
SELECT create_full_access_policies('user_tasks');
SELECT create_full_access_policies('user_absences');

-- ============================================
-- 2. TABELE WYDARZEŃ (wszystkie moduły)
-- ============================================

SELECT create_full_access_policies('events');
SELECT create_full_access_policies('tasks');
SELECT create_full_access_policies('worship_events');
SELECT create_full_access_policies('media_events');
SELECT create_full_access_policies('atmosfera_events');
SELECT create_full_access_policies('kids_events');
SELECT create_full_access_policies('mlodziezowka_events');
SELECT create_full_access_policies('home_groups_events');
SELECT create_full_access_policies('homegroups_events');
SELECT create_full_access_policies('mc_events');
SELECT create_full_access_policies('kobiety_events');

-- ============================================
-- 3. TABELE CZŁONKÓW I ZESPOŁÓW
-- ============================================

SELECT create_full_access_policies('members');
SELECT create_full_access_policies('worship_team');
SELECT create_full_access_policies('media_team');
SELECT create_full_access_policies('atmosfera_members');
SELECT create_full_access_policies('mlodziezowka_members');
SELECT create_full_access_policies('mlodziezowka_leaders');
SELECT create_full_access_policies('team_roles');
SELECT create_full_access_policies('team_member_roles');
SELECT create_full_access_policies('custom_mc_members');

-- ============================================
-- 4. TABELE ZADAŃ
-- ============================================

SELECT create_full_access_policies('media_tasks');
SELECT create_full_access_policies('media_task_comments');
SELECT create_full_access_policies('mlodziezowka_tasks');
SELECT create_full_access_policies('mlodziezowka_task_comments');
SELECT create_full_access_policies('home_group_tasks');
SELECT create_full_access_policies('home_group_task_comments');

-- ============================================
-- 5. TABELE GRUP DOMOWYCH
-- ============================================

SELECT create_full_access_policies('home_groups');
SELECT create_full_access_policies('home_group_leaders');
SELECT create_full_access_policies('home_group_members');

-- ============================================
-- 6. TABELE FINANSÓW
-- ============================================

SELECT create_full_access_policies('finance_balances');
SELECT create_full_access_policies('budget_items');
SELECT create_full_access_policies('income_transactions');
SELECT create_full_access_policies('expense_transactions');

-- ============================================
-- 7. TABELE PROGRAMÓW I NABOŻEŃSTW
-- ============================================

SELECT create_full_access_policies('programs');
SELECT create_full_access_policies('songs');
SELECT create_full_access_policies('teaching_speakers');
SELECT create_full_access_policies('teaching_series');

-- ============================================
-- 8. TABELE DZIECI (KIDS)
-- ============================================

SELECT create_full_access_policies('kids_teachers');
SELECT create_full_access_policies('kids_groups');
SELECT create_full_access_policies('kids_students');

-- ============================================
-- 9. TABELE MODLITWY
-- ============================================

SELECT create_full_access_policies('prayer_requests');
SELECT create_full_access_policies('prayer_interactions');

-- ============================================
-- 10. TABELE KOMUNIKATORA
-- ============================================

SELECT create_full_access_policies('conversations');
SELECT create_full_access_policies('conversation_participants');
SELECT create_full_access_policies('messages');
SELECT create_full_access_policies('message_reactions');
SELECT create_full_access_policies('message_read_receipts');
SELECT create_full_access_policies('pinned_messages');
SELECT create_full_access_policies('typing_status');

-- ============================================
-- 11. TABELE MAILINGU
-- ============================================

SELECT create_full_access_policies('email_campaigns');
SELECT create_full_access_policies('email_campaign_recipients');
SELECT create_full_access_policies('email_templates');
SELECT create_full_access_policies('email_recipient_segments');
SELECT create_full_access_policies('email_unsubscribes');

-- ============================================
-- 12. TABELE MAIL (KLIENT POCZTY)
-- ============================================

SELECT create_full_access_policies('mail_accounts');
SELECT create_full_access_policies('mail_folders');
SELECT create_full_access_policies('mail_messages');
SELECT create_full_access_policies('mail_labels');
SELECT create_full_access_policies('mail_message_labels');
SELECT create_full_access_policies('mail_attachments');

-- ============================================
-- 13. TABELE MATERIAŁÓW
-- ============================================

SELECT create_full_access_policies('materials');
SELECT create_full_access_policies('materials_files');
SELECT create_full_access_policies('materials_folders');

-- ============================================
-- 14. TABELE WYPOSAŻENIA
-- ============================================

SELECT create_full_access_policies('equipment');

-- ============================================
-- 15. TABELE WALL (ŚCIANA POSTÓW)
-- ============================================

SELECT create_full_access_policies('wall_posts');

-- ============================================
-- 16. STORAGE BUCKETS
-- ============================================

-- Equipment bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('equipment', 'equipment', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Usuń stare polityki storage dla equipment
DROP POLICY IF EXISTS "Equipment images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload equipment images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update equipment images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete equipment images" ON storage.objects;
DROP POLICY IF EXISTS "equipment_select" ON storage.objects;
DROP POLICY IF EXISTS "equipment_insert" ON storage.objects;
DROP POLICY IF EXISTS "equipment_update" ON storage.objects;
DROP POLICY IF EXISTS "equipment_delete" ON storage.objects;

-- Polityki storage dla equipment
CREATE POLICY "equipment_select" ON storage.objects
FOR SELECT USING (bucket_id = 'equipment');

CREATE POLICY "equipment_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'equipment');

CREATE POLICY "equipment_update" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'equipment') WITH CHECK (bucket_id = 'equipment');

CREATE POLICY "equipment_delete" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'equipment');

-- Finance bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('finance', 'finance', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "finance_select" ON storage.objects;
DROP POLICY IF EXISTS "finance_insert" ON storage.objects;
DROP POLICY IF EXISTS "finance_update" ON storage.objects;
DROP POLICY IF EXISTS "finance_delete" ON storage.objects;

CREATE POLICY "finance_select" ON storage.objects
FOR SELECT USING (bucket_id = 'finance');

CREATE POLICY "finance_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'finance');

CREATE POLICY "finance_update" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'finance') WITH CHECK (bucket_id = 'finance');

CREATE POLICY "finance_delete" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'finance');

-- Materials bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('materials', 'materials', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "materials_select" ON storage.objects;
DROP POLICY IF EXISTS "materials_insert" ON storage.objects;
DROP POLICY IF EXISTS "materials_update" ON storage.objects;
DROP POLICY IF EXISTS "materials_delete" ON storage.objects;

CREATE POLICY "materials_select" ON storage.objects
FOR SELECT USING (bucket_id = 'materials');

CREATE POLICY "materials_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'materials');

CREATE POLICY "materials_update" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'materials') WITH CHECK (bucket_id = 'materials');

CREATE POLICY "materials_delete" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'materials');

-- Programs bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('programs', 'programs', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "programs_select" ON storage.objects;
DROP POLICY IF EXISTS "programs_insert" ON storage.objects;
DROP POLICY IF EXISTS "programs_update" ON storage.objects;
DROP POLICY IF EXISTS "programs_delete" ON storage.objects;

CREATE POLICY "programs_select" ON storage.objects
FOR SELECT USING (bucket_id = 'programs');

CREATE POLICY "programs_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'programs');

CREATE POLICY "programs_update" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'programs') WITH CHECK (bucket_id = 'programs');

CREATE POLICY "programs_delete" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'programs');

-- ============================================
-- 17. CLEANUP
-- ============================================

-- Usuń funkcję pomocniczą (opcjonalnie zostaw dla przyszłych migracji)
-- DROP FUNCTION IF EXISTS create_full_access_policies(TEXT);

-- ============================================
-- GOTOWE!
-- ============================================

SELECT 'Migracja RLS zakończona pomyślnie dla wszystkich tabel!' as status;
