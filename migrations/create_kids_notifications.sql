-- Powiadomienia rodzica w module Kids (SMS/push, np. "Prosimy o odbiór dziecka").
-- To funkcja wewnątrz modułu Kids, NIE osobny moduł (brak rejestracji w app_modules).

CREATE TABLE IF NOT EXISTS kids_parent_notifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_name        TEXT,
  parent_phone      TEXT,
  parent_contact_id UUID,
  session_id        UUID,
  channel           TEXT,           -- 'sms' | 'push'
  message           TEXT,
  status            TEXT DEFAULT 'sent',
  sent_by           TEXT,
  campus_id         INTEGER,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kids_parent_notifications_session
  ON kids_parent_notifications (session_id);
CREATE INDEX IF NOT EXISTS idx_kids_parent_notifications_created
  ON kids_parent_notifications (created_at DESC);

ALTER TABLE kids_parent_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kids_parent_notifications_select ON kids_parent_notifications;
CREATE POLICY kids_parent_notifications_select
  ON kids_parent_notifications
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS kids_parent_notifications_all ON kids_parent_notifications;
CREATE POLICY kids_parent_notifications_all
  ON kids_parent_notifications
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
