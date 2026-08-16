// Role wbudowane + domyślne presety grantów (seed przy prowizjonowaniu / migracji).
// Presety to punkt startowy — tenant edytuje je w macierzy uprawnień.

const allow = (capability) => ({ capability, allowed: true });
const deny = (capability) => ({ capability, allowed: false });

const FINANCE_RES = ['finance_transactions', 'finance_balances', 'expenses', 'expense_categories'];
const SETTINGS_RES = ['app_users', 'app_settings', 'app_permissions', 'app_roles', 'app_modules', 'app_module_tabs', 'campuses', 'integration_settings'];

export const BUILTIN_ROLES = [
  { key: 'superadmin', label: 'Superadmin', description: 'Pełny, nieograniczony dostęp', is_system: true, is_admin: true, display_order: 0 },
  { key: 'rada_starszych', label: 'Rada Starszych', description: 'Pełny dostęp (edytowalny)', is_system: true, is_admin: false, display_order: 1 },
  { key: 'koordynator', label: 'Koordynator', description: 'Zarządza modułami i danymi (bez ról/uprawnień)', is_system: true, is_admin: false, display_order: 2 },
  { key: 'lider', label: 'Lider', description: 'Prowadzi służby (bez finansów i ustawień)', is_system: true, is_admin: false, display_order: 3 },
  { key: 'czlonek', label: 'Członek', description: 'Podstawowy dostęp', is_system: true, is_admin: false, display_order: 4 },
];

export const ROLE_PRESETS = {
  // superadmin: is_admin — brak grantów (resolver zwraca zawsze true).
  superadmin: [],

  // rada_starszych: pełny dostęp, ale edytowalny w macierzy.
  rada_starszych: [allow('*')],

  // koordynator: niemal pełny; bez zarządzania rolami i uprawnieniami.
  koordynator: [
    allow('module:*'), allow('tab:*:*'),
    allow('res:*:read'), allow('res:*:create'), allow('res:*:update'), allow('res:*:delete'),
    allow('action:*:*'),
    deny('action:settings:manage_permissions'),
    deny('action:settings:manage_roles'),
  ],

  // lider: widzi moduły służb, edytuje dane służbowe; bez finansów (zapis),
  // bez ustawień, bez kampanii, bez usuwania hurtem.
  lider: [
    allow('module:*'),
    deny('module:settings'), deny('module:mail'), deny('module:mailing'),
    deny('module:sms_campaigns'), deny('module:push_campaigns'),
    allow('tab:*:*'), deny('tab:*:finances'),
    allow('res:*:read'), allow('res:*:create'), allow('res:*:update'),
    // bez finansów (zapis) i ustawień (zapis)
    ...FINANCE_RES.flatMap((r) => [deny(`res:${r}:create`), deny(`res:${r}:update`), deny(`res:${r}:delete`)]),
    ...SETTINGS_RES.flatMap((r) => [deny(`res:${r}:create`), deny(`res:${r}:update`), deny(`res:${r}:delete`)]),
    // akcje: tylko służbowe
    allow('action:programs:*'), allow('action:calendar:*'), allow('action:kids:*'),
  ],

  // czlonek: minimum — kalendarz/programy (odczyt), modlitwa, komunikator, RSVP, własne zadania.
  czlonek: [
    allow('module:calendar'), allow('module:programs'), allow('module:prayer'), allow('module:komunikator'),
    allow('res:events:read'), allow('res:ministry_events:read'),
    allow('res:programs:read'), allow('res:program_songs:read'), allow('res:schedule_assignments:read'),
    allow('res:tasks:read'), allow('res:tasks:update'),
    allow('res:prayer_requests:read'), allow('res:prayer_requests:create'),
    allow('res:wall_posts:read'), allow('res:wall_posts:create'),
    allow('res:conversations:read'), allow('res:conversations:create'), allow('res:conversations:update'),
    allow('res:conversation_participants:read'), allow('res:conversation_participants:create'),
    allow('res:messages:read'), allow('res:messages:create'),
    // Projekty/Tablice — członek współpracuje: widzi wszystko, edytuje elementy i pisze aktualizacje.
    // Zmiany strukturalne (kolumny/grupy/widoki/automatyzacje/dashboardy) zostają u liderów (wildcardy).
    allow('module:boards'),
    allow('res:boards:read'), allow('res:board_groups:read'), allow('res:board_columns:read'),
    allow('res:board_views:read'), allow('res:board_dashboards:read'),
    allow('res:board_automations:read'), allow('res:board_automation_runs:read'), allow('res:board_automation_runs:create'),
    allow('res:board_items:read'), allow('res:board_items:create'), allow('res:board_items:update'),
    allow('res:board_item_updates:read'), allow('res:board_item_updates:create'),
    allow('res:board_item_activity:read'), allow('res:board_item_activity:create'),
  ],
};

// Zwraca płaskie wiersze grantów do seedu: [{ role, user_id:null, capability, allowed }]
export function presetGrantRows() {
  const rows = [];
  for (const [role, grants] of Object.entries(ROLE_PRESETS)) {
    for (const g of grants) rows.push({ role, user_id: null, capability: g.capability, allowed: g.allowed });
  }
  return rows;
}
