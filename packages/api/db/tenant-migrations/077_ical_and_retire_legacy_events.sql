-- 077: kanał kalendarza (ICS) + emerytura starych tabel wydarzeń modułów (2026-10-05).
--
-- 1) ical_subscriptions — web (Ustawienia → Kalendarz) i fn ical czytają/zapisują kolumny,
--    których w tabeli nie było (user_email, export_preferences, liczniki). Zapis subskrypcji
--    kończył się błędem, więc kanał ICS nie działał wcale. Dokładamy je; user_email
--    uzupełniamy z app_users dla wierszy z samym user_id.
ALTER TABLE ical_subscriptions ADD COLUMN IF NOT EXISTS user_email text;
ALTER TABLE ical_subscriptions ADD COLUMN IF NOT EXISTS export_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE ical_subscriptions ADD COLUMN IF NOT EXISTS last_accessed_at timestamptz;
ALTER TABLE ical_subscriptions ADD COLUMN IF NOT EXISTS access_count integer NOT NULL DEFAULT 0;
ALTER TABLE ical_subscriptions ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
UPDATE ical_subscriptions s SET user_email = u.email
  FROM app_users u WHERE s.user_id = u.id AND s.user_email IS NULL;
-- Jedna subskrypcja na osobę (web szuka jej po e-mailu przez maybeSingle).
CREATE UNIQUE INDEX IF NOT EXISTS ical_subscriptions_user_email_uniq
  ON ical_subscriptions (lower(user_email)) WHERE user_email IS NOT NULL;

-- 2) Stare tabele wydarzeń modułów — od unifikacji wszystko jest w `events` (web, aplikacja,
--    grafik, kalendarz). Puste tabele usuwamy; gdyby któraś miała dane (inny tenant), NIE
--    kasujemy — zmieniamy nazwę na <tabela>_legacy_backup do ręcznego przejrzenia.
--    Rejestr API zwraca dla tych nazw pustą listę (starsze wersje aplikacji nie dostaną
--    błędu). mlodziezowka_events zostaje — Młodzieżówka wciąż z niej korzysta.
DO $$
DECLARE
  t text;
  n bigint;
  orphans bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['worship_events','media_events','atmosfera_events','kids_events',
                           'homegroups_events','ministry_events','module_events'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('SELECT count(*) FROM %I', t) INTO n;
    orphans := n;
    -- module_events: wiersze, które mają już odpowiednik w events (tytuł + dzień), to kopie.
    IF t = 'module_events' AND n > 0 THEN
      EXECUTE $q$
        SELECT count(*) FROM module_events m
         WHERE NOT EXISTS (SELECT 1 FROM events e
                            WHERE e.title = m.title
                              AND e.date = (m.start_date AT TIME ZONE 'Europe/Warsaw')::date)
      $q$ INTO orphans;
    END IF;
    IF orphans = 0 THEN
      EXECUTE format('DROP TABLE %I', t);
    ELSE
      EXECUTE format('ALTER TABLE %I RENAME TO %I', t, t || '_legacy_backup');
      RAISE NOTICE 'Tabela % ma % wierszy — zachowana jako %_legacy_backup', t, n, t;
    END IF;
  END LOOP;
END $$;
