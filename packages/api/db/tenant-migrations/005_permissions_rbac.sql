-- 005: Szczegółowy system uprawnień (RBAC) — role własne + granty capability.
-- Zastępuje gruboziarniste app_permissions(role, resource, can_read, can_write).
-- Stara tabela app_permissions POZOSTAJE (backup/rollback); nowy kod używa
-- permission_grants + app_roles. Seed presetów mirror packages/shared/.../presets.js.
-- Idempotentne: CREATE IF NOT EXISTS + seed tylko gdy tabela pusta.

CREATE TABLE IF NOT EXISTS app_roles (
  key           TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  description   TEXT,
  is_system     BOOLEAN DEFAULT false,
  is_admin      BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

INSERT INTO app_roles (key, label, description, is_system, is_admin, display_order) VALUES
  ('superadmin','Superadmin','Pełny, nieograniczony dostęp',true,true,0),
  ('rada_starszych','Rada Starszych','Pełny dostęp (edytowalny)',true,false,1),
  ('koordynator','Koordynator','Zarządza modułami i danymi (bez ról/uprawnień)',true,false,2),
  ('lider','Lider','Prowadzi służby (bez finansów i ustawień)',true,false,3),
  ('czlonek','Członek','Podstawowy dostęp',true,false,4)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS permission_grants (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  role       TEXT REFERENCES app_roles(key) ON DELETE CASCADE,
  user_id    UUID REFERENCES app_users(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  allowed    BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- grant jest ALBO na rolę (role set, user_id NULL), ALBO na użytkownika (odwrotnie)
  CONSTRAINT permission_grants_subject CHECK ((role IS NOT NULL) <> (user_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS permission_grants_role_cap ON permission_grants (role, capability) WHERE user_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS permission_grants_user_cap ON permission_grants (user_id, capability) WHERE role IS NULL;
CREATE INDEX IF NOT EXISTS permission_grants_lookup ON permission_grants (role, user_id);

-- Seed grantów presetów — tylko gdy brak jakichkolwiek grantów (pierwsze wdrożenie).
INSERT INTO permission_grants (role, user_id, capability, allowed)
SELECT v.role, NULL::uuid, v.capability, v.allowed FROM (VALUES
  ('rada_starszych','*',true),
  ('koordynator','module:*',true),
  ('koordynator','tab:*:*',true),
  ('koordynator','res:*:read',true),
  ('koordynator','res:*:create',true),
  ('koordynator','res:*:update',true),
  ('koordynator','res:*:delete',true),
  ('koordynator','action:*:*',true),
  ('koordynator','action:settings:manage_permissions',false),
  ('koordynator','action:settings:manage_roles',false),
  ('lider','module:*',true),
  ('lider','module:settings',false),
  ('lider','module:mail',false),
  ('lider','module:mailing',false),
  ('lider','module:sms_campaigns',false),
  ('lider','module:push_campaigns',false),
  ('lider','tab:*:*',true),
  ('lider','tab:*:finances',false),
  ('lider','res:*:read',true),
  ('lider','res:*:create',true),
  ('lider','res:*:update',true),
  ('lider','res:finance_transactions:create',false),
  ('lider','res:finance_transactions:update',false),
  ('lider','res:finance_transactions:delete',false),
  ('lider','res:finance_balances:create',false),
  ('lider','res:finance_balances:update',false),
  ('lider','res:finance_balances:delete',false),
  ('lider','res:expenses:create',false),
  ('lider','res:expenses:update',false),
  ('lider','res:expenses:delete',false),
  ('lider','res:expense_categories:create',false),
  ('lider','res:expense_categories:update',false),
  ('lider','res:expense_categories:delete',false),
  ('lider','res:app_users:create',false),
  ('lider','res:app_users:update',false),
  ('lider','res:app_users:delete',false),
  ('lider','res:app_settings:create',false),
  ('lider','res:app_settings:update',false),
  ('lider','res:app_settings:delete',false),
  ('lider','res:app_permissions:create',false),
  ('lider','res:app_permissions:update',false),
  ('lider','res:app_permissions:delete',false),
  ('lider','res:app_roles:create',false),
  ('lider','res:app_roles:update',false),
  ('lider','res:app_roles:delete',false),
  ('lider','res:app_modules:create',false),
  ('lider','res:app_modules:update',false),
  ('lider','res:app_modules:delete',false),
  ('lider','res:app_module_tabs:create',false),
  ('lider','res:app_module_tabs:update',false),
  ('lider','res:app_module_tabs:delete',false),
  ('lider','res:campuses:create',false),
  ('lider','res:campuses:update',false),
  ('lider','res:campuses:delete',false),
  ('lider','res:integration_settings:create',false),
  ('lider','res:integration_settings:update',false),
  ('lider','res:integration_settings:delete',false),
  ('lider','action:programs:*',true),
  ('lider','action:calendar:*',true),
  ('lider','action:kids:*',true),
  ('czlonek','module:calendar',true),
  ('czlonek','module:programs',true),
  ('czlonek','module:prayer',true),
  ('czlonek','module:komunikator',true),
  ('czlonek','res:events:read',true),
  ('czlonek','res:ministry_events:read',true),
  ('czlonek','res:programs:read',true),
  ('czlonek','res:program_songs:read',true),
  ('czlonek','res:schedule_assignments:read',true),
  ('czlonek','res:tasks:read',true),
  ('czlonek','res:tasks:update',true),
  ('czlonek','res:prayer_requests:read',true),
  ('czlonek','res:prayer_requests:create',true),
  ('czlonek','res:wall_posts:read',true),
  ('czlonek','res:wall_posts:create',true),
  ('czlonek','res:conversations:read',true),
  ('czlonek','res:conversations:create',true),
  ('czlonek','res:conversations:update',true),
  ('czlonek','res:conversation_participants:read',true),
  ('czlonek','res:conversation_participants:create',true),
  ('czlonek','res:messages:read',true),
  ('czlonek','res:messages:create',true)
) AS v(role, capability, allowed)
WHERE NOT EXISTS (SELECT 1 FROM permission_grants);
