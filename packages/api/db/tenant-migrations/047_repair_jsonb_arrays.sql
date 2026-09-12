-- 047: Napraw kolumny jsonb-tablicowe zapisane jako pusty OBIEKT {} zamiast tablicy [].
-- Root cause: querybuilder przekazywał pustą tablicę [] surowo do node-postgres, który
-- serializował ją jako literał tablicy PG '{}' — a dla kolumny jsonb '{}'::jsonb parsuje się
-- jako pusty OBIEKT, nie tablica. Skutkowało to m.in. crashem "d.find is not a function"
-- w edytorze formularzy (forms.fields = {} zamiast []). Naprawione w normalizeValue();
-- ta migracja naprawia już zapisane, uszkodzone dane.
--
-- Bierzemy TYLKO kolumny jsonb z domyślną wartością '[]' (semantycznie tablice) i naprawiamy
-- WYŁĄCZNIE wiersze, gdzie wartość to dokładnie pusty obiekt '{}' (sygnatura tego buga),
-- żeby nie tknąć ewentualnych innych, celowych danych. Idempotentne i odporne na dryf schematu
-- (iteruje po realnie istniejących kolumnach w danym tenancie).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type = 'jsonb'
      AND column_default LIKE '%[]%'
  LOOP
    EXECUTE format(
      'UPDATE %I.%I SET %I = ''[]''::jsonb WHERE %I = ''{}''::jsonb',
      r.table_schema, r.table_name, r.column_name, r.column_name
    );
  END LOOP;
END $$;
