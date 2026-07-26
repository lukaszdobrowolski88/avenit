-- Powiązanie konta użytkownika (app_users) z rekordem członka (members).
-- Umożliwia niezawodne „moje darowizny" w aplikacji mobilnej/webowej
-- (zamiast dopasowania wyłącznie po adresie e-mail).

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS member_id UUID;
CREATE INDEX IF NOT EXISTS idx_app_users_member_id ON app_users(member_id);

-- Backfill: dopasuj po adresie e-mail (bez rozróżniania wielkości liter).
UPDATE app_users u
   SET member_id = m.id
  FROM members m
 WHERE u.member_id IS NULL
   AND u.email IS NOT NULL
   AND lower(u.email) = lower(m.email);
