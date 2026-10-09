-- =====================================================================
-- AVENIT — cennik „za dorosłych” (2026-10, sekcja #cennik na avenit.pl)
-- =====================================================================
-- Plan = limit DOROSŁYCH w bazie członków (max_members). Wszystkie moduły w każdym planie,
-- bez limitu użytkowników (max_users i pozostałe max_* = -1). Ceny BRUTTO w groszach,
-- rok = 10 × miesiąc („2 mies. gratis”). Sieć = wycena indywidualna (is_custom, cena „od”).
-- Lustro: packages/shared/src/billing/catalog.js (test pricing-pglite pilnuje zgodności).
--
-- Idempotentne (bezpieczne do ponownego uruchomienia). Runner uruchamia plik raz (_migrations),
-- więc późniejsze edycje planów z panelu admina nie są nadpisywane przy kolejnych deployach.
-- Istniejących subskrypcji NIE zmieniamy (bezpieczeństwo rozliczeń) — tenanci na starych planach
-- zostają na nich, panel pokazuje „plan wycofany” i sugerowany nowy plan.

ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS limit_buffer_pct INTEGER DEFAULT 10;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS is_custom BOOLEAN DEFAULT FALSE;
ALTER TABLE tenant_subscriptions ADD COLUMN IF NOT EXISTS custom_price_monthly INTEGER;
ALTER TABLE tenant_subscriptions ADD COLUMN IF NOT EXISTS custom_price_yearly INTEGER;

INSERT INTO subscription_plans (name, slug, key, description, price_monthly, price_yearly,
  max_members, max_users, max_groups, max_kids, max_events, max_storage_mb, trial_days, features,
  limit_buffer_pct, is_custom, is_active, is_public, sort_order) VALUES
('Start', 'start', 'start', 'Dla małego zboru, który chce uporządkować niedzielę i ludzi.',
  7900, 79000, 50, -1, -1, -1, -1, -1, 14, '{"all_modules": true, "priority_support": false}'::jsonb, 10, FALSE, TRUE, TRUE, 1),
('Wspólnota', 'wspolnota', 'wspolnota', 'Dla zboru z kilkoma służbami, grupami domowymi i szkółką.',
  15900, 159000, 150, -1, -1, -1, -1, -1, 14, '{"all_modules": true, "priority_support": false}'::jsonb, 10, FALSE, TRUE, TRUE, 2),
('Kościół', 'kosciol', 'kosciol', 'Dla kościoła z wieloma zespołami, młodzieżówką i finansami służb.',
  29900, 299000, 400, -1, -1, -1, -1, -1, 14, '{"all_modules": true, "priority_support": false}'::jsonb, 10, FALSE, TRUE, TRUE, 3),
('Kościół+', 'kosciol_plus', 'kosciol_plus', 'Dla dużego kościoła. Z priorytetowym wsparciem.',
  49900, 499000, 1000, -1, -1, -1, -1, -1, 14, '{"all_modules": true, "priority_support": true}'::jsonb, 10, FALSE, TRUE, TRUE, 4),
('Sieć', 'siec', 'siec', 'Wycena indywidualna: kampusy, wdrożenie dla wielu zborów i priorytetowe wsparcie.',
  89900, NULL, -1, -1, -1, -1, -1, -1, 14, '{"all_modules": true, "priority_support": true}'::jsonb, 10, TRUE, TRUE, TRUE, 5)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, key = EXCLUDED.key, description = EXCLUDED.description,
  price_monthly = EXCLUDED.price_monthly, price_yearly = EXCLUDED.price_yearly,
  max_members = EXCLUDED.max_members, max_users = EXCLUDED.max_users, max_groups = EXCLUDED.max_groups,
  max_kids = EXCLUDED.max_kids, max_events = EXCLUDED.max_events, max_storage_mb = EXCLUDED.max_storage_mb,
  trial_days = EXCLUDED.trial_days, features = EXCLUDED.features,
  limit_buffer_pct = EXCLUDED.limit_buffer_pct, is_custom = EXCLUDED.is_custom,
  is_active = EXCLUDED.is_active, is_public = EXCLUDED.is_public, sort_order = EXCLUDED.sort_order;

-- Stare plany: nie oferujemy (ukryte i nieaktywne). Subskrypcje na nich zostają bez zmian.
UPDATE subscription_plans SET is_public = FALSE, is_active = FALSE, sort_order = 100 + COALESCE(sort_order, 0)
 WHERE slug IN ('starter', 'standard', 'professional', 'enterprise') AND (is_public OR is_active);

-- Comiesięczny zapis liczby dorosłych (worker) — także w schema.sql.
CREATE TABLE IF NOT EXISTS tenant_usage_snapshots (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period DATE NOT NULL,
  adults INTEGER NOT NULL,
  plan_key VARCHAR(50),
  plan_limit INTEGER,
  state VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, period)
);
CREATE INDEX IF NOT EXISTS idx_tenant_usage_snapshots_tenant ON tenant_usage_snapshots(tenant_id, period DESC);
