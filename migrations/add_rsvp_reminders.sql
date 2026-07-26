-- Przypomnienia RSVP: automatyczne ponaglenie osób, które nie odpowiedziały.
ALTER TABLE rsvp_invitations ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMPTZ;
ALTER TABLE rsvp_campaigns ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN DEFAULT true;
ALTER TABLE rsvp_campaigns ADD COLUMN IF NOT EXISTS reminder_days_before INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_rsvp_inv_reminder ON rsvp_invitations(campaign_id, status, reminded_at);
