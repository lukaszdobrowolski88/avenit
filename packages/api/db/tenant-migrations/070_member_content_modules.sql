-- 070: Rola „członek" dostaje MODUŁY treści: Nauczanie, Grupy domowe, Kazania.
-- Decyzja właściciela (2026-10-04) przy wyrównaniu uprawnień web ↔ mobile: mobilka
-- pokazuje to samo co web, a członkowie mają widzieć treści na obu.
--
-- Migracja 011 nadała członkom res:<tabela>:read dla tych modułów, ale BEZ module:*,
-- więc /api/db i tak odmawiało (canAccess wymaga module:<key> przed res:<tabela>:<op>).
-- Tu domykamy: module:teaching, module:homegroups, module:sermons.
-- Świadomie: webowy moduł grup pokazuje członkom listę grup z osobami (zaakceptowane).
-- Zapis nadal zablokowany (członek ma tylko res:*:read tych tabel).
--
-- Idempotentnie (brak UNIQUE na (role,capability) → NOT EXISTS). Jeśli admin jawnie
-- odebrał moduł członkom (wiersz allowed=false), NIE nadpisujemy jego decyzji.

INSERT INTO permission_grants (role, user_id, capability, allowed)
SELECT 'czlonek', NULL::uuid, v.cap, true
FROM (VALUES
    ('module:teaching'),
    ('module:homegroups'),
    ('module:sermons')
) AS v(cap)
WHERE EXISTS (SELECT 1 FROM app_roles WHERE key = 'czlonek')
  AND NOT EXISTS (
    SELECT 1 FROM permission_grants pg
    WHERE pg.role = 'czlonek' AND pg.user_id IS NULL AND pg.capability = v.cap
  );
