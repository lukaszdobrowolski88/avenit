-- 026: Cichy link roster zespołów → konto (app_users). Opcja „b" audytu tożsamości.
-- Osoba bywa zapisana jako login (app_users) ORAZ wiersz w zespole (worship_team, media_team…)
-- z powieloną nazwą/e-mailem, sklejane tylko tekstem e-maila. Dodajemy trwały klucz user_id
-- i uzupełniamy po e-mailu. W PEŁNI ADDYTYWNE i nieniszczące: nowa kolumna (nullable),
-- backfill tylko pustych, zero usuwania, zero zmian istniejących pól.
--
-- Idempotentne (ADD COLUMN IF NOT EXISTS, UPDATE tylko user_id IS NULL) i bezpieczne dla
-- każdego tenanta (guard: tabela istnieje i ma kolumnę email; custom_* obsłużone, jeśli są).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'worship_team', 'media_team', 'atmosfera_members', 'kids_teachers',
    'mlodziezowka_members', 'mlodziezowka_leaders', 'home_group_members',
    'custom_mc_members', 'custom_kobiety_members', 'custom_faceci_members'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = t AND column_name = 'email') THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_users(id) ON DELETE SET NULL', t);
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_user ON %I(user_id)', t, t);
      EXECUTE format(
        'UPDATE %I x SET user_id = u.id FROM app_users u
           WHERE x.user_id IS NULL AND x.email IS NOT NULL AND x.email <> '''' AND lower(x.email) = lower(u.email)', t);
    END IF;
  END LOOP;
END $$;
