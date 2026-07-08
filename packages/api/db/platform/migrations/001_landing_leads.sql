-- =====================================================================
-- AVENIT — zgłoszenia z formularza na stronie głównej (avenit.pl)
-- =====================================================================
-- Idempotentne (IF NOT EXISTS) — bezpieczne do wielokrotnego uruchomienia.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS landing_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,             -- imię i nazwisko zgłaszającego
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  church VARCHAR(255),                    -- nazwa kościoła/wspólnoty
  message TEXT,
  status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'converted', 'rejected')),
  ip VARCHAR(64),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_landing_leads_status ON landing_leads(status);
CREATE INDEX IF NOT EXISTS idx_landing_leads_created_at ON landing_leads(created_at DESC);
