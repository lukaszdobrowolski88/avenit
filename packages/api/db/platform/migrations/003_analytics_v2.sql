-- Analityka v2: powiązanie zgłoszeń z landingu z odwiedzającymi (lejek konwersji).
-- Zgłoszenie z formularza avenit.pl dostaje visitor_id wyliczony po stronie serwera
-- z tego samego dziennego hasha co eventy — pełna historia wizyt przed konwersją.

ALTER TABLE landing_leads ADD COLUMN IF NOT EXISTS visitor_id UUID REFERENCES analytics_visitors(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_landing_leads_visitor ON landing_leads(visitor_id);
