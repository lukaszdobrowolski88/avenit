-- 014: households — brakujące kolumny funkcji rodzin/check-in dzieci.
-- Klient (HouseholdManager zapis/edycja, Kids/checkin useCheckin wyszukiwanie rodzica
-- po 4 ostatnich cyfrach telefonu) odwoływał się do kolumn, których NIGDY nie było
-- w schemacie: `phone_full`, `phone_last_four`, `notes` (tabela `households` miała
-- tylko `name`, `phone`, `address`, `city`, `postal_code`). Skutek: 400
-- „column ... does not exist" przy odczycie (order), zapisie gospodarstwa i
-- wyszukiwaniu w check-inie. Dodajemy brakujące kolumny i backfillujemy z legacy
-- `phone`. Osobno klient przechodzi `family_name` → `name` (to samo pole; `name`
-- to kanoniczna kolumna schematu).
--
-- Idempotentnie (ADD COLUMN IF NOT EXISTS + guardy na backfill).

ALTER TABLE households ADD COLUMN IF NOT EXISTS phone_full      VARCHAR(50);
ALTER TABLE households ADD COLUMN IF NOT EXISTS phone_last_four VARCHAR(4);
ALTER TABLE households ADD COLUMN IF NOT EXISTS notes           TEXT;

-- Backfill z legacy kolumny `phone` (jeśli istniała i miała dane).
UPDATE households
SET phone_full = phone
WHERE phone_full IS NULL AND phone IS NOT NULL AND phone <> '';

UPDATE households
SET phone_last_four = right(regexp_replace(coalesce(phone_full, phone, ''), '\D', '', 'g'), 4)
WHERE phone_last_four IS NULL
  AND length(regexp_replace(coalesce(phone_full, phone, ''), '\D', '', 'g')) >= 4;
