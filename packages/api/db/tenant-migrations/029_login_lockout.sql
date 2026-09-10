-- 029: Anty-brute-force per konto — licznik nieudanych logowań + czasowa blokada.
-- ADDYTYWNE i idempotentne. Login zwiększa licznik przy błędnym haśle; po progu ustawia
-- locked_until (czasowa blokada), a udane logowanie zeruje. Progi w kodzie (5 prób / 15 min).
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
