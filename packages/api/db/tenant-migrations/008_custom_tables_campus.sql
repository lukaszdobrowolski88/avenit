-- Migracja 008: kampusy w tabelach modułów własnych (parytet z modułami systemowymi).
-- Dodaje campus_id do wszystkich istniejących tabel custom_* (members/tasks/wall/events…),
-- aby MembersTab/TasksTab mogły filtrować po kampusie i stemplować campus_id na insert.
-- Nowe tabele dostają kolumnę już z definicji (rpc.js SHAPES).
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'custom\_%'
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS campus_id UUID', t);
  END LOOP;
END $$;
