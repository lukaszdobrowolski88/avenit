-- 030: Flow zaproszeń — znacznik wysłania zaproszenia (link „ustaw hasło", ważny 7 dni).
-- Ustawiany przy tworzeniu konta przez admina; czyszczony, gdy użytkownik ustawi hasło.
-- Pozwala pokazać w liście „zaproszono (oczekuje na hasło)" i „ponów zaproszenie".
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;
