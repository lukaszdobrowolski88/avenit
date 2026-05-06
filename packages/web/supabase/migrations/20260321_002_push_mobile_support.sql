-- =====================================================
-- MOBILE PUSH NOTIFICATION SUPPORT
-- =====================================================

-- Rozszerzenie push_subscriptions o wsparcie dla mobile
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'web';
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS expo_push_token TEXT;
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Unikalny constraint: jeden token per user per platforma
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_user_platform
  ON push_subscriptions(user_id, platform);

-- Indeks do wyszukiwania tokenów per platforma
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_platform
  ON push_subscriptions(platform);

COMMENT ON COLUMN push_subscriptions.platform IS 'Platforma: web, ios, android';
COMMENT ON COLUMN push_subscriptions.expo_push_token IS 'Token Expo Push dla mobile (iOS/Android)';

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
