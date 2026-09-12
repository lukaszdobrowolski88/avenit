-- 048: Dobierz kolumny czasowe do forms — kod (useForms.js) zapisuje published_at
-- przy publikacji/cofnięciu publikacji oraz archived_at przy archiwizacji/przywróceniu,
-- ale tabela ich nie miała (dryf schematu: migracja 044 dodała tylko status/is_archived/...).
-- Skutek: "column published_at of relation forms does not exist" (42703) przy Opublikuj.
-- Idempotentne.
ALTER TABLE forms ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE forms ADD COLUMN IF NOT EXISTS archived_at  timestamptz;
