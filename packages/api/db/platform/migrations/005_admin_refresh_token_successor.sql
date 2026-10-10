-- 005: Następca refresh tokenu panelu admina (jak tenant 100_refresh_token_successor) —
-- ta sama logika rotacji (src/auth/tokens.js rotateRefreshToken). Idempotentne.
ALTER TABLE admin_refresh_tokens ADD COLUMN IF NOT EXISTS replaced_by_hash TEXT;
