-- Dodanie kolumny totp_required dla wymuszania 2FA przy tworzeniu użytkownika

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS totp_required BOOLEAN DEFAULT FALSE;

-- Komentarz: totp_required = true oznacza, że użytkownik musi skonfigurować 2FA przy pierwszym logowaniu
-- totp_enabled = true oznacza, że użytkownik już skonfigurował 2FA
