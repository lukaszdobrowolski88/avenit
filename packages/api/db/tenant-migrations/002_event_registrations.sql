-- Zapisy (RSVP) na wydarzenia ogólne.
-- Dodaje możliwość włączenia zapisów i limitu miejsc dla wydarzeń oraz
-- tabelę rejestracji uczestników.

ALTER TABLE events ADD COLUMN IF NOT EXISTS registration_required BOOLEAN DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS max_participants INTEGER;

CREATE TABLE IF NOT EXISTS event_registrations (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  full_name TEXT,
  guests_count INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'going',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (event_id, user_email)
);

CREATE INDEX IF NOT EXISTS idx_event_registrations_event ON event_registrations (event_id);
