-- Push tokens dla aplikacji mobilnej (Expo Push API).
-- Równoległa do istniejącej tabeli push_subscriptions (web-push / VAPID).
-- Edge function send-push będzie czytać obie tabele i wysyłać do odpowiednich providerów.

CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  expo_token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  device_name TEXT,
  app_version TEXT,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_email);
CREATE INDEX IF NOT EXISTS idx_push_tokens_seen ON push_tokens(last_seen_at);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- User widzi tylko swoje urządzenia.
CREATE POLICY "push_tokens_select_own" ON push_tokens
  FOR SELECT TO authenticated
  USING (user_email = auth.jwt() ->> 'email');

-- User może zarejestrować/zaktualizować tylko swój token.
CREATE POLICY "push_tokens_insert_own" ON push_tokens
  FOR INSERT TO authenticated
  WITH CHECK (user_email = auth.jwt() ->> 'email');

CREATE POLICY "push_tokens_update_own" ON push_tokens
  FOR UPDATE TO authenticated
  USING (user_email = auth.jwt() ->> 'email')
  WITH CHECK (user_email = auth.jwt() ->> 'email');

CREATE POLICY "push_tokens_delete_own" ON push_tokens
  FOR DELETE TO authenticated
  USING (user_email = auth.jwt() ->> 'email');

-- service_role (edge function send-push) ma pełny dostęp.
GRANT ALL ON push_tokens TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON push_tokens TO authenticated;
