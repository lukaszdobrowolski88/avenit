-- Dodanie wsparcia dla dwuskładnikowej autentykacji (2FA/TOTP)

-- Kolumny 2FA w tabeli app_users
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS totp_verified_at TIMESTAMPTZ;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS totp_backup_codes JSONB DEFAULT '[]';

-- Indeks dla szybkiego sprawdzania statusu 2FA
CREATE INDEX IF NOT EXISTS idx_app_users_totp_enabled ON app_users(totp_enabled);

-- Tabela logów 2FA (opcjonalna, dla audytu)
CREATE TABLE IF NOT EXISTS totp_auth_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  action TEXT NOT NULL, -- 'setup', 'verify', 'disable', 'backup_used'
  success BOOLEAN NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeks dla logów
CREATE INDEX IF NOT EXISTS idx_totp_auth_logs_user_email ON totp_auth_logs(user_email);
CREATE INDEX IF NOT EXISTS idx_totp_auth_logs_created_at ON totp_auth_logs(created_at);

-- RLS dla logów 2FA
ALTER TABLE totp_auth_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "totp_auth_logs_insert_authenticated" ON totp_auth_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "totp_auth_logs_select_own" ON totp_auth_logs
  FOR SELECT TO authenticated
  USING (user_email = (SELECT email FROM auth.users WHERE id = auth.uid()));
