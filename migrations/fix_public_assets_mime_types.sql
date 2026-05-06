-- Fix: bucket 'public-assets' odrzucał PDF/DOC/MP3 mimo że UI w SongForm pozwala je wgrać.
-- Synchronizujemy allowed_mime_types z atrybutem `accept` inputu (.pdf,.jpg,.jpeg,.png,.doc,.docx,.mp3,.wav).

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/wave'
  ],
  file_size_limit = 10485760  -- 10 MB, zgodnie z komunikatem w UI
WHERE id = 'public-assets';
