-- 013: Rola „członek" — dostęp do modułu Projekty/Tablice (Work OS).
-- Boards powstał na starym snapshocie i nie był pełnoprawnym modułem RBAC: tabele
-- board_* nie były w rejestrze Data API, więc dla nie-adminów leciał fail-closed
-- (403), a moduł działał tylko adminom (bypass). Rejestracja tabel + wpis w katalogu
-- (registry.js / catalog.js) domyka to serwerowo; koordynator/lider/rada_starszych
-- dostają dostęp przez swoje wildcardy. Członkowi nadajemy jawnie zakres współpracy:
-- widzi wszystko, tworzy/edytuje elementy, pisze aktualizacje (komentarze) i loguje
-- aktywność. Zmiany strukturalne (kolumny/grupy/widoki/automatyzacje/dashboardy)
-- zostają u liderów.
--
-- Idempotentnie (brak UNIQUE na (role,capability) → guard NOT EXISTS) i FK-safe.

INSERT INTO permission_grants (role, user_id, capability, allowed)
SELECT 'czlonek', NULL::uuid, v.cap, true
FROM (VALUES
    -- Widoczność modułu w Sidebarze
    ('module:boards'),
    -- Odczyt całej struktury i danych tablic
    ('res:boards:read'),
    ('res:board_groups:read'),
    ('res:board_columns:read'),
    ('res:board_views:read'),
    ('res:board_dashboards:read'),
    ('res:board_automations:read'),
    ('res:board_automation_runs:read'),
    -- Uruchamianie automatyzacji zapisuje wiersz przebiegu
    ('res:board_automation_runs:create'),
    -- Współpraca: elementy (tworzenie/edycja, bez usuwania i zmian struktury)
    ('res:board_items:read'),
    ('res:board_items:create'),
    ('res:board_items:update'),
    -- Aktualizacje (komentarze) i log aktywności
    ('res:board_item_updates:read'),
    ('res:board_item_updates:create'),
    ('res:board_item_activity:read'),
    ('res:board_item_activity:create')
) AS v(cap)
WHERE EXISTS (SELECT 1 FROM app_roles WHERE key = 'czlonek')
  AND NOT EXISTS (
    SELECT 1 FROM permission_grants pg
    WHERE pg.role = 'czlonek' AND pg.user_id IS NULL AND pg.capability = v.cap
  );
