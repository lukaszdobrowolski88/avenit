-- 053: Ręczne archiwum wydarzeń (hub „Wydarzenia" → zakładka Archiwum).
-- Archiwum = wydarzenia z datą w przeszłości LUB ręcznie zarchiwizowane (is_archived=true),
-- np. odwołane. Aktualne = data >= dziś i NIE zarchiwizowane. Idempotentne.
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false;
