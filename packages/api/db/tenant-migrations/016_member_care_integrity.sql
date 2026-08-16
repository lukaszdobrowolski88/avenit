-- 016: integralność danych Opieki/CRM przy usuwaniu członka.
-- Tabele member_notes/member_care_log/member_milestones/member_tags/member_custom_values
-- kluczują przez member_id INTEGER, ale BEZ klucza obcego — usunięcie członka
-- zostawiało osierocone rekordy Opieki. Sprzątamy osierocone wiersze i dodajemy
-- FK ON DELETE CASCADE, żeby dane Opieki znikały razem z osobą.
--
-- Robustnie: pomija nieistniejące tabele, łapie ewentualną niezgodność typów
-- (gdyby u któregoś tenanta members.id było UUID) — wtedy tylko sprząta, bez FK.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['member_notes','member_care_log','member_milestones','member_tags','member_custom_values']
  LOOP
    BEGIN
      IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
      -- Usuń osierocone rekordy (member_id bez istniejącego członka).
      EXECUTE format('DELETE FROM %I WHERE member_id IS NOT NULL AND member_id NOT IN (SELECT id FROM members)', t);
      -- Dodaj FK ON DELETE CASCADE, jeśli jeszcze nie istnieje.
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = t AND constraint_type = 'FOREIGN KEY' AND constraint_name = t || '_member_id_fkey'
      ) THEN
        EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE', t, t || '_member_id_fkey');
      END IF;
    EXCEPTION WHEN others THEN
      RAISE NOTICE '016_member_care_integrity: pominięto % (%)', t, SQLERRM;
    END;
  END LOOP;
END $$;
