-- =====================================================================
-- MODUŁ TABLICE / PROJEKTY (Work OS w stylu Monday.com)
-- =====================================================================
-- Generyczny silnik tablic: Tablica → Grupy → Elementy/Podelementy →
-- typowane Kolumny (wartości w JSONB `cells`) → Widoki → Automatyzacje →
-- Aktualizacje/@wzmianki → Dziennik aktywności → Dashboardy BI.
--
-- Idempotentne (CREATE ... IF NOT EXISTS). Bez RLS/realtime/pg_cron —
-- builder tenant_schema przepuszcza to bez zmian, a worker node-cron
-- (packages/api) obsłuży automatyzacje czasowe.
-- =====================================================================

-- 1. Tablice ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS boards (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    campus_id INTEGER,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT DEFAULT 'LayoutGrid',
    color TEXT DEFAULT '#6366f1',
    module_key TEXT,               -- gdy tablica jest osadzona jako zakładka modułu (component_type='board')
    folder TEXT,                   -- workspace/folder grupujący tablice na liście
    source_kind TEXT,              -- ślad po ujednoliceniu (np. 'mlodziezowka_tasks')
    is_template BOOLEAN DEFAULT false,
    is_archived BOOLEAN DEFAULT false,
    owner_email TEXT,
    visibility TEXT DEFAULT 'workspace',  -- workspace (wszyscy) | private (właściciel + edytorzy)
    editors TEXT[] DEFAULT '{}',          -- e-maile z dostępem do prywatnej tablicy
    display_order INTEGER DEFAULT 0,
    created_by TEXT,
    -- Publiczny formularz (jak WorkForms w Monday): token + włącznik + ustawienia
    form_enabled BOOLEAN DEFAULT false,
    form_token TEXT,
    form_settings JSONB DEFAULT '{}'::jsonb,  -- { title, description, submitMessage, anonymous, collectEmail, fields:[colId] }
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_boards_module_key ON boards(module_key);
CREATE INDEX IF NOT EXISTS idx_boards_campus ON boards(campus_id);
CREATE INDEX IF NOT EXISTS idx_boards_order ON boards(display_order);
CREATE INDEX IF NOT EXISTS idx_boards_template ON boards(is_template) WHERE is_template = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_boards_form_token ON boards(form_token) WHERE form_token IS NOT NULL;

-- 2. Grupy (kolorowe sekcje elementów) --------------------------------
CREATE TABLE IF NOT EXISTS board_groups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Nowa grupa',
    color TEXT DEFAULT '#579bfc',
    display_order INTEGER DEFAULT 0,
    collapsed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_board_groups_board ON board_groups(board_id, display_order);

-- 3. Kolumny (definicje typowanych kolumn; ustawienia w settings JSONB)
--    type ∈ status|text|long_text|number|date|timeline|people|dropdown|
--    checkbox|priority|link|files|rating|progress|formula|dependency|
--    connect_board|mirror|last_updated|created_log|item_id|vote|time_tracking
CREATE TABLE IF NOT EXISTS board_columns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'text',
    settings JSONB DEFAULT '{}'::jsonb,   -- etykiety+kolory statusów, format liczb, wyrażenie formuły, docelowa tablica itd.
    display_order INTEGER DEFAULT 0,
    width INTEGER DEFAULT 160,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_board_columns_board ON board_columns(board_id, display_order);

-- 4. Elementy / Podelementy (wartości komórek w cells: {columnId: value})
CREATE TABLE IF NOT EXISTS board_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    group_id UUID REFERENCES board_groups(id) ON DELETE SET NULL,
    parent_item_id UUID REFERENCES board_items(id) ON DELETE CASCADE,  -- null=element, inaczej podelement
    name TEXT NOT NULL DEFAULT '',
    cells JSONB DEFAULT '{}'::jsonb,       -- mapa columnId → wartość (kształt zależny od typu kolumny)
    display_order INTEGER DEFAULT 0,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_board_items_board ON board_items(board_id);
CREATE INDEX IF NOT EXISTS idx_board_items_group ON board_items(group_id, display_order);
CREATE INDEX IF NOT EXISTS idx_board_items_parent ON board_items(parent_item_id);

-- 5. Aktualizacje (wątek komentarzy z odpowiedziami, @wzmiankami, polubieniami)
CREATE TABLE IF NOT EXISTS board_item_updates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    item_id UUID NOT NULL REFERENCES board_items(id) ON DELETE CASCADE,
    board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
    parent_update_id UUID REFERENCES board_item_updates(id) ON DELETE CASCADE,
    author_email TEXT,
    author_name TEXT,
    body TEXT,
    mentions TEXT[] DEFAULT '{}',
    attachments JSONB DEFAULT '[]'::jsonb,
    likes TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_board_item_updates_item ON board_item_updates(item_id, created_at);

-- 6. Dziennik aktywności (auto-zapis zmian wartości/statusu/przypisań)
CREATE TABLE IF NOT EXISTS board_item_activity (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    item_id UUID NOT NULL REFERENCES board_items(id) ON DELETE CASCADE,
    board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
    actor_email TEXT,
    actor_name TEXT,
    column_id UUID,
    action TEXT NOT NULL,                  -- created|value_changed|status_changed|assigned|moved|deleted|...
    from_value JSONB,
    to_value JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_board_item_activity_item ON board_item_activity(item_id, created_at);

-- 7. Widoki (Tabela/Kanban/Kalendarz/Oś czasu/Wykres/Formularz)
--    owner_email = null → widok współdzielony; inaczej osobisty
CREATE TABLE IF NOT EXISTS board_views (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'table',
    config JSONB DEFAULT '{}'::jsonb,      -- groupBy, filters[], sorts[], visibleColumns[], colorBy, dateColumnId...
    owner_email TEXT,
    is_default BOOLEAN DEFAULT false,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_board_views_board ON board_views(board_id, display_order);

-- 8. Automatyzacje ("kiedy [trigger] → [akcje]")
CREATE TABLE IF NOT EXISTS board_automations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name TEXT,
    enabled BOOLEAN DEFAULT true,
    trigger JSONB NOT NULL DEFAULT '{}'::jsonb,   -- {type, columnId, value, period, ...}
    actions JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{type, params}]
    last_run_at TIMESTAMPTZ,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_board_automations_board ON board_automations(board_id);
CREATE INDEX IF NOT EXISTS idx_board_automations_enabled ON board_automations(enabled) WHERE enabled = true;

-- 9. Log wykonań automatyzacji
CREATE TABLE IF NOT EXISTS board_automation_runs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    automation_id UUID REFERENCES board_automations(id) ON DELETE CASCADE,
    board_id UUID,
    item_id UUID,
    status TEXT NOT NULL DEFAULT 'success',  -- success|error|skipped
    detail JSONB DEFAULT '{}'::jsonb,
    ran_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_board_automation_runs_auto ON board_automation_runs(automation_id, ran_at);

-- 10. Dashboardy BI z tablic (widżety data-driven)
CREATE TABLE IF NOT EXISTS board_dashboards (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID,
    name TEXT NOT NULL,
    layout JSONB DEFAULT '[]'::jsonb,   -- [{type, board_ids[], columnId, aggregation, chartType, filters}]
    owner_email TEXT,                   -- null = współdzielony
    display_order INTEGER DEFAULT 0,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Triggery updated_at ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION board_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_boards_updated_at ON boards;
CREATE TRIGGER trg_boards_updated_at BEFORE UPDATE ON boards
    FOR EACH ROW EXECUTE FUNCTION board_touch_updated_at();

DROP TRIGGER IF EXISTS trg_board_items_updated_at ON board_items;
CREATE TRIGGER trg_board_items_updated_at BEFORE UPDATE ON board_items
    FOR EACH ROW EXECUTE FUNCTION board_touch_updated_at();

DROP TRIGGER IF EXISTS trg_board_item_updates_updated_at ON board_item_updates;
CREATE TRIGGER trg_board_item_updates_updated_at BEFORE UPDATE ON board_item_updates
    FOR EACH ROW EXECUTE FUNCTION board_touch_updated_at();

DROP TRIGGER IF EXISTS trg_board_dashboards_updated_at ON board_dashboards;
CREATE TRIGGER trg_board_dashboards_updated_at BEFORE UPDATE ON board_dashboards
    FOR EACH ROW EXECUTE FUNCTION board_touch_updated_at();

-- ── Rejestracja modułu ───────────────────────────────────────────────
INSERT INTO app_modules (key, label, icon, path, resource_key, display_order, is_system, component_name) VALUES
    ('boards', 'Projekty', 'LayoutGrid', '/projekty', 'module:boards', 16, true, 'BoardsModule')
ON CONFLICT (key) DO NOTHING;

-- Uprawnienia: system RBAC (permission_grants) — Boards jest pełnoprawnym modułem
-- katalogu (packages/shared/src/permissions/catalog.js) i rejestru Data API
-- (registry.js: tabele board_* → res:board_*:*). Granty ról nadaje seed presetów
-- oraz migracja 013_boards_member_grants.sql (członek). Legacy app_permissions
-- nie jest już używane przez resolver `can()`, więc nie zasilamy go tutaj.
