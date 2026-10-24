-- 124: Social Media — pomysły na posty i biblioteka mediów.
--
--   • social_ideas        — tablica pomysłów (kolumny: Pomysły / W przygotowaniu / Gotowe): tytuł, treść,
--                           zdjęcia/wideo, etykiety; „Utwórz post” otwiera kompozytor, a zapisany post
--                           wiąże się z pomysłem (post_id).
--   • social_media_items  — biblioteka mediów: pliki z bucketu social-media do ponownego użycia
--                           (wgrane do biblioteki, zaimportowane z Plików i użyte w postach — serwer
--                           dopisuje je przy zapisie posta). Sprzątanie plików (social-maintenance)
--                           nie usuwa plików z biblioteki ani z pomysłów.
-- Zwykły CRUD przez /api/db w zakresie modułu (module:social + res:<tabela>:<op>). Idempotentnie.

CREATE TABLE IF NOT EXISTS social_ideas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    media JSONB NOT NULL DEFAULT '[]'::jsonb,
    tags TEXT[] NOT NULL DEFAULT '{}',
    column_key TEXT NOT NULL DEFAULT 'idea' CHECK (column_key IN ('idea', 'progress', 'ready')),
    position DOUBLE PRECISION NOT NULL DEFAULT 0,
    post_id UUID REFERENCES social_posts(id) ON DELETE SET NULL,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_ideas_column_124 ON social_ideas (column_key, position);

CREATE TABLE IF NOT EXISTS social_media_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    path TEXT NOT NULL,
    mime TEXT,
    kind TEXT NOT NULL DEFAULT 'image' CHECK (kind IN ('image', 'video')),
    width INTEGER,
    height INTEGER,
    size BIGINT,
    duration DOUBLE PRECISION,
    alt TEXT,
    name TEXT,
    tags TEXT[] NOT NULL DEFAULT '{}',
    source TEXT NOT NULL DEFAULT 'upload',   -- upload | post | materials
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_social_media_items_path_124 ON social_media_items (path);
