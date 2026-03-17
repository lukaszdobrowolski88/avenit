-- Aktualizacja nazw kanałów służb
-- Naprawia niezgodne nazwy kanałów z rzeczywistymi nazwami służb

-- Aktualizuj nazwy istniejących kanałów ministry
UPDATE conversations
SET name = CASE ministry_key
    WHEN 'worship_team' THEN 'Zespół Uwielbienia'
    WHEN 'media_team' THEN 'Media Team'
    WHEN 'atmosfera_team' THEN 'Atmosfera Team'
    WHEN 'kids_ministry' THEN 'Małe SchWro'
    WHEN 'home_groups' THEN 'Liderzy Grup Domowych'
    ELSE name
END
WHERE type = 'ministry' AND ministry_key IS NOT NULL;
