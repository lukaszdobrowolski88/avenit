-- Historia obecności członków na nabożeństwach/spotkaniach.
CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  kind TEXT NOT NULL DEFAULT 'nabożeństwo',
  present BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (member_id, date, kind)
);
CREATE INDEX IF NOT EXISTS idx_attendance_member ON attendance (member_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance (date);
