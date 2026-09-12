-- 050: Rozbudowa opcji wydarzeń — załączniki (grafiki/pliki) + terminy rejestracji i płatności.
-- attachments: lista [{name, url, path, type, size}] plików wgranych do bucketa public-assets.
-- registration_deadline / payment_deadline: do kiedy (data) można się rejestrować / zapłacić.
-- Idempotentne.
ALTER TABLE events ADD COLUMN IF NOT EXISTS attachments          jsonb DEFAULT '[]'::jsonb;
ALTER TABLE events ADD COLUMN IF NOT EXISTS registration_deadline date;
ALTER TABLE events ADD COLUMN IF NOT EXISTS payment_deadline      date;
