-- Dodaj kolumnę auth_user_id do tabeli app_users
ALTER TABLE app_users
ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Dodaj indeks dla szybszego wyszukiwania
CREATE INDEX IF NOT EXISTS idx_app_users_auth_user_id ON app_users(auth_user_id);

-- Utwórz automatycznie superadmina jeśli nie istnieje
INSERT INTO app_users (email, full_name, role, is_active)
SELECT 'lukasz@schwro.pl', 'Łukasz Dobrowolski', 'superadmin', true
WHERE NOT EXISTS (
  SELECT 1 FROM app_users WHERE email = 'lukasz@schwro.pl'
);

-- Funkcja automatycznego tworzenia użytkownika w app_users po rejestracji
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Sprawdź czy użytkownik już istnieje w app_users
  IF NOT EXISTS (SELECT 1 FROM public.app_users WHERE auth_user_id = NEW.id) THEN
    -- Jeśli nie, utwórz wpis z domyślną rolą 'czlonek'
    INSERT INTO public.app_users (email, auth_user_id, role, is_active)
    VALUES (NEW.email, NEW.id, 'czlonek', true);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger, który automatycznie tworzy użytkownika w app_users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
