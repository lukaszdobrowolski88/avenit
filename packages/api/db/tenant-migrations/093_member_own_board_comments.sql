-- 093: Rola „członek" — edycja i usuwanie WŁASNYCH komentarzy na tablicach (Projekty),
-- polubienia komentarzy.
-- Członek miał tylko res:board_item_updates:read|create (013), więc polubienie (update kolumny
-- likes) i usunięcie własnego komentarza kończyły się 403. Serwer (dataapi/boardsScope.js,
-- enforceBoardCommentWrite) pilnuje zakresu: autor stemplowany przy dodaniu, zmiana/usunięcie
-- tylko własnych wpisów (polubienie — każdy, kto widzi tablicę); cudze komentarze zmienia tylko
-- osoba zarządzająca tablicami (res:board_item_updates:delete RAZEM z res:boards:delete).
-- Lista = preset „czlonek" w packages/shared/src/permissions/presets.js (test spójności).
--
-- Addytywnie i idempotentnie (wzór 013/091): wstawiamy allowed=true tylko tam, gdzie admin nie
-- podjął własnej decyzji (brak JAKIEGOKOLWIEK wiersza czlonek+ta capability) i gdy rola istnieje.

INSERT INTO permission_grants (role, user_id, capability, allowed)
SELECT 'czlonek', NULL::uuid, v.cap, true
FROM (VALUES
    ('res:board_item_updates:update'),
    ('res:board_item_updates:delete')
) AS v(cap)
WHERE EXISTS (SELECT 1 FROM app_roles WHERE key = 'czlonek')
  AND NOT EXISTS (
    SELECT 1 FROM permission_grants pg
    WHERE pg.role = 'czlonek' AND pg.user_id IS NULL AND pg.capability = v.cap
  );
