-- 010: Grafik służb — brakujący UNIQUE pod upsert przypisań.
-- Klient zapisuje przypisania przez upsert z
--   ON CONFLICT (program_id, team_type, role_key, assigned_name)
-- (patrz useScheduleAssignments.createAssignment + querybuilder.js). Bez pasującego
-- unikalnego indeksu Postgres odrzuca KAŻDY taki INSERT (błąd 42P10: "no unique or
-- exclusion constraint matching the ON CONFLICT specification"), więc przypisania
-- w ogóle nie powstają — w grafiku osoby są bez statusu (kolor domyślny zamiast
-- „oczekuje"), a wsadowa wysyłka zaproszeń nie ma czego wysłać.
--
-- Dryf schematu: template/tenant_schema.sql ma nieaktualne definicje tej tabeli
-- (patrz notatka o prawdzie schematu) — dlatego naprawiamy żywy schemat migracją,
-- odpornie i idempotentnie.

DO $$
BEGIN
  -- Tabela istnieje na każdym tenancie, ale gwarancja na wszelki wypadek.
  IF to_regclass('public.schedule_assignments') IS NULL THEN
    RETURN;
  END IF;

  -- Kolumny użyte w kluczu konfliktu — dodaj, gdyby tenant miał starszy zestaw kolumn.
  ALTER TABLE schedule_assignments ADD COLUMN IF NOT EXISTS team_type     TEXT;
  ALTER TABLE schedule_assignments ADD COLUMN IF NOT EXISTS role_key      TEXT;
  ALTER TABLE schedule_assignments ADD COLUMN IF NOT EXISTS assigned_name TEXT;
  ALTER TABLE schedule_assignments ADD COLUMN IF NOT EXISTS assigned_email TEXT;

  -- Deduplikacja przed założeniem unikalnego indeksu: w każdej grupie
  -- (program_id, team_type, role_key, assigned_name) zostaw najnowszy wiersz.
  DELETE FROM schedule_assignments sa
  WHERE sa.id IN (
    SELECT id FROM (
      SELECT id,
             row_number() OVER (
               PARTITION BY program_id, team_type, role_key, assigned_name
               ORDER BY created_at DESC NULLS LAST, id DESC
             ) AS rn
      FROM schedule_assignments
    ) t
    WHERE t.rn > 1
  );
END $$;

-- Unikalny indeks dopasowany do ON CONFLICT (…) upsertu.
CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_assignments_prog_team_role_name
  ON schedule_assignments (program_id, team_type, role_key, assigned_name);
