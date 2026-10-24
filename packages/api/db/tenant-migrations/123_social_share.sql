-- 123: Social Media — udostępnianie z Avenit, krótkie linki i reguły automatyczne.
--
--   • social_links       — krótkie linki https://<kościół>.avenit.pl/l/<kod>: adres docelowy (z UTM),
--                          rodzaj (url / event / sermon / bio), licznik kliknięć. Link do wydarzenia
--                          pokazuje publiczną kartę wydarzenia (wydarzenia nie mają publicznej strony),
--                          link do kazania — podgląd dla Facebooka i przekierowanie na /sermon/<slug>.
--   • social_rules       — reguły: nowe kazanie / przypomnienie o wydarzeniu → szkic, do akceptacji
--                          albo kolejka, w wybranych kanałach, z szablonem treści.
--   • social_rule_runs   — co reguła już utworzyła (bez duplikatów).
-- Ustawienia (app_settings, JSON): social_settings { shorten_links, utm }, social_link_page (strona linków).
-- Wszystko przez fn social i trasy publiczne (poza rejestrem /api/db). Idempotentnie.

CREATE TABLE IF NOT EXISTS social_links (
    code TEXT PRIMARY KEY,
    kind TEXT NOT NULL DEFAULT 'url',     -- url | event | sermon | bio
    target_url TEXT,
    ref_id TEXT,                          -- id wydarzenia / kazania
    title TEXT,
    description TEXT,
    image_url TEXT,
    post_id UUID REFERENCES social_posts(id) ON DELETE SET NULL,
    provider TEXT,                        -- kanał, w którym link opublikowano (atrybucja kliknięć)
    clicks INTEGER NOT NULL DEFAULT 0,
    last_click_at TIMESTAMPTZ,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_links_ref_123 ON social_links (kind, ref_id);
CREATE INDEX IF NOT EXISTS idx_social_links_post_123 ON social_links (post_id);

CREATE TABLE IF NOT EXISTS social_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL DEFAULT '',
    trigger TEXT NOT NULL,                -- sermon_published | event_reminder
    config JSONB NOT NULL DEFAULT '{}'::jsonb,   -- event_reminder: { days_before, only_general }
    action TEXT NOT NULL DEFAULT 'draft', -- draft | submit | queue
    account_ids UUID[] NOT NULL DEFAULT '{}',
    template TEXT NOT NULL DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_rule_runs (
    rule_id UUID NOT NULL REFERENCES social_rules(id) ON DELETE CASCADE,
    ref_key TEXT NOT NULL,
    post_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (rule_id, ref_key)
);
