-- 018: Kazania wtopione jako zakładka w module Nauczanie — ukryj osobny moduł z menu.
-- Niedestrukcyjnie: wpis w app_modules ZOSTAJE (capability module:sermons + trasa
-- /sermons nadal działają po URL i dla mobilki/publicznej strony /sermon/:slug),
-- tylko is_enabled=false chowa pozycję z sidebara (dynamiczne moduły filtrują is_enabled).
UPDATE app_modules SET is_enabled = false WHERE key = 'sermons';
