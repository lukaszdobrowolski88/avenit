-- Onboarding per-użytkownik: postęp samouczka, checklisty „Getting started",
-- zamknięte podpowiedzi kontekstowe oraz stan kreatora nowego tenanta.
-- Przechowywane jako JSONB, zapisywane przez samego użytkownika (self-update whitelist).
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS onboarding JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Istniejący, aktywni użytkownicy (już logowali się do systemu) nie powinni nagle
-- dostać powitania/samouczka — oznacz ich jako „po onboardingu". Nowi użytkownicy
-- (last_login_at IS NULL) startują z pustym stanem i przejdą pełny onboarding.
UPDATE app_users
   SET onboarding = jsonb_build_object('dismissed', true, 'seededExisting', true)
 WHERE last_login_at IS NOT NULL
   AND onboarding = '{}'::jsonb;
