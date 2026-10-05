-- 076: moduł „Dawanie” → „Hojność” (decyzja właściciela, 2026-10-05).
-- Zmieniamy tylko domyślną nazwę z migracji 006 — kościół, który sam przemianował
-- moduł w ustawieniach, zostaje przy swojej nazwie. Nazwa z app_modules steruje
-- menu weba, nagłówkiem modułu i zakładką Moduły w aplikacji mobilnej.

UPDATE app_modules SET label = 'Hojność', updated_at = now()
 WHERE key = 'giving' AND label = 'Dawanie';
