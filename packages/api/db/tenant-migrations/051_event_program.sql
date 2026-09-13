-- 051: Powiązanie wydarzenia z programem z modułu Programy (events.program_id -> programs.id).
-- Idempotentne.
ALTER TABLE events ADD COLUMN IF NOT EXISTS program_id integer;
