-- 121: Social Media — planowanie i publikacja postów na Facebooku (strony) i Instagramie (konta
-- firmowe), jak Buffer. Kod: packages/api/src/social/*, fn social, worker co minutę.
--
--   • social_accounts      — podłączone kanały (strona FB / konto IG). Token strony szyfrowany
--                            (lib/mailcrypto.js, AES-256-GCM jak integracje) — w rejestrze /api/db
--                            tylko do odczytu, z ukrytymi kolumnami tokenu.
--   • social_oauth_states  — jednorazowe stany logowania Meta (WYŁĄCZNIE serwerowe, poza rejestrem).
--   • social_posts         — post (treść i media wspólne, status, termin, akceptacja).
--   • social_post_targets  — publikacja posta w kanale: własna treść/media/opcje, status, próby,
--                            postęp przetwarzania (kontenery Instagrama), link do opublikowanego.
--   • social_queue_slots   — harmonogram kolejki: dzień tygodnia + godzina (czas polski), dla
--                            wszystkich kanałów (account_id NULL) albo konkretnego.
--   • social_hashtag_groups — zapisane zestawy hashtagów do wstawiania w kompozytorze.
--
-- Zapis postów i zmian statusu WYŁĄCZNIE przez fn social (akceptacja, prawo publikacji) —
-- w /api/db tabele postów są tylko do odczytu. Idempotentnie (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS social_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,                -- 'facebook' | 'instagram' (kolejne sieci bez zmiany schematu)
    external_id TEXT NOT NULL,             -- id strony FB / id konta IG (Graph API)
    name TEXT NOT NULL DEFAULT '',
    username TEXT,                         -- IG: @nazwa
    avatar_url TEXT,
    page_id TEXT,                          -- IG: strona FB, przez którą konto jest podłączone
    access_token_enc TEXT,                 -- token strony (bezterminowy z tokenu długoterminowego)
    token_expires_at TIMESTAMPTZ,
    fb_user_id TEXT,                       -- kto połączył (id w aplikacji Meta) — usuwanie danych na żądanie Meta
    scopes TEXT[] NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error', 'revoked')),
    last_error TEXT,
    connected_by TEXT,                     -- e-mail osoby w Avenit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_social_accounts_ext_121 ON social_accounts (provider, external_id);

CREATE TABLE IF NOT EXISTS social_oauth_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,
    user_id TEXT,
    user_email TEXT,
    nonce_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL DEFAULT '',
    media JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{ path, url, mime, kind, width, height, size, duration, alt }]
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'pending_approval', 'scheduled', 'publishing', 'published', 'partial', 'failed')),
    scheduled_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    tags TEXT[] NOT NULL DEFAULT '{}',
    source_type TEXT,                      -- skąd post (np. 'event', 'sermon') — „Udostępnij” z modułów
    source_id TEXT,
    review_note TEXT,                      -- uwagi przy odesłaniu do poprawy
    created_by TEXT,                       -- e-mail autora
    updated_by TEXT,
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_posts_status_121 ON social_posts (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_social_posts_sched_121 ON social_posts (scheduled_at);

CREATE TABLE IF NOT EXISTS social_post_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
    account_id UUID REFERENCES social_accounts(id) ON DELETE SET NULL,
    provider TEXT NOT NULL,
    account_name TEXT,                     -- migawka nazwy (historia po odłączeniu kanału)
    content TEXT,                          -- NULL = treść posta
    media JSONB,                           -- NULL = media posta
    options JSONB NOT NULL DEFAULT '{}'::jsonb,  -- IG: { format: feed|reel|story, first_comment }; FB: { first_comment, link }
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'publishing', 'processing', 'published', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ,
    lease_until TIMESTAMPTZ,
    progress JSONB NOT NULL DEFAULT '{}'::jsonb, -- kontenery IG w przetwarzaniu, start przetwarzania
    external_id TEXT,
    permalink TEXT,
    error TEXT,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_post_targets_post_121 ON social_post_targets (post_id);
CREATE INDEX IF NOT EXISTS idx_social_post_targets_due_121 ON social_post_targets (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_social_post_targets_account_121 ON social_post_targets (account_id);

CREATE TABLE IF NOT EXISTS social_queue_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID REFERENCES social_accounts(id) ON DELETE CASCADE,
    weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 7),  -- ISO: 1 = poniedziałek
    time TEXT NOT NULL CHECK (time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_hashtag_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    hashtags TEXT NOT NULL DEFAULT '',
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Moduł w menu (app_modules) ───────────────────────────────────────────────
-- W standardzie (wszystkie plany). Dostęp: administrator i role z module:* / '*' (rada,
-- koordynator); lider i członek — dopiero po nadaniu w Ustawienia → Uprawnienia.
DO $$
BEGIN
  IF to_regclass('public.app_modules') IS NULL THEN RETURN; END IF;
  INSERT INTO app_modules (key, label, icon, path, resource_key, display_order, is_system, is_enabled, component_name)
  SELECT 'social', 'Social Media', 'Share2', '/social', 'module:social',
         COALESCE((SELECT MAX(display_order) FROM app_modules), 0) + 1,
         true, true, 'SocialModule'
  WHERE NOT EXISTS (SELECT 1 FROM app_modules WHERE key = 'social');
END $$;
