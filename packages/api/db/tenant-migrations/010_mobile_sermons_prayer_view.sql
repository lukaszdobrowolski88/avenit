-- 010: Domknięcie backendu pod aplikację mobilną.
--
-- Dwa moduły mobilne (Kazania, Ściana modlitwy) odwoływały się do obiektów,
-- których istniejące tenanty nie miały udostępnionych:
--   • `sermons`                    — tabela z migracji 006 (mogła nie powstać na
--                                     starszych tenantach), dodatkowo NIE była
--                                     w rejestrze Data API (fail-closed).
--   • `prayer_requests_with_counts`— widok istniał TYLKO w template/tenant_schema.sql
--                                     (nie w migracjach), więc tenanty założone
--                                     wcześniej go nie miały; też poza rejestrem.
--
-- Ta migracja jest w pełni idempotentna i defensywna: nie zakłada konkretnego
-- wariantu tabel prayer_* (template ma kilka historycznych, sprzecznych wersji —
-- patrz build-tenant-schema.mjs), tylko DOKŁADA brakujące kolumny i przebudowuje
-- widok na jawnych kolumnach (bez `pr.*`, by uniknąć kolizji `prayer_count`).
-- Rejestracja w Data API i uprawnienia: patrz src/dataapi/registry.js.

-- ── Kazania ────────────────────────────────────────────────────────────────
-- Kolumny 1:1 z SERMON_COLUMNS w mobile (features/sermons/api.ts). Baza per-tenant
-- jest granicą najemcy, więc bez tenant_id.
CREATE TABLE IF NOT EXISTS sermons (
    id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title         TEXT NOT NULL,
    speaker       TEXT,
    series        TEXT,
    sermon_date   DATE,
    scripture_ref TEXT,
    description   TEXT,
    audio_url     TEXT,
    video_url     TEXT,
    notes         TEXT,
    is_published  BOOLEAN DEFAULT false,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sermons_published_date_idx
    ON sermons (is_published, sermon_date DESC);

-- ── Modlitwy: dołóż kolumny wymagane przez mobile (features/prayers/api.ts) ──
-- Istniejące dane pozostają nietknięte; brakujące kolumny stają się NULL/DEFAULT.
ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS user_email         TEXT;
ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS user_name          TEXT;
ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS requester_name     TEXT;
ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS category           TEXT;
ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS visibility         TEXT DEFAULT 'public';
ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS status             TEXT DEFAULT 'active';
ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS answered_testimony TEXT;
ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS is_anonymous       BOOLEAN DEFAULT false;
ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS is_active          BOOLEAN DEFAULT true;
ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ DEFAULT NOW();

-- prayer_interactions: mobile pisze { request_id, user_email }. Dołóż user_email
-- i poluzuj ewentualne stare `type NOT NULL` (starsza wersja tabeli), by insert
-- z samym e-mailem nie padał.
ALTER TABLE prayer_interactions ADD COLUMN IF NOT EXISTS user_email TEXT;
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'prayer_interactions'
          AND column_name = 'type'
          AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE prayer_interactions ALTER COLUMN type DROP NOT NULL;
    END IF;
END $$;

-- ── Widok z licznikami ──────────────────────────────────────────────────────
-- Jawne kolumny = odporność na to, czy bazowa prayer_requests ma własną kolumnę
-- prayer_count (część historycznych wariantów ma — `pr.*` dałoby duplikat nazwy).
-- Liczniki liczymy na żywo z prayer_interactions.
DROP VIEW IF EXISTS prayer_requests_with_counts;
CREATE VIEW prayer_requests_with_counts AS
SELECT
    pr.id,
    pr.user_email,
    pr.user_name,
    pr.requester_name,
    pr.content,
    pr.category,
    pr.visibility,
    pr.is_anonymous,
    pr.is_active,
    pr.status,
    pr.answered_testimony,
    pr.created_at,
    pr.updated_at,
    COALESCE(pi.prayer_count, 0)               AS prayer_count,
    COALESCE(pi.praying_users, '[]'::jsonb)     AS praying_users
FROM prayer_requests pr
LEFT JOIN (
    SELECT
        request_id,
        COUNT(*)                  AS prayer_count,
        jsonb_agg(user_email)     AS praying_users
    FROM prayer_interactions
    GROUP BY request_id
) pi ON pi.request_id = pr.id;
