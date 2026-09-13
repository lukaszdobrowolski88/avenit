-- 055: Grafiki i służby na WYDARZENIACH (przeniesienie z programów).
-- Fundament: wydarzenie staje się nośnikiem przypisań służb (grafik). Program pozostaje
-- osobnym planem podpiętym do wydarzenia (events.program_id).
--
-- events.assignments — „siatka" przypisań per wydarzenie, lustro slotów programu:
--   { "<team_type>": { "<role_key>": "Imię1, Imię2", "absencja": "...", "notatki": "..." } }
-- schedule_assignments.event_id — silnik powiadomień/akceptacji działa też dla wydarzeń
--   (obok istniejącego program_id; jedna z kolumn wypełniona).
-- Idempotentne, addytywne (nic nie łamie istniejącego grafiku programów).
ALTER TABLE events ADD COLUMN IF NOT EXISTS assignments jsonb DEFAULT '{}'::jsonb;
ALTER TABLE schedule_assignments ADD COLUMN IF NOT EXISTS event_id integer;

-- Odczyt przypisań po wydarzeniu.
CREATE INDEX IF NOT EXISTS idx_schedule_assignments_event ON schedule_assignments(event_id);
-- Unikat dla wierszy wydarzeń (analogicznie do unikatu programowego; NULL-e w program_id są
-- rozłączne, więc potrzebny osobny częściowy unikat dla event_id).
CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_assignments_event
  ON schedule_assignments(event_id, team_type, role_key, assigned_name)
  WHERE event_id IS NOT NULL;
