-- Poprawka RLS dla tabel ical_subscriptions i totp_auth_logs
-- Używa auth.jwt()->>'email' zamiast subquery

-- =====================================
-- NAPRAW ICAL_SUBSCRIPTIONS
-- =====================================

-- Upewnij się że tabela istnieje
CREATE TABLE IF NOT EXISTS ical_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  export_preferences JSONB DEFAULT '{
    "programs": true,
    "events": true,
    "tasks": true,
    "mlodziezowka": false,
    "worship": false,
    "media": false,
    "atmosfera": false,
    "kids": false,
    "homegroups": false
  }'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ,
  access_count INTEGER DEFAULT 0
);

-- Indeksy
CREATE INDEX IF NOT EXISTS idx_ical_subscriptions_user ON ical_subscriptions(user_email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ical_subscriptions_token ON ical_subscriptions(token);

-- Włącz RLS
ALTER TABLE ical_subscriptions ENABLE ROW LEVEL SECURITY;

-- Usuń stare polityki
DROP POLICY IF EXISTS "ical_subscriptions_select_own" ON ical_subscriptions;
DROP POLICY IF EXISTS "ical_subscriptions_insert_own" ON ical_subscriptions;
DROP POLICY IF EXISTS "ical_subscriptions_update_own" ON ical_subscriptions;
DROP POLICY IF EXISTS "ical_subscriptions_delete_own" ON ical_subscriptions;

-- Nowe polityki z auth.jwt()->>'email'
CREATE POLICY "ical_subscriptions_select_own" ON ical_subscriptions
  FOR SELECT TO authenticated
  USING (user_email = auth.jwt()->>'email');

CREATE POLICY "ical_subscriptions_insert_own" ON ical_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (user_email = auth.jwt()->>'email');

CREATE POLICY "ical_subscriptions_update_own" ON ical_subscriptions
  FOR UPDATE TO authenticated
  USING (user_email = auth.jwt()->>'email')
  WITH CHECK (user_email = auth.jwt()->>'email');

CREATE POLICY "ical_subscriptions_delete_own" ON ical_subscriptions
  FOR DELETE TO authenticated
  USING (user_email = auth.jwt()->>'email');

-- Uprawnienia
GRANT ALL ON ical_subscriptions TO authenticated;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_ical_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_ical_subscriptions_updated_at ON ical_subscriptions;
CREATE TRIGGER trigger_ical_subscriptions_updated_at
  BEFORE UPDATE ON ical_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_ical_subscriptions_updated_at();

-- =====================================
-- NAPRAW TOTP_AUTH_LOGS
-- =====================================

-- Upewnij się że tabela istnieje
CREATE TABLE IF NOT EXISTS totp_auth_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  action TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeksy
CREATE INDEX IF NOT EXISTS idx_totp_auth_logs_user_email ON totp_auth_logs(user_email);
CREATE INDEX IF NOT EXISTS idx_totp_auth_logs_created_at ON totp_auth_logs(created_at);

-- Włącz RLS
ALTER TABLE totp_auth_logs ENABLE ROW LEVEL SECURITY;

-- Usuń stare polityki
DROP POLICY IF EXISTS "totp_auth_logs_insert_authenticated" ON totp_auth_logs;
DROP POLICY IF EXISTS "totp_auth_logs_select_own" ON totp_auth_logs;

-- Nowe polityki z auth.jwt()->>'email'
CREATE POLICY "totp_auth_logs_insert_own" ON totp_auth_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_email = auth.jwt()->>'email');

CREATE POLICY "totp_auth_logs_select_own" ON totp_auth_logs
  FOR SELECT TO authenticated
  USING (user_email = auth.jwt()->>'email');

-- Uprawnienia
GRANT ALL ON totp_auth_logs TO authenticated;

SELECT 'Naprawiono polityki RLS dla ical_subscriptions i totp_auth_logs!' as status;
