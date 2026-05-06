-- Log inline-akcji wykonanych z poziomu pusha (RSVP itp.) bez otwierania appki.
-- Zapisuje surową odpowiedź; konkretna logika biznesowa (np. event_attendance)
-- konsumuje stąd dane lub czyta bezpośrednio.

CREATE TABLE IF NOT EXISTS push_inline_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES push_campaigns(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES push_campaign_recipients(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  response_type TEXT NOT NULL,                       -- np. 'rsvp', 'feedback'
  response_value TEXT NOT NULL,                      -- np. 'yes', 'no', 'maybe'
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_push_inline_responses_campaign ON push_inline_responses(campaign_id);
CREATE INDEX IF NOT EXISTS idx_push_inline_responses_user ON push_inline_responses(user_email);

ALTER TABLE push_inline_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_inline_responses_admin_select" ON push_inline_responses;
CREATE POLICY "push_inline_responses_admin_select" ON push_inline_responses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE email = auth.jwt() ->> 'email'
      AND role IN ('superadmin', 'admin', 'rada_starszych')
    )
    OR user_email = auth.jwt() ->> 'email'
  );

GRANT ALL ON push_inline_responses TO service_role;
