-- 080: Formularze — schemat zgodny z kodem modułu.
-- Tabela form_responses powstała ze starej, ogólnej definicji (kolumna `data` NOT NULL), a moduł
-- Formularze zapisuje i czyta `answers` — każde wysłanie formularza kończyło się błędem.
-- Brakowało też forms.response_count / closes_at (limit odpowiedzi, termin zamknięcia) oraz
-- tabeli logów e-maili formularzy. Idempotentne.

ALTER TABLE form_responses ADD COLUMN IF NOT EXISTS answers JSONB NOT NULL DEFAULT '{}'::jsonb;
-- Ewentualne stare wiersze: przenieś treść z `data`, a `data` zostaw opcjonalne (kopia zgodności).
UPDATE form_responses SET answers = data WHERE answers = '{}'::jsonb AND data IS NOT NULL;
ALTER TABLE form_responses ALTER COLUMN data DROP NOT NULL;
ALTER TABLE form_responses ALTER COLUMN data SET DEFAULT '{}'::jsonb;

ALTER TABLE forms
  ADD COLUMN IF NOT EXISTS response_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closes_at TIMESTAMPTZ;

UPDATE forms f SET response_count = sub.n
FROM (SELECT form_id, count(*)::int AS n FROM form_responses GROUP BY form_id) sub
WHERE sub.form_id = f.id;

CREATE TABLE IF NOT EXISTS form_email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID,
  response_id UUID,
  email_type TEXT,
  recipient TEXT,
  subject TEXT,
  status TEXT,
  message_id TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_form_email_logs_form ON form_email_logs(form_id);
