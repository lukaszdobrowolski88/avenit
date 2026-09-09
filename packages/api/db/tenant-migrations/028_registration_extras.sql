-- 028: Rejestracja faza 2b — zgoda RODO (consent) + log zdarzeń kont (audyt tenantowy).
-- Auto-zatwierdzanie zaufanych domen trzymane w app_settings (bez migracji).
-- ADDYTYWNE i idempotentne — bezpieczne dla każdego tenanta.
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ; -- kiedy zaakceptowano regulamin/politykę

-- Tenantowy log zdarzeń kont (rejestracja/weryfikacja/zatwierdzenie/odrzucenie/utworzenie).
CREATE TABLE IF NOT EXISTS account_events (
  id BIGSERIAL PRIMARY KEY,
  email      VARCHAR(255),
  action     VARCHAR(40) NOT NULL,   -- registered | verified | approved | rejected | created
  actor      VARCHAR(255),           -- e-mail admina lub 'self' / 'auto'
  detail     TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_account_events_created ON account_events(created_at DESC);
