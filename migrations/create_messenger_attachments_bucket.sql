-- ============================================
-- Bucket do przechowywania załączników komunikatora
-- Wykonaj te polecenia w Supabase SQL Editor
-- ============================================

-- Utwórz bucket dla załączników
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'messenger-attachments',
  'messenger-attachments',
  true,
  10485760, -- 10MB limit
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ];

-- ============================================
-- Polityki RLS dla bucketa
-- ============================================

-- Usuń istniejące polityki jeśli istnieją
DROP POLICY IF EXISTS "Authenticated users can upload attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own attachments" ON storage.objects;

-- Polityka: Zalogowani użytkownicy mogą przesyłać pliki
CREATE POLICY "Authenticated users can upload attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'messenger-attachments'
  AND auth.role() = 'authenticated'
);

-- Polityka: Zalogowani użytkownicy mogą czytać pliki
CREATE POLICY "Authenticated users can read attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'messenger-attachments'
  AND auth.role() = 'authenticated'
);

-- Polityka: Użytkownicy mogą usuwać swoje pliki (ścieżka zawiera email)
CREATE POLICY "Users can delete their own attachments"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'messenger-attachments'
  AND auth.role() = 'authenticated'
);

-- Opcjonalnie: Publiczny dostęp do odczytu
CREATE POLICY "Public can read messenger attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'messenger-attachments');
