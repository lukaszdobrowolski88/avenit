-- 084: Rola „członek” — zapisy WŁASNYCH danych w Komunikatorze.
-- Do audytu 2026-10 serwer nie zawężał wierszy, więc tych grantów celowo nie było. Od teraz
-- komunikator.js pilnuje zakresu: uczestnik zmienia swój wiersz (przeczytane, wyciszenie,
-- archiwum, opuszczenie grupy), autor — swoją wiadomość, administrator rozmowy — rozmowę,
-- „pisze…” — właściciel. Bez tych grantów członkowi nie działały te funkcje (403).
-- Idempotentnie (guard NOT EXISTS) i FK-safe — wzór jak 012/065.
INSERT INTO permission_grants (role, user_id, capability, allowed)
SELECT 'czlonek', NULL::uuid, v.cap, true
FROM (VALUES
    ('res:conversation_participants:update'),
    ('res:conversation_participants:delete'),
    ('res:messages:update'),
    ('res:conversations:delete'),
    ('res:typing_status:read'),
    ('res:typing_status:create'),
    ('res:typing_status:update'),
    ('res:typing_status:delete')
) AS v(cap)
WHERE EXISTS (SELECT 1 FROM app_roles WHERE key = 'czlonek')
  AND NOT EXISTS (
    SELECT 1 FROM permission_grants pg
    WHERE pg.role = 'czlonek' AND pg.user_id IS NULL AND pg.capability = v.cap
  );

