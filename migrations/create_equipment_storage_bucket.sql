-- ============================================
-- STORAGE BUCKET DLA ZDJĘĆ WYPOSAŻENIA
-- ============================================

-- Utwórz bucket dla zdjęć wyposażenia
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'equipment',
    'equipment',
    true,
    5242880, -- 5MB limit
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- ============================================
-- Polityki RLS dla bucketa
-- ============================================

-- Polityka: Wszyscy mogą odczytywać zdjęcia (publiczny bucket)
CREATE POLICY "equipment_bucket_public_select"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'equipment');

-- Polityka: Zalogowani mogą odczytywać zdjęcia
CREATE POLICY "equipment_bucket_select_authenticated"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'equipment');

-- Polityka: Liderzy+ mogą przesyłać zdjęcia
CREATE POLICY "equipment_bucket_insert_leaders"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'equipment' AND
    EXISTS (
        SELECT 1 FROM app_users
        WHERE email = auth.jwt()->>'email'
        AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
    )
);

-- Polityka: Liderzy+ mogą aktualizować zdjęcia
CREATE POLICY "equipment_bucket_update_leaders"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'equipment' AND
    EXISTS (
        SELECT 1 FROM app_users
        WHERE email = auth.jwt()->>'email'
        AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
    )
);

-- Polityka: Liderzy+ mogą usuwać zdjęcia
CREATE POLICY "equipment_bucket_delete_leaders"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'equipment' AND
    EXISTS (
        SELECT 1 FROM app_users
        WHERE email = auth.jwt()->>'email'
        AND role IN ('superadmin', 'rada_starszych', 'koordynator', 'lider')
    )
);
