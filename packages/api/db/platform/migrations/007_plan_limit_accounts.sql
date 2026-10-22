-- 007: Limit planu liczony w KONTACH UŻYTKOWNIKÓW (app_users tenanta) zamiast dorosłych w bazie
-- członków (decyzja właściciela 2026-10). Limit nadal w subscription_plans.max_members (nazwa
-- historyczna — teraz oznacza limit kont), wartości 50/150/400/1000/-1 bez zmian; opisy planów nie
-- wspominały dorosłych, więc ich nie ruszamy.
--
-- Comiesięczne odczyty (worker) zapisują teraz liczbę kont: nowa kolumna accounts (+ oczekujące
-- pending_accounts). Kolumna adults zostaje jako historia sprzed zmiany i przestaje być wymagana.
-- Idempotentne (bezpieczne do ponownego uruchomienia); to samo jest w schema.sql.
ALTER TABLE tenant_usage_snapshots ADD COLUMN IF NOT EXISTS accounts INTEGER;
ALTER TABLE tenant_usage_snapshots ADD COLUMN IF NOT EXISTS pending_accounts INTEGER;
ALTER TABLE tenant_usage_snapshots ALTER COLUMN adults DROP NOT NULL;
COMMENT ON COLUMN subscription_plans.max_members IS 'Limit kont użytkowników planu (app_users: aktywne konta); -1 = bez limitu. Nazwa historyczna.';
COMMENT ON COLUMN tenant_usage_snapshots.adults IS 'Historia (do 2026-10): dorośli w bazie członków. Nowe odczyty: accounts.';
COMMENT ON COLUMN tenant_usage_snapshots.accounts IS 'Aktywne konta użytkowników (limit planu) na początek miesiąca.';
