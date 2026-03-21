-- Tabela przechowująca przypisania do służby z statusem akceptacji
-- Pozwala śledzić czy osoba zaakceptowała/odrzuciła przypisanie

CREATE TABLE IF NOT EXISTS schedule_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id BIGINT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  team_type TEXT NOT NULL, -- 'worship', 'media', 'atmosfera', 'kids', 'scena'
  role_key TEXT NOT NULL, -- 'piano', 'wokale', 'lider', itp.
  assigned_name TEXT NOT NULL, -- imię i nazwisko przypisanej osoby
  assigned_email TEXT, -- email przypisanej osoby (jeśli znany)
  assigned_by_email TEXT NOT NULL, -- email osoby która przypisała
  assigned_by_name TEXT, -- imię osoby która przypisała
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'rejected'
  token UUID DEFAULT gen_random_uuid(), -- unikalny token do linku akceptacji
  responded_at TIMESTAMPTZ, -- kiedy odpowiedziano
  email_sent_at TIMESTAMPTZ, -- kiedy wysłano email
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unikalne przypisanie: jedna osoba do jednej roli w jednym programie
  UNIQUE(program_id, team_type, role_key, assigned_name)
);

-- Indeksy dla szybkiego wyszukiwania
CREATE INDEX IF NOT EXISTS idx_schedule_assignments_program ON schedule_assignments(program_id);
CREATE INDEX IF NOT EXISTS idx_schedule_assignments_assigned_email ON schedule_assignments(assigned_email);
CREATE INDEX IF NOT EXISTS idx_schedule_assignments_token ON schedule_assignments(token);
CREATE INDEX IF NOT EXISTS idx_schedule_assignments_status ON schedule_assignments(status);
CREATE INDEX IF NOT EXISTS idx_schedule_assignments_pending ON schedule_assignments(assigned_email, status) WHERE status = 'pending';

-- RLS dla tabeli
ALTER TABLE schedule_assignments ENABLE ROW LEVEL SECURITY;

-- SELECT - wszyscy mogą czytać (dla sprawdzania statusu)
CREATE POLICY "schedule_assignments_select_all" ON schedule_assignments
FOR SELECT USING (true);

-- INSERT - tylko zalogowani
CREATE POLICY "schedule_assignments_insert_auth" ON schedule_assignments
FOR INSERT TO authenticated WITH CHECK (true);

-- UPDATE - tylko zalogowani
CREATE POLICY "schedule_assignments_update_auth" ON schedule_assignments
FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- DELETE - tylko zalogowani
CREATE POLICY "schedule_assignments_delete_auth" ON schedule_assignments
FOR DELETE TO authenticated USING (true);

-- Uprawnienia
GRANT ALL ON schedule_assignments TO authenticated;
GRANT SELECT ON schedule_assignments TO anon;
-- Anon może też aktualizować (dla linku akceptacji bez logowania)
GRANT UPDATE ON schedule_assignments TO anon;

-- Funkcja do automatycznej aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_schedule_assignments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_schedule_assignments_updated_at ON schedule_assignments;
CREATE TRIGGER trigger_schedule_assignments_updated_at
  BEFORE UPDATE ON schedule_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_schedule_assignments_updated_at();

SELECT 'Utworzono tabelę schedule_assignments!' as status;
