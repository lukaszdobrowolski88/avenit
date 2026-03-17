-- ============================================
-- Bucket do przechowywania deklaracji członkostwa
-- Wykonaj te polecenia w Supabase SQL Editor
-- ============================================

-- Utwórz bucket dla deklaracji członkostwa
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'membership-declarations',
  'membership-declarations',
  true,
  10485760, -- 10MB limit
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf'];

-- ============================================
-- Polityki RLS dla bucketa
-- ============================================

-- Usuń istniejące polityki jeśli istnieją
DROP POLICY IF EXISTS "Authenticated users can upload declarations" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read declarations" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete declarations" ON storage.objects;
DROP POLICY IF EXISTS "Public can read declarations" ON storage.objects;

-- Polityka: Zalogowani użytkownicy mogą przesyłać pliki
CREATE POLICY "Authenticated users can upload declarations"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'membership-declarations'
  AND auth.role() = 'authenticated'
);

-- Polityka: Zalogowani użytkownicy mogą czytać pliki
CREATE POLICY "Authenticated users can read declarations"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'membership-declarations'
  AND auth.role() = 'authenticated'
);

-- Polityka: Zalogowani użytkownicy mogą usuwać pliki
CREATE POLICY "Authenticated users can delete declarations"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'membership-declarations'
  AND auth.role() = 'authenticated'
);

-- Opcjonalnie: Publiczny dostęp do odczytu (jeśli bucket jest publiczny)
CREATE POLICY "Public can read declarations"
ON storage.objects FOR SELECT
USING (bucket_id = 'membership-declarations');
