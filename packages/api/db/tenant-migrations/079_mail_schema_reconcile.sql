-- 079: Poczta i szablony Mailingu — dopasowanie schematu do kodu.
-- Szablon tenanta (tenant_schema.sql) ma DWIE definicje tabel poczty: najpierw starą, ogólną
-- (z migracji „remaining tables”), potem właściwą modułu Poczta. Obie są `CREATE TABLE IF NOT
-- EXISTS`, więc wygrywała stara i moduł Poczta nie działał (brak user_email, account_type,
-- encrypted_password…, błąd 42703), a Mailing nie ładował szablonów (brak email_templates.is_system).
-- Dodajemy brakujące kolumny (bez NOT NULL tam, gdzie mogłyby istnieć stare wiersze) i zdejmujemy
-- NOT NULL ze starej kolumny, której nowy kod nie wypełnia. Idempotentne.

-- Konta pocztowe (wewnętrzne @domena i zewnętrzne IMAP/SMTP)
ALTER TABLE mail_accounts ALTER COLUMN email DROP NOT NULL;
ALTER TABLE mail_accounts
  ADD COLUMN IF NOT EXISTS user_email TEXT,
  ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS external_email TEXT,
  ADD COLUMN IF NOT EXISTS imap_secure BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS smtp_secure BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS encrypted_password TEXT,
  ADD COLUMN IF NOT EXISTS signature TEXT,
  ADD COLUMN IF NOT EXISTS default_account BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS system_default BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS sync_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_error TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_mail_accounts_user_email ON mail_accounts(user_email);

-- Foldery
ALTER TABLE mail_folders
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS icon TEXT,
  ADD COLUMN IF NOT EXISTS position INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS imap_path TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Wiadomości (to_emails/cc_emails są w tej bazie jsonb — nazwy odbiorców też jako jsonb)
ALTER TABLE mail_messages
  ADD COLUMN IF NOT EXISTS in_reply_to TEXT,
  ADD COLUMN IF NOT EXISTS thread_id UUID,
  ADD COLUMN IF NOT EXISTS to_names JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cc_names JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS snippet TEXT,
  ADD COLUMN IF NOT EXISTS is_important BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS external_uid TEXT,
  ADD COLUMN IF NOT EXISTS raw_headers JSONB;

-- Załączniki
ALTER TABLE mail_attachments
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS file_size BIGINT,
  ADD COLUMN IF NOT EXISTS content_id TEXT,
  ADD COLUMN IF NOT EXISTS is_inline BOOLEAN DEFAULT false;

-- Etykiety per konto
ALTER TABLE mail_labels ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES mail_accounts(id) ON DELETE CASCADE;

-- Szablony wiadomości Poczty
ALTER TABLE mail_templates
  ADD COLUMN IF NOT EXISTS user_email TEXT,
  ADD COLUMN IF NOT EXISTS body_html TEXT,
  ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE mail_filter_rules ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Szablony Mailingu (kreator wizualny)
ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS json_design JSONB,
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false;
