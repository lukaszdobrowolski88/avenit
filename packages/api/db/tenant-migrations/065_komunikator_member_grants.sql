-- 065: Rola „członek" — ankiety i modlitwy w komunikatorze (poll_votes / prayer_responses).
-- Tabele dodane migracją 064; jak reakcje/przypięcia (migracja 012) — uczestnik czatu
-- głosuje w ankiecie / odpowiada „🙏 Modlę się" i widzi agregaty. Bez tych grantów
-- res:poll_votes:* / res:prayer_responses:* członek dostawałby 403 (module:komunikator ma,
-- ale nie CRUD tych zasobów). Idempotentnie (guard NOT EXISTS) i FK-safe.

INSERT INTO permission_grants (role, user_id, capability, allowed)
SELECT 'czlonek', NULL::uuid, v.cap, true
FROM (VALUES
    -- Ankiety: głos + wycofanie + widok wyników
    ('res:poll_votes:read'),
    ('res:poll_votes:create'),
    ('res:poll_votes:delete'),
    -- Prośby o modlitwę: „modlę się" toggle + licznik
    ('res:prayer_responses:read'),
    ('res:prayer_responses:create'),
    ('res:prayer_responses:delete')
) AS v(cap)
WHERE EXISTS (SELECT 1 FROM app_roles WHERE key = 'czlonek')
  AND NOT EXISTS (
    SELECT 1 FROM permission_grants pg
    WHERE pg.role = 'czlonek' AND pg.user_id IS NULL AND pg.capability = v.cap
  );
