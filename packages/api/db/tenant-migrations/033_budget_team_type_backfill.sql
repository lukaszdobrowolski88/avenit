-- Moduł Finanse zapisywał służbę tylko w budget_items.category, a moduły zespołów
-- (Worship/Media/Atmosfera/Kids/HomeGroups/Mlodziezowka) czytają budżet po team_type.
-- Dlatego pozycje dodane centralnie nie pokazywały się w zakładce Finanse zespołu.
-- Frontend już ustawia team_type = category; tu backfill istniejących wierszy.
ALTER TABLE budget_items ADD COLUMN IF NOT EXISTS team_type TEXT;
UPDATE budget_items SET team_type = category WHERE team_type IS NULL AND category IS NOT NULL;
