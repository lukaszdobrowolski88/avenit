-- 125: Social Media — analityka postów i skrzynka komentarzy (Facebook, Instagram).
--
--   • social_metrics        — ostatnie metryki publikacji w kanale (worker social-insights): reakcje,
--                             komentarze, udostępnienia, zapisy, wyświetlenia, zasięg (FB: unikalne
--                             wyświetlenia mediów — następca wycofanego post_impressions_unique), kliknięcia.
--   • social_account_stats  — liczba obserwujących kanału dziennie (wykres wzrostu).
--   • social_comments       — komentarze pod opublikowanymi postami (worker social-comments, co 10 min):
--                             wątki (parent_external_id), własne odpowiedzi (is_own), status w skrzynce
--                             (new / read / replied), ukrycie. Odpowiedzi, ukrywanie i usuwanie — fn social.
-- Wszystko przez fn social (poza rejestrem /api/db). Idempotentnie.

CREATE TABLE IF NOT EXISTS social_metrics (
    target_id UUID PRIMARY KEY REFERENCES social_post_targets(id) ON DELETE CASCADE,
    account_id UUID,
    provider TEXT NOT NULL,
    likes INTEGER, comments INTEGER, shares INTEGER, saves INTEGER,
    views INTEGER, reach INTEGER, clicks INTEGER, interactions INTEGER,
    raw JSONB NOT NULL DEFAULT '{}'::jsonb,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_account_stats (
    account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    day DATE NOT NULL,
    followers INTEGER,
    PRIMARY KEY (account_id, day)
);

CREATE TABLE IF NOT EXISTS social_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,
    external_id TEXT NOT NULL,
    account_id UUID REFERENCES social_accounts(id) ON DELETE CASCADE,
    target_id UUID REFERENCES social_post_targets(id) ON DELETE SET NULL,
    post_external_id TEXT,
    parent_external_id TEXT,
    author_name TEXT,
    author_external_id TEXT,
    message TEXT NOT NULL DEFAULT '',
    created_time TIMESTAMPTZ,
    like_count INTEGER NOT NULL DEFAULT 0,
    is_own BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'replied')),
    hidden BOOLEAN NOT NULL DEFAULT false,
    replied_by TEXT,
    replied_at TIMESTAMPTZ,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_social_comments_ext_125 ON social_comments (provider, external_id);
CREATE INDEX IF NOT EXISTS idx_social_comments_status_125 ON social_comments (status, created_time DESC);
CREATE INDEX IF NOT EXISTS idx_social_comments_target_125 ON social_comments (target_id);

ALTER TABLE social_post_targets ADD COLUMN IF NOT EXISTS comments_synced_at TIMESTAMPTZ;
