-- Tabela szablonów programów nabożeństw
CREATE TABLE IF NOT EXISTS program_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    schedule JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS
ALTER TABLE program_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "program_templates_select" ON program_templates;
CREATE POLICY "program_templates_select" ON program_templates
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "program_templates_insert" ON program_templates;
CREATE POLICY "program_templates_insert" ON program_templates
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "program_templates_update" ON program_templates;
CREATE POLICY "program_templates_update" ON program_templates
    FOR UPDATE USING (true);

DROP POLICY IF EXISTS "program_templates_delete" ON program_templates;
CREATE POLICY "program_templates_delete" ON program_templates
    FOR DELETE USING (true);
