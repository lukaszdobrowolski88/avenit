-- Naprawa dodawania lidera grupy domowej: frontend wstawia full_name/phone, których
-- tabela nie miała (miała user_name/user_email). Dodajemy brakujące kolumny + ROLĘ,
-- która rozróżnia koordynatora (Lider Grup domowych) od liderów pojedynczych grup.
ALTER TABLE home_group_leaders ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE home_group_leaders ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE home_group_leaders ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'leader';   -- coordinator | leader

-- Backfill nazwy ze starej kolumny user_name (jeśli istniały wcześniejsze wpisy).
UPDATE home_group_leaders SET full_name = user_name WHERE full_name IS NULL AND user_name IS NOT NULL;
