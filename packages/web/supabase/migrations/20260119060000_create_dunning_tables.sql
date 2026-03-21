-- =====================================================
-- TABELE DUNNING (System windykacji)
-- =====================================================

-- Konfiguracja etapów dunning
CREATE TABLE IF NOT EXISTS dunning_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage INTEGER NOT NULL UNIQUE,        -- 1, 2, 3, 4
  name VARCHAR(100) NOT NULL,           -- Nazwa etapu
  days_after_due INTEGER NOT NULL,      -- Dni po terminie płatności
  action VARCHAR(50) NOT NULL CHECK (action IN ('email', 'suspend', 'cancel')),
  email_template VARCHAR(50),           -- Nazwa szablonu emaila
  email_subject VARCHAR(255),           -- Temat emaila
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Domyślna konfiguracja dunning
INSERT INTO dunning_config (stage, name, days_after_due, action, email_template, email_subject) VALUES
(1, 'Pierwsze przypomnienie', 3, 'email', 'dunning_reminder_1', 'Przypomnienie o płatności - faktura FN/{invoice_number}'),
(2, 'Drugie przypomnienie', 7, 'email', 'dunning_reminder_2', 'Pilne: Nieuregulowana faktura FN/{invoice_number}'),
(3, 'Ostrzeżenie przed zawieszeniem', 14, 'email', 'dunning_final_warning', 'Ostatnie ostrzeżenie - zawieszenie konta za 7 dni'),
(4, 'Zawieszenie konta', 21, 'suspend', 'dunning_suspension', 'Twoje konto zostało zawieszone');

-- Log wykonanych akcji dunning
CREATE TABLE IF NOT EXISTS dunning_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  config_id UUID REFERENCES dunning_config(id),
  stage INTEGER NOT NULL,
  action_taken VARCHAR(50) NOT NULL,
  email_sent_to VARCHAR(255),
  email_sent_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeksy
CREATE INDEX idx_dunning_log_tenant ON dunning_log(tenant_id);
CREATE INDEX idx_dunning_log_invoice ON dunning_log(invoice_id);
CREATE INDEX idx_dunning_log_stage ON dunning_log(stage);
CREATE INDEX idx_dunning_log_created ON dunning_log(created_at);

-- RLS dla dunning_config
ALTER TABLE dunning_config ENABLE ROW LEVEL SECURITY;

-- Tylko super admin może zarządzać konfiguracją
CREATE POLICY "Super admins can manage dunning config"
  ON dunning_config
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE app_users.id = auth.uid()
      AND app_users.is_super_admin = TRUE
    )
  );

-- RLS dla dunning_log
ALTER TABLE dunning_log ENABLE ROW LEVEL SECURITY;

-- Super admin może wszystko
CREATE POLICY "Super admins can do everything on dunning log"
  ON dunning_log
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE app_users.id = auth.uid()
      AND app_users.is_super_admin = TRUE
    )
  );

-- Użytkownicy mogą widzieć log swojego tenanta
CREATE POLICY "Users can view their tenant dunning log"
  ON dunning_log
  FOR SELECT
  USING (
    tenant_id = (
      SELECT tenant_id FROM app_users
      WHERE app_users.id = auth.uid()
    )
  );

-- Funkcja do przetwarzania dunning
CREATE OR REPLACE FUNCTION process_dunning()
RETURNS TABLE (
  tenant_id UUID,
  invoice_id UUID,
  invoice_number VARCHAR,
  tenant_email VARCHAR,
  days_overdue INTEGER,
  next_stage INTEGER,
  action_to_take VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.tenant_id,
    i.id as invoice_id,
    i.invoice_number,
    t.email as tenant_email,
    (CURRENT_DATE - i.due_date)::INTEGER as days_overdue,
    COALESCE(
      (SELECT MIN(dc.stage) FROM dunning_config dc
       WHERE dc.is_active = TRUE
         AND dc.days_after_due <= (CURRENT_DATE - i.due_date)
         AND NOT EXISTS (
           SELECT 1 FROM dunning_log dl
           WHERE dl.invoice_id = i.id AND dl.stage = dc.stage
         )
      ), 0
    ) as next_stage,
    (SELECT dc.action FROM dunning_config dc
     WHERE dc.stage = COALESCE(
       (SELECT MIN(dc2.stage) FROM dunning_config dc2
        WHERE dc2.is_active = TRUE
          AND dc2.days_after_due <= (CURRENT_DATE - i.due_date)
          AND NOT EXISTS (
            SELECT 1 FROM dunning_log dl
            WHERE dl.invoice_id = i.id AND dl.stage = dc2.stage
          )
       ), 0
     )
    ) as action_to_take
  FROM invoices i
  JOIN tenants t ON i.tenant_id = t.id
  WHERE i.status = 'overdue'
    AND t.status != 'cancelled';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Komentarze
COMMENT ON TABLE dunning_config IS 'Konfiguracja etapów procesu windykacji';
COMMENT ON TABLE dunning_log IS 'Log wykonanych akcji windykacyjnych';
