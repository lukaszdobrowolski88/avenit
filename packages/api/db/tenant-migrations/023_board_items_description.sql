-- Modal elementu tablicy (Projekty) zyskuje pole „Opis" (bogatszy edytor elementu).
-- Idempotentnie dodajemy kolumnę tekstową (domyślnie pusty opis = NULL).
ALTER TABLE board_items ADD COLUMN IF NOT EXISTS description text;
