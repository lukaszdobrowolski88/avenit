-- 072: Lider bez Dawania i Automatyzacji.
-- Tabele Dawania / Automatyzacji były poza registry API (403 dla wszystkich), więc
-- grant `module:*` lidera niczego tam nie otwierał. Po dorejestrowaniu tabel (2026-10-04)
-- lider zacząłby widzieć darowizny i darczyńców — wbrew opisowi roli „bez finansów”.
-- Automatyzacje wysyłają maile/SMS/push jak kampanie, których lider też nie ma.
--
-- Jawny deny dla roli lider, ale TYLKO gdy admin nie ustawił własnej decyzji dla tej
-- capability (dowolny wiersz lider + ta capability → nie ruszamy).

INSERT INTO permission_grants (role, user_id, capability, allowed)
SELECT 'lider', NULL::uuid, v.cap, false
FROM (VALUES
    ('module:giving'),
    ('module:automation')
) AS v(cap)
WHERE EXISTS (SELECT 1 FROM app_roles WHERE key = 'lider')
  AND NOT EXISTS (
    SELECT 1 FROM permission_grants pg
    WHERE pg.role = 'lider' AND pg.user_id IS NULL AND pg.capability = v.cap
  );
