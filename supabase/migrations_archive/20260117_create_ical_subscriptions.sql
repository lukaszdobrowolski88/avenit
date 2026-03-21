-- Tabela przechowująca subskrypcje kalendarza iCal dla użytkowników
-- Każdy użytkownik ma unikalny token do dostępu do swojego kalendarza

CREATE TABLE IF NOT EXISTS ical_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Powiązanie z użytkownikiem
  user_email TEXT NOT NULL,

  -- Unikalny token dostępu (32-znakowy hex)
  token TEXT NOT NULL UNIQUE,

  -- Preferencje eksportu - JSON z wybranymi źródłami wydarzeń
  export_preferences JSONB DEFAULT '{
    "programs": true,
    "events": true,
    "tasks": true,
    "mlodziezowka": false,
    "worship": false,
    "media": false,
    "atmosfera": false,
    "kids": false,
    "homegroups": false
  }'::jsonb,

  -- Metadane
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ,
  access_count INTEGER DEFAULT 0
);

-- Indeksy
CREATE INDEX IF NOT EXISTS idx_ical_subscriptions_user ON ical_subscriptions(user_email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ical_subscriptions_token ON ical_subscriptions(token);

-- RLS
ALTER TABLE ical_subscriptions ENABLE ROW LEVEL SECURITY;

-- Polityka: użytkownik widzi tylko swoje subskrypcje
CREATE POLICY "ical_subscriptions_select_own" ON ical_subscriptions
  FOR SELECT TO authenticated
  USING (user_email = (SELECT email FROM auth.users WHERE id = auth.uid()));

CREATE POLICY "ical_subscriptions_insert_own" ON ical_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (user_email = (SELECT email FROM auth.users WHERE id = auth.uid()));

CREATE POLICY "ical_subscriptions_update_own" ON ical_subscriptions
  FOR UPDATE TO authenticated
  USING (user_email = (SELECT email FROM auth.users WHERE id = auth.uid()))
  WITH CHECK (user_email = (SELECT email FROM auth.users WHERE id = auth.uid()));

CREATE POLICY "ical_subscriptions_delete_own" ON ical_subscriptions
  FOR DELETE TO authenticated
  USING (user_email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- Uprawnienia
GRANT ALL ON ical_subscriptions TO authenticated;

-- Funkcja do automatycznej aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_ical_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_ical_subscriptions_updated_at ON ical_subscriptions;
CREATE TRIGGER trigger_ical_subscriptions_updated_at
  BEFORE UPDATE ON ical_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_ical_subscriptions_updated_at();

SELECT 'Utworzono tabelę ical_subscriptions!' as status;
