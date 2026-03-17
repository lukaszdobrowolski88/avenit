-- ============================================
-- Aktualizacja tabeli members
-- Nowe funkcjonalności: statusy, członkostwo, służby
-- ============================================

-- Dodaj nowe kolumny do tabeli members
ALTER TABLE members
ADD COLUMN IF NOT EXISTS home_group_id UUID REFERENCES home_groups(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS membership_date DATE,
ADD COLUMN IF NOT EXISTS membership_declaration_url TEXT,
ADD COLUMN IF NOT EXISTS ministries TEXT[] DEFAULT '{}';

-- Zaktualizuj istniejące statusy na nowe wartości
UPDATE members SET status = 'Sympatyk' WHERE status = 'Aktywny';
UPDATE members SET status = 'Gość' WHERE status = 'Nieaktywny';
UPDATE members SET status = 'Gość' WHERE status = 'Urlop';
UPDATE members SET status = 'Sympatyk' WHERE status IS NULL OR status = '';

-- Dodaj constraint dla statusów
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_status_check;
ALTER TABLE members ADD CONSTRAINT members_status_check
  CHECK (status IN ('Członek', 'Sympatyk', 'Gość'));

-- Indeksy dla nowych kolumn
CREATE INDEX IF NOT EXISTS idx_members_home_group ON members(home_group_id);
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
CREATE INDEX IF NOT EXISTS idx_members_ministries ON members USING GIN(ministries);

-- ============================================
-- Bucket do przechowywania deklaracji członkostwa
-- ============================================

-- Utwórz bucket dla deklaracji (wykonaj w Supabase Dashboard -> Storage)
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('membership-declarations', 'membership-declarations', true)
-- ON CONFLICT (id) DO NOTHING;

-- Polityki RLS dla bucketa (wykonaj w Supabase Dashboard)
-- CREATE POLICY "Authenticated users can upload declarations"
-- ON storage.objects FOR INSERT
-- WITH CHECK (bucket_id = 'membership-declarations' AND auth.role() = 'authenticated');

-- CREATE POLICY "Authenticated users can read declarations"
-- ON storage.objects FOR SELECT
-- USING (bucket_id = 'membership-declarations' AND auth.role() = 'authenticated');

-- CREATE POLICY "Authenticated users can delete declarations"
-- ON storage.objects FOR DELETE
-- USING (bucket_id = 'membership-declarations' AND auth.role() = 'authenticated');

-- ============================================
-- Migracja danych z home_group (string) do home_group_id (UUID)
-- ============================================

-- Jeśli istnieje kolumna home_group (string), przeprowadź migrację
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'home_group'
  ) THEN
    -- Zaktualizuj home_group_id na podstawie nazwy grupy
    UPDATE members m
    SET home_group_id = hg.id
    FROM home_groups hg
    WHERE m.home_group = hg.name AND m.home_group_id IS NULL;

    -- Opcjonalnie: usuń starą kolumnę home_group
    -- ALTER TABLE members DROP COLUMN IF EXISTS home_group;
  END IF;
END $$;

-- ============================================
-- Komentarze do kolumn
-- ============================================

COMMENT ON COLUMN members.status IS 'Status osoby: Członek, Sympatyk, Gość';
COMMENT ON COLUMN members.home_group_id IS 'ID grupy domowej (referencja do home_groups)';
COMMENT ON COLUMN members.membership_date IS 'Data przyjęcia do członkostwa';
COMMENT ON COLUMN members.membership_declaration_url IS 'URL do pliku PDF z deklaracją członkostwa';
COMMENT ON COLUMN members.ministries IS 'Tablica kluczy służb: media_team, atmosfera_team, worship_team, home_groups, kids_ministry, administration';
