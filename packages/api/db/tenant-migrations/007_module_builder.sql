-- Migracja 007: Kreator graficzny modułów.
--
--  1. app_module_tabs.layout JSONB — drzewo układu (elementy/bloki) dla zakładek
--     typu component_type='custom'. NULL dla pozostałych typów.
--  2. module_records — generyczna tabela rekordów dla „własnych kolekcji danych"
--     tworzonych w kreatorze. Świadomie BEZ dynamicznego DDL (backend nie przyjmuje
--     client-DDL). Schemat pól kolekcji żyje w layout (element 'collection').
--     module_key jest zdenormalizowany, aby serwer mógł egzekwować capability
--     module:<key> per rekord (parytet z danymi modułów systemowych).
--
-- Baza tenanta = osobna baza per tenant (brak kolumny tenant_id).

ALTER TABLE app_module_tabs ADD COLUMN IF NOT EXISTS layout JSONB;

CREATE TABLE IF NOT EXISTS module_records (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    module_id UUID REFERENCES app_modules(id) ON DELETE CASCADE,
    module_key TEXT NOT NULL,
    tab_id UUID REFERENCES app_module_tabs(id) ON DELETE CASCADE,
    collection_key TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_module_records_scope ON module_records(module_id, tab_id, collection_key);
CREATE INDEX IF NOT EXISTS idx_module_records_module_key ON module_records(module_key);
