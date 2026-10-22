-- 118: Integracje Google Workspace / Microsoft 365 — Faza 1 (połączenie + synchronizacja kont z katalogu).
--
-- Wszystkie tabele są WYŁĄCZNIE serwerowe: nie ma ich w rejestrze /api/db (dataapi/registry.js),
-- więc przeglądarka nie czyta ani nie zapisuje ich bezpośrednio — tylko fn workspace-integration
-- i directory-sync (src/integrations/*). Tokeny dostępu i odświeżania są szyfrowane
-- (lib/mailcrypto.js, AES-256-GCM — jak sekrety SSO) i nigdy nie wracają do klienta.
--
--   • integration_connections   — połączenie z dostawcą: kościoła (scope_kind 'tenant', np. katalog)
--                                 albo osoby (scope_kind 'user' — Faza 2/3: kalendarz, pliki).
--   • integration_oauth_states  — jednorazowe stany OAuth (PKCE code_verifier, krok zgody Microsoft).
--   • workspace_integration_settings — ustawienia per dostawca: własna aplikacja OAuth kościoła
--                                 (client_id + zaszyfrowany sekret) i ustawienia synchronizacji katalogu.
--   • directory_links           — powiązanie konta Avenit z kontem w katalogu (provider + external_id).
--   • directory_sync_runs       — historia synchronizacji (podgląd / ręczna / harmonogram) z licznikami.
--
-- Idempotentnie (IF NOT EXISTS) i bezpiecznie dla żywego tenanta: nic istniejącego nie jest zmieniane.

CREATE TABLE IF NOT EXISTS integration_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
    scope_kind TEXT NOT NULL DEFAULT 'tenant' CHECK (scope_kind IN ('tenant', 'user')),
    external_tenant TEXT,              -- Microsoft: id katalogu (tid); Google: domena (hd) / customer id
    account_email TEXT,                -- kto połączył (konto administratora u dostawcy)
    scopes TEXT[] NOT NULL DEFAULT '{}',
    access_token_enc TEXT,
    refresh_token_enc TEXT,
    expires_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error', 'revoked')),
    last_error TEXT,
    created_by TEXT,                   -- e-mail osoby w Avenit, która połączyła
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- user_id: typ = typ app_users.id (uuid w szablonie i na produkcji) — jak w 026/117.
DO $$
DECLARE id_type text;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'integration_connections' AND column_name = 'user_id') THEN
    RETURN;
  END IF;
  IF to_regclass('public.app_users') IS NOT NULL THEN
    SELECT format_type(a.atttypid, a.atttypmod) INTO id_type
      FROM pg_attribute a WHERE a.attrelid = 'public.app_users'::regclass AND a.attname = 'id' AND NOT a.attisdropped;
  END IF;
  IF id_type IS NULL THEN
    ALTER TABLE integration_connections ADD COLUMN user_id UUID;
  ELSE
    EXECUTE format('ALTER TABLE integration_connections ADD COLUMN user_id %s REFERENCES app_users(id) ON DELETE CASCADE', id_type);
  END IF;
END $$;

-- Jedno połączenie kościoła na dostawcę i jedno połączenie osoby na dostawcę.
CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_connections_tenant_118
    ON integration_connections (provider) WHERE scope_kind = 'tenant';
CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_connections_user_118
    ON integration_connections (provider, user_id) WHERE scope_kind = 'user';

CREATE TABLE IF NOT EXISTS integration_oauth_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,
    purpose TEXT NOT NULL,             -- 'directory' (Faza 1); później 'calendar', 'files'
    scope_kind TEXT NOT NULL DEFAULT 'tenant',
    user_id TEXT,                      -- id konta Avenit, które rozpoczęło łączenie
    user_email TEXT,
    code_verifier TEXT NOT NULL,       -- PKCE (S256)
    nonce_hash TEXT NOT NULL,          -- sha256 nonce z ciasteczka przeglądarki (wiązanie z sesją)
    step TEXT NOT NULL DEFAULT 'authorize', -- Microsoft: 'authorize' → 'admin_consent'
    ext_tenant TEXT,                   -- Microsoft: tid potwierdzony w kroku logowania
    account_email TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_integration_oauth_states_exp_118 ON integration_oauth_states (expires_at);

CREATE TABLE IF NOT EXISTS workspace_integration_settings (
    provider TEXT PRIMARY KEY CHECK (provider IN ('google', 'microsoft')),
    client_id TEXT,
    client_secret_enc TEXT,
    ms_tenant TEXT,
    directory JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS directory_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,
    external_id TEXT NOT NULL,
    email TEXT,
    last_seen_at TIMESTAMPTZ,
    blocked_by_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
DECLARE id_type text;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'directory_links' AND column_name = 'user_id') THEN
    RETURN;
  END IF;
  IF to_regclass('public.app_users') IS NOT NULL THEN
    SELECT format_type(a.atttypid, a.atttypmod) INTO id_type
      FROM pg_attribute a WHERE a.attrelid = 'public.app_users'::regclass AND a.attname = 'id' AND NOT a.attisdropped;
  END IF;
  IF id_type IS NULL THEN
    ALTER TABLE directory_links ADD COLUMN user_id UUID NOT NULL;
  ELSE
    EXECUTE format('ALTER TABLE directory_links ADD COLUMN user_id %s NOT NULL REFERENCES app_users(id) ON DELETE CASCADE', id_type);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_directory_links_ext_118 ON directory_links (provider, external_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_directory_links_user_118 ON directory_links (provider, user_id);

CREATE TABLE IF NOT EXISTS directory_sync_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,
    trigger TEXT NOT NULL DEFAULT 'manual', -- 'preview' | 'manual' | 'schedule'
    dry_run BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'running', -- 'running' | 'ok' | 'error'
    counts JSONB NOT NULL DEFAULT '{}'::jsonb,
    errors JSONB NOT NULL DEFAULT '[]'::jsonb,
    actor TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_directory_sync_runs_118 ON directory_sync_runs (provider, started_at DESC);
