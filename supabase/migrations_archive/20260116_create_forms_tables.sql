-- Tabela formularzy
CREATE TABLE IF NOT EXISTS forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  fields JSONB NOT NULL DEFAULT '[]',
  settings JSONB DEFAULT '{}',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
  is_template BOOLEAN DEFAULT FALSE,
  template_category TEXT,
  created_by TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  closes_at TIMESTAMPTZ,
  response_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela odpowiedzi na formularze
CREATE TABLE IF NOT EXISTS form_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  answers JSONB NOT NULL DEFAULT '{}',
  respondent_email TEXT,
  respondent_name TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeksy
CREATE INDEX IF NOT EXISTS idx_forms_status ON forms(status);
CREATE INDEX IF NOT EXISTS idx_forms_created_by ON forms(created_by);
CREATE INDEX IF NOT EXISTS idx_forms_is_template ON forms(is_template);
CREATE INDEX IF NOT EXISTS idx_form_responses_form_id ON form_responses(form_id);
CREATE INDEX IF NOT EXISTS idx_form_responses_submitted_at ON form_responses(submitted_at);

-- RLS
ALTER TABLE forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_responses ENABLE ROW LEVEL SECURITY;

-- Polityki dla forms
CREATE POLICY "forms_select_authenticated" ON forms
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "forms_insert_authenticated" ON forms
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "forms_update_authenticated" ON forms
  FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "forms_delete_authenticated" ON forms
  FOR DELETE TO authenticated
  USING (true);

-- Polityki dla form_responses
-- Publiczny SELECT dla opublikowanych formularzy (do sprawdzenia limitu)
CREATE POLICY "form_responses_select_public" ON form_responses
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM forms WHERE id = form_id AND status = 'published'
    )
  );

CREATE POLICY "form_responses_select_authenticated" ON form_responses
  FOR SELECT TO authenticated
  USING (true);

-- Publiczny INSERT dla opublikowanych formularzy
CREATE POLICY "form_responses_insert_anon" ON form_responses
  FOR INSERT TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM forms WHERE id = form_id AND status = 'published'
    )
  );

CREATE POLICY "form_responses_insert_authenticated" ON form_responses
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "form_responses_delete_authenticated" ON form_responses
  FOR DELETE TO authenticated
  USING (true);

-- Trigger do aktualizacji updated_at
CREATE OR REPLACE FUNCTION update_forms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_forms_updated_at
  BEFORE UPDATE ON forms
  FOR EACH ROW EXECUTE FUNCTION update_forms_updated_at();

-- Trigger do aktualizacji response_count
CREATE OR REPLACE FUNCTION update_form_response_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE forms SET response_count = response_count + 1 WHERE id = NEW.form_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE forms SET response_count = response_count - 1 WHERE id = OLD.form_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_form_response_count_trigger
  AFTER INSERT OR DELETE ON form_responses
  FOR EACH ROW EXECUTE FUNCTION update_form_response_count();

-- Storage bucket dla uploadu plików w formularzach
INSERT INTO storage.buckets (id, name, public)
VALUES ('form-uploads', 'form-uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Polityki storage dla form-uploads
CREATE POLICY "form_uploads_insert_public"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'form-uploads');

CREATE POLICY "form_uploads_select_public"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'form-uploads');

CREATE POLICY "form_uploads_delete_authenticated"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'form-uploads');
