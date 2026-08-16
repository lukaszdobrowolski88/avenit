-- Uprawnienia per-tablica (widoczność) — kolumny dla istniejących tenantów.
ALTER TABLE boards ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'workspace';
ALTER TABLE boards ADD COLUMN IF NOT EXISTS editors TEXT[] DEFAULT '{}';
