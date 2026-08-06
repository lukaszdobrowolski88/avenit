-- 012: Rola „członek" — interakcje w komunikatorze. Seed 005 nadał członkowi
-- odczyt/zapis wiadomości i rozmów, ale NIE tabel interakcji (dorejestrowanych
-- później): reakcje, potwierdzenia odczytu, przypięcia. Skutek: reakcje/„przeczytane"/
-- przypięcia działały tylko adminom (bypass), a członkowi leciał 403 (mobile rzucał
-- na tym błędzie). To standardowe funkcje czatu, które apka pokazuje każdemu
-- uczestnikowi — nadajemy je członkowi.
--
-- Idempotentnie (brak UNIQUE na (role,capability) → guard NOT EXISTS) i FK-safe.

INSERT INTO permission_grants (role, user_id, capability, allowed)
SELECT 'czlonek', NULL::uuid, v.cap, true
FROM (VALUES
    -- Reakcje emoji (react/unreact + widok agregatów)
    ('res:message_reactions:read'),
    ('res:message_reactions:create'),
    ('res:message_reactions:delete'),
    -- Potwierdzenia odczytu (upsert = insert + update; + odczyt „kto przeczytał")
    ('res:message_read_receipts:read'),
    ('res:message_read_receipts:create'),
    ('res:message_read_receipts:update'),
    -- Przypięte wiadomości (widok panelu + pin/odepnij)
    ('res:pinned_messages:read'),
    ('res:pinned_messages:create'),
    ('res:pinned_messages:delete')
) AS v(cap)
WHERE EXISTS (SELECT 1 FROM app_roles WHERE key = 'czlonek')
  AND NOT EXISTS (
    SELECT 1 FROM permission_grants pg
    WHERE pg.role = 'czlonek' AND pg.user_id IS NULL AND pg.capability = v.cap
  );
