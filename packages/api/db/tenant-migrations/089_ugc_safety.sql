-- 089: Bezpieczeństwo treści użytkowników (wytyczna App Store 1.2) + zasady społeczności.
-- Samo DDL, w pełni idempotentne. Logika: lib/moderation.js, fn content-report / moderate-content /
-- community-terms / delete-my-account.

-- Zgłoszenia obejmują nie tylko wiadomości Komunikatora, ale też prośby ze ściany modlitwy i wpisy
-- tablic zespołów. Dla nich message_id/conversation_id są puste, a cel wskazuje target_id
-- (treść i autor kopiowane przy zgłoszeniu, jak dla wiadomości).
ALTER TABLE message_reports ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT 'message';
ALTER TABLE message_reports ADD COLUMN IF NOT EXISTS target_id TEXT;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'message_reports_content_type_check') THEN
        ALTER TABLE message_reports ADD CONSTRAINT message_reports_content_type_check
            CHECK (content_type IN ('message', 'prayer', 'wall_post'));
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_message_reports_target_089 ON message_reports (content_type, target_id);

-- Akceptacja zasad społeczności (EULA z zakazem treści obraźliwych) — wymagana w aplikacji
-- mobilnej przed korzystaniem z treści użytkowników. Wersja pozwala wymusić ponowną akceptację.
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS terms_version TEXT;
