-- 085: nowe nazwy modułów (audyt 2026-10, zaakceptowane przez właściciela) zapisane w bazie,
-- żeby edytor modułów w Ustawieniach i aplikacja mobilna pokazywały to samo co menu w webie.
-- Zmieniamy WYŁĄCZNIE dokładne stare domyślne nazwy — nazwa nadana przez kościół zostaje.
-- Raport CCLI przeniesiony z modułu „Służba” do Analityki, stąd „Dostępność”. Idempotentne.
UPDATE app_modules SET label = 'Kampanie push'      WHERE label = 'Push Kampanie';
UPDATE app_modules SET label = 'Kampanie SMS'       WHERE label = 'SMS Kampanie';
UPDATE app_modules SET label = 'Kampanie e-mail'    WHERE label = 'Mailing';
UPDATE app_modules SET label = 'Skrzynka pocztowa'  WHERE label = 'Poczta';
UPDATE app_modules SET label = 'Zapisy (RSVP)'      WHERE label = 'Obecność (RSVP)';
UPDATE app_modules SET label = 'Dostępność'         WHERE label IN ('Służba', 'Dostępność i CCLI');
UPDATE app_modules SET label = 'Ściana modlitwy'    WHERE label = 'Centrum Modlitwy';
UPDATE app_modules SET label = 'Opieka duszpasterska' WHERE label = 'Opieka i CRM';
