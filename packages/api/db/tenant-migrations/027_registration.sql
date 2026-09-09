-- 027: Rejestracja użytkowników — stan konta rozdzielający „oczekujące" od „zablokowane".
-- Dotąd był tylko is_active (login: 403 „Konto zablokowane"). Dodajemy status + pending_kind
-- (dlaczego oczekuje: 'email' = potwierdzenie e-mail, 'admin' = zatwierdzenie) oraz token
-- weryfikacji e-mail. W PEŁNI ADDYTYWNE i idempotentne (ADD COLUMN IF NOT EXISTS), bezpieczne
-- dla każdego tenanta. Tryb rejestracji i domyślna rola trzymane w app_settings (bez migracji).
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'; -- active | pending | blocked
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS pending_kind VARCHAR(10);                       -- 'email' | 'admin' (gdy status='pending')
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS verify_token_hash TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS verify_expires TIMESTAMPTZ;

-- Istniejące nieaktywne konta traktuj jako zablokowane (nie „oczekujące na zgodę").
UPDATE app_users SET status = 'blocked' WHERE is_active = FALSE AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_app_users_status ON app_users(status);
CREATE INDEX IF NOT EXISTS idx_app_users_verify_token ON app_users(verify_token_hash);
