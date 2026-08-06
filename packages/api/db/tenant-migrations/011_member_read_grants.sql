-- 011: Domyślna rola „członek" — dostęp (odczyt) do modułów member-facing, które
-- aplikacja mobilna pokazuje członkom, a których seed 005 nie nadawał (działały
-- tylko adminom przez bypass). Zakres wg decyzji właściciela:
--   • Materiały + Nauczania,
--   • Grupy domowe (lista / moja grupa / spotkania).
-- ŚWIADOMIE NIE nadajemy: Pieśni, Formularze, RSVP, wydarzenia służb w kalendarzu,
-- katalog członków (prywatność), darowizny (osobny bezpieczny endpoint /api/fn/my-giving).
--
-- Tylko res:<tabela>:read (dostęp do DANYCH w mobile); bez module:* — nie zmieniamy
-- widoczności modułów w panelu web. Idempotentnie (brak UNIQUE na (role,capability),
-- więc guard NOT EXISTS) i FK-safe (tylko gdy rola 'czlonek' istnieje).

INSERT INTO permission_grants (role, user_id, capability, allowed)
SELECT 'czlonek', NULL::uuid, v.cap, true
FROM (VALUES
    -- Materiały
    ('res:materials_files:read'),
    ('res:materials_folders:read'),
    -- Nauczania
    ('res:teachings:read'),
    ('res:teaching_speakers:read'),
    ('res:teaching_series:read'),
    -- Grupy domowe (lista, członkowie, liderzy, spotkania)
    ('res:home_groups:read'),
    ('res:home_group_members:read'),
    ('res:home_group_leaders:read'),
    ('res:homegroups_events:read')
) AS v(cap)
WHERE EXISTS (SELECT 1 FROM app_roles WHERE key = 'czlonek')
  AND NOT EXISTS (
    SELECT 1 FROM permission_grants pg
    WHERE pg.role = 'czlonek' AND pg.user_id IS NULL AND pg.capability = v.cap
  );
