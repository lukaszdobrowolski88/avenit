-- 045: Wydarzenie — wiele cen z opisem (bilety/warianty) + link do zewnętrznego formularza.
-- prices: [{label, amount(grosze)}]; form_url: zewnętrzny formularz obok wewnętrznego form_id.
ALTER TABLE events ADD COLUMN IF NOT EXISTS prices   jsonb DEFAULT '[]'::jsonb;
ALTER TABLE events ADD COLUMN IF NOT EXISTS form_url text;
