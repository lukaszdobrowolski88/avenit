-- 054: „Wydarzenia" jako osobny, pełnoprawny moduł (zastępuje dawny „Kalendarz").
-- Przekształcamy istniejący wiersz modułu 'calendar' — zachowujemy KLUCZ 'calendar'
-- (więc resource_key module:calendar, uprawnienia i konfiguracja wyglądu pozostają bez zmian),
-- zmieniamy tylko etykietę, ścieżkę i komponent. Sidebar (app_modules-driven) i trasa
-- /wydarzenia (App.jsx) podchwytują zmianę. Trasa /calendar nadal działa (back-compat).
-- Idempotentne.
UPDATE app_modules
   SET label = 'Wydarzenia',
       path = '/wydarzenia',
       component_name = 'EventsModule'
 WHERE key = 'calendar';
