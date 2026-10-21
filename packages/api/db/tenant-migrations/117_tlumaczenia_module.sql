-- 117: Wbudowany moduł służby „Tłumaczenia” (key 'tlumaczenia') + grafik → kanały tłumaczenia.
--
-- Moduł jak Media/Gościnność: Wydarzenia, Grafik, Zadania (Tablica, source_kind 'tlumaczenia_tasks'),
-- Członkowie (status Aktywny/Nieaktywny), Służby (= języki: team_roles team_type 'tlumaczenia',
-- field_key = kod języka en/uk/ru…), Finanse (team_type 'Tłumaczenia'), Pliki, Sprzęt.
--   • custom_tlumaczenia_members — skład służby. Prefiks custom_ celowo: wszystkie mapy
--     „zespół → tabela osób” mają fallback custom_<team>_members (grafik, tablice, tożsamość
--     osoby z grafiku, dostępność, mobilka). Logika modułów z kreatora tego klucza NIE obejmuje:
--     klucz jest w katalogu (MINISTRY_MODULES), app_modules.component_name jest ustawione,
--     a chat-channels-sync ma go w BUILTIN_TEAMS (kanał 'tlumaczenia_team').
--   • interpretation_interpreters.source — 'manual' (karta „Tłumaczenie na żywo”) albo
--     'schedule' (z grafiku: dopisuje/zdejmuje WYŁĄCZNIE interpretation/scheduleSync.js);
--     interpretation_channels.source — 'schedule' dla kanałów założonych przez synchronizację
--     (pusty kanał z grafiku, który nie nadaje, sync może usunąć; ręcznych nigdy).
-- Idempotentnie i bezpiecznie dla żywego tenanta (schwro: istniejące app_modules, team_roles
-- innych zespołów — nic istniejącego nie jest zmieniane, tylko dopisywane, gdy brak).

-- ── Skład służby ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS custom_tlumaczenia_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role TEXT,
    status TEXT DEFAULT 'Aktywny',
    is_leader BOOLEAN DEFAULT false,
    avatar_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_custom_tlumaczenia_members_email_117 ON custom_tlumaczenia_members (lower(email));

-- Powiązanie z kontem (jak 026): typ kolumny = typ app_users.id (uuid w szablonie i na produkcji).
DO $$
DECLARE id_type text;
BEGIN
  IF to_regclass('public.app_users') IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'custom_tlumaczenia_members' AND column_name = 'user_id') THEN
    RETURN;
  END IF;
  SELECT format_type(a.atttypid, a.atttypmod) INTO id_type
    FROM pg_attribute a WHERE a.attrelid = 'public.app_users'::regclass AND a.attname = 'id' AND NOT a.attisdropped;
  IF id_type IS NULL THEN RETURN; END IF;
  EXECUTE format('ALTER TABLE custom_tlumaczenia_members ADD COLUMN user_id %s REFERENCES app_users(id) ON DELETE SET NULL', id_type);
  CREATE INDEX IF NOT EXISTS idx_custom_tlumaczenia_members_user_117 ON custom_tlumaczenia_members (user_id);
END $$;

-- ── Moduł w menu (app_modules) ───────────────────────────────────────────────
INSERT INTO app_modules (key, label, icon, path, resource_key, display_order, is_system, is_enabled, component_name)
SELECT 'tlumaczenia', 'Tłumaczenia', 'Languages', '/tlumaczenia', 'module:tlumaczenia',
       COALESCE((SELECT MAX(display_order) FROM app_modules), 0) + 1,
       true, true, 'TlumaczeniaModule'
WHERE NOT EXISTS (SELECT 1 FROM app_modules WHERE key = 'tlumaczenia');

-- Zakładki (jak Media w szablonie; WHERE NOT EXISTS zamiast ON CONFLICT — unikat bywa różny).
INSERT INTO app_module_tabs (module_id, key, label, icon, display_order, is_system)
SELECT m.id, t.key, t.label, t.icon, t.ord, true
  FROM app_modules m
 CROSS JOIN (VALUES
    ('events', 'Wydarzenia', 'Calendar', 0),
    ('schedule', 'Grafik', 'Calendar', 1),
    ('tasks', 'Zadania', 'CheckSquare', 2),
    ('members', 'Członkowie', 'User', 3),
    ('roles', 'Służby', 'Users', 4),
    ('finances', 'Finanse', 'DollarSign', 5),
    ('files', 'Pliki', 'FolderOpen', 6),
    ('equipment', 'Sprzęt', 'Package', 7)
 ) AS t(key, label, icon, ord)
 WHERE m.key = 'tlumaczenia'
   AND NOT EXISTS (SELECT 1 FROM app_module_tabs x WHERE x.module_id = m.id AND x.key = t.key);

-- ── Służby = języki (tylko gdy zespół nie ma jeszcze żadnej) ─────────────────
-- field_key = kod języka kanału tłumaczenia (scheduleSync mapuje rolę → kanał po tym kodzie).
DO $$
BEGIN
  IF to_regclass('public.team_roles') IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM team_roles WHERE team_type = 'tlumaczenia') THEN RETURN; END IF;
  ALTER TABLE team_roles ADD COLUMN IF NOT EXISTS field_key TEXT;
  ALTER TABLE team_roles ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;
  ALTER TABLE team_roles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
  INSERT INTO team_roles (name, team_type, field_key, display_order, is_active) VALUES
    ('Tłumacz EN', 'tlumaczenia', 'en', 1, true),
    ('Tłumacz UK', 'tlumaczenia', 'uk', 2, true),
    ('Tłumacz RU', 'tlumaczenia', 'ru', 3, true);
END $$;

-- ── Tłumaczenie na żywo: źródło przypisania tłumacza / kanału ────────────────
DO $$
BEGIN
  IF to_regclass('public.interpretation_interpreters') IS NOT NULL THEN
    ALTER TABLE interpretation_interpreters ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';
    CREATE INDEX IF NOT EXISTS idx_interp_interpreters_source_117 ON interpretation_interpreters (channel_id) WHERE source = 'schedule';
  END IF;
  IF to_regclass('public.interpretation_channels') IS NOT NULL THEN
    ALTER TABLE interpretation_channels ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';
  END IF;
END $$;

-- Grafik tłumaczy szukany po wydarzeniu (sync po zapisie i co 10 min w workerze).
DO $$
BEGIN
  IF to_regclass('public.schedule_assignments') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'schedule_assignments' AND column_name = 'event_id') THEN
    CREATE INDEX IF NOT EXISTS idx_schedule_assignments_tlumaczenia_117
      ON schedule_assignments (event_id) WHERE team_type = 'tlumaczenia';
  END IF;
END $$;

-- Uprawnienia: koordynator / rada mają module:* (widzą moduł od razu); lider i członek — z
-- przynależności do służby (ministry_memberships, Ustawienia → Służby). Lider służby Tłumaczeń
-- dostaje też action:calendar:manage_interpretation (ministry.js) — bez seedu grantów.
