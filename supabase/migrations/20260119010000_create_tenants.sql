-- =====================================================
-- TABELA TENANTS (Klienci/Kościoły)
-- =====================================================

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,           -- Nazwa kościoła
  slug VARCHAR(100) UNIQUE NOT NULL,    -- URL-friendly identyfikator
  email VARCHAR(255) NOT NULL,          -- Email kontaktowy
  company_name VARCHAR(255),            -- Nazwa prawna (do faktury)
  tax_id VARCHAR(50),                   -- NIP
  address TEXT,
  city VARCHAR(100),
  postal_code VARCHAR(20),
  country VARCHAR(50) DEFAULT 'Polska',
  phone VARCHAR(50),
  logo_url TEXT,
  status VARCHAR(20) DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'suspended', 'cancelled')),
  trial_ends_at TIMESTAMPTZ,
  settings JSONB DEFAULT '{}'::jsonb,   -- Ustawienia kościoła
  metadata JSONB DEFAULT '{}'::jsonb,   -- Dodatkowe dane
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeksy
CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_status ON tenants(status);
CREATE INDEX idx_tenants_email ON tenants(email);

-- Trigger aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_tenants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION update_tenants_updated_at();

-- RLS dla tenants
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- Super admin może wszystko
CREATE POLICY "Super admins can do everything on tenants"
  ON tenants
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE app_users.auth_user_id = auth.uid()
      AND app_users.is_super_admin = TRUE
    )
  );

-- Użytkownicy mogą widzieć tylko swojego tenanta
CREATE POLICY "Users can view their own tenant"
  ON tenants
  FOR SELECT
  USING (
    id = (
      SELECT tenant_id FROM app_users
      WHERE app_users.auth_user_id = auth.uid()
    )
  );

-- Komentarz
COMMENT ON TABLE tenants IS 'Tabela klientów (kościołów) w systemie SaaS';
