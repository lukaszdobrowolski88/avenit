-- Harmonogramy automatycznej wysyłki raportu finansowego (co miesiąc / kwartał / rok).
-- Materializowane przez worker fn/finance-report-schedule.js (cron 1. dnia miesiąca).
CREATE TABLE IF NOT EXISTS finance_report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  cadence TEXT NOT NULL DEFAULT 'monthly',   -- monthly | quarterly | yearly
  recipients TEXT[] NOT NULL DEFAULT '{}',
  include_csv BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  next_run_date DATE,                         -- najbliższy dzień wysyłki (1. dnia nowego okresu)
  last_run_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_finance_report_schedules_due ON finance_report_schedules (is_active, next_run_date);
