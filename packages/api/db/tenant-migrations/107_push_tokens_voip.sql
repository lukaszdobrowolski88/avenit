-- 107: Natywne dzwonienie w aplikacji mobilnej (VoIP push → systemowy ekran połączenia, także przy
-- zabitej aplikacji). Urządzenie dopisuje do SWOJEGO wiersza push_tokens (dopasowanie po expo_token,
-- /api/db — ownership.js, właściciel user_email) token VoIP:
--   voip_token      — token PushKit (iOS, APNs VoIP) albo token FCM (Android),
--   voip_type       — 'APNS_VOIP' | 'FCM',
--   voip_env        — środowisko APNs: 'production' | 'sandbox' (build deweloperski),
--   voip_updated_at — kiedy urządzenie ostatnio zgłosiło token.
-- Serwer (src/push/voip.js) przy dzwonieniu wysyła VoIP na urządzenia z tokenem i pomija je w
-- zwykłym pushu Expo; martwy token (APNs 410/BadDeviceToken, FCM UNREGISTERED) zeruje.
ALTER TABLE IF EXISTS push_tokens ADD COLUMN IF NOT EXISTS voip_token TEXT;
ALTER TABLE IF EXISTS push_tokens ADD COLUMN IF NOT EXISTS voip_type TEXT;
ALTER TABLE IF EXISTS push_tokens ADD COLUMN IF NOT EXISTS voip_env TEXT DEFAULT 'production';
ALTER TABLE IF EXISTS push_tokens ADD COLUMN IF NOT EXISTS voip_updated_at TIMESTAMPTZ;

DO $$
BEGIN
  IF to_regclass('push_tokens') IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_tokens_voip_type_check') THEN
    ALTER TABLE push_tokens ADD CONSTRAINT push_tokens_voip_type_check
      CHECK (voip_type IS NULL OR voip_type IN ('APNS_VOIP', 'FCM'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_tokens_voip_env_check') THEN
    ALTER TABLE push_tokens ADD CONSTRAINT push_tokens_voip_env_check
      CHECK (voip_env IS NULL OR voip_env IN ('production', 'sandbox'));
  END IF;
  CREATE INDEX IF NOT EXISTS idx_push_tokens_voip_token ON push_tokens (voip_token) WHERE voip_token IS NOT NULL;
END $$;
