-- Dodanie kolumny json_design do tabeli email_campaigns
-- Pozwala na zapisanie bloków JSON z edytora drag & drop

ALTER TABLE email_campaigns
ADD COLUMN IF NOT EXISTS json_design JSONB;

COMMENT ON COLUMN email_campaigns.json_design IS 'JSON design blocks from drag & drop editor';
