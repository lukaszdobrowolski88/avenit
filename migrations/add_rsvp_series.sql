-- RSVP cykliczne (seria): np. cotygodniowa grupa domowa. Kampania-szablon
-- (is_series) co interwał tworzy nowe wystąpienie z zaproszeniami dla zapisanej
-- publiczności i je wysyła.
ALTER TABLE rsvp_campaigns ADD COLUMN IF NOT EXISTS is_series BOOLEAN DEFAULT false;
ALTER TABLE rsvp_campaigns ADD COLUMN IF NOT EXISTS recur_interval_days INTEGER;
ALTER TABLE rsvp_campaigns ADD COLUMN IF NOT EXISTS series_next_date DATE;
ALTER TABLE rsvp_campaigns ADD COLUMN IF NOT EXISTS audience_member_ids JSONB;
ALTER TABLE rsvp_campaigns ADD COLUMN IF NOT EXISTS series_parent_id UUID;
CREATE INDEX IF NOT EXISTS idx_rsvp_series ON rsvp_campaigns(is_series, series_next_date);
