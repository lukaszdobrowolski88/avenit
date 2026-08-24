-- 024: Rola „członek" — usuwanie ZADAŃ (elementów) na tablicach (Projekty).
-- Członek współpracujący na tablicy potrzebuje usuwać elementy (board_items) —
-- w narzędziu zadaniowym to normalna operacja. Zmiany STRUKTURALNE (grupy,
-- kolumny, widoki, automatyzacje) nadal zostają u liderów/koordynatorów
-- (przez ich wildcardy). Wzór idempotentny/FK-safe jak 013_boards_member_grants.
INSERT INTO permission_grants (role, user_id, capability, allowed)
SELECT 'czlonek', NULL::uuid, 'res:board_items:delete', true
WHERE EXISTS (SELECT 1 FROM app_roles WHERE key = 'czlonek')
  AND NOT EXISTS (
    SELECT 1 FROM permission_grants pg
    WHERE pg.role = 'czlonek' AND pg.user_id IS NULL AND pg.capability = 'res:board_items:delete'
  );
