-- 063: Prywatność — ukryj e-maile w tabelach modlitw przed rolą „członek".
--
-- Widok 062 (używany przez mobile) jest już bez e-maili, ale BAZOWE tabele
-- prayer_requests i prayer_interactions mają kolumnę user_email, a członek
-- (module:prayer + res:prayer_requests:read + prayer_interactions=T(null)) mógł ją
-- odczytać bezpośrednim zapytaniem /api/db (crafted query) — w tym e-mail autora wpisu
-- ANONIMOWEGO oraz e-maile wszystkich modlących się.
--
-- Deny na poziomie POLA (model opt-out: kolumna widoczna dopóki nie zabroniona). Routes
-- (dataapi) strippuje user_email z SELECT dla członka. ZAPIS oraz FILTR po user_email
-- pozostają możliwe — więc dalej działają: create prośby (user_email = własny), toggle
-- „modlę się" (insert/delete po request_id + user_email) oraz mobilny self-query „moje
-- modlitwy" (.select(request_id).eq(user_email, ja) — filtruje, nie czyta cudzych).
--
-- Staff (lider/koordynator/rada/superadmin) NIE dostaje deny → widzi e-maile jak dotąd.
-- Idempotentnie (brak UNIQUE na (role,capability) → guard NOT EXISTS), FK-safe.

INSERT INTO permission_grants (role, user_id, capability, allowed)
SELECT 'czlonek', NULL::uuid, v.cap, false
FROM (VALUES
    ('field:prayer_requests:user_email:read'),
    ('field:prayer_interactions:user_email:read')
) AS v(cap)
WHERE EXISTS (SELECT 1 FROM app_roles WHERE key = 'czlonek')
  AND NOT EXISTS (
    SELECT 1 FROM permission_grants pg
    WHERE pg.role = 'czlonek' AND pg.user_id IS NULL AND pg.capability = v.cap
  );
