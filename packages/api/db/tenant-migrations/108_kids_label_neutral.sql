-- 108: Neutralna nazwa modułu dzieci w kościołach założonych z szablonu.
-- Szablon tenanta nadawał modułowi `kids` etykietę „Małe SchWro” (nazwa służby dzieci kościoła
-- SChWro), więc każdy nowy kościół miał ją w menu, nagłówkach i listach służb. Szablon ma już
-- „Dzieci”; tu poprawiamy istniejące bazy.
-- Zmieniamy WYŁĄCZNIE dokładną starą domyślną nazwę — nazwa nadana przez kościół zostaje.
-- Kościół SChWro (baza avenit_tenant_schwro) zachowuje „Małe SchWro” — to jego własna nazwa służby.
-- Klucz team_type w finansach („małe Avenit”) zostaje bez zmian — to wartość zapisana w danych.
-- Idempotentne.
UPDATE app_modules
SET label = 'Dzieci'
WHERE key = 'kids'
  AND label = 'Małe SchWro'
  AND current_database() <> 'avenit_tenant_schwro';
