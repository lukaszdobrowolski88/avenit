-- Dodaj pole system_default do mail_accounts
-- To konto będzie używane do wysyłania maili z kont wewnętrznych do odbiorców zewnętrznych

ALTER TABLE mail_accounts ADD COLUMN IF NOT EXISTS system_default BOOLEAN DEFAULT false;

-- Tylko jedno konto może być systemowe
CREATE UNIQUE INDEX IF NOT EXISTS idx_mail_accounts_system_default
  ON mail_accounts(system_default) WHERE system_default = true;

-- Komentarz
COMMENT ON COLUMN mail_accounts.system_default IS 'Konto używane do wysyłania maili systemowych (z kont wewnętrznych do zewnętrznych odbiorców)';
