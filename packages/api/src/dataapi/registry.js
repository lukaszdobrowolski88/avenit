// Rejestr tabel Data API — serwerowa warstwa autoryzacji (zastępuje RLS).
//
// Zasady:
//  - Tabela spoza rejestru => brak dostępu (fail-closed).
//  - `resource` wiąże tabelę z macierzą uprawnień app_permissions (can_read/can_write
//    per rola) — tak jak dotąd w UI (ProtectedRoute/Sidebar), ale egzekwowane na serwerze.
//  - `resource: null` => tabela dostępna dla każdego zalogowanego (dane wspólne).
//  - `writeRoles` => nadpisuje can_write (tylko wymienione role mogą pisać).
//  - `hiddenColumns` => nigdy nie wychodzą w SELECT i nie wolno ich ustawiać/filtrów.
//  - `relationships` => dozwolone embedy (zagnieżdżone selecty) — patrz querybuilder.
//
// Role (app_users.role): superadmin, rada_starszych, koordynator, lider, czlonek.
// superadmin i rada_starszych mają pełny dostęp (jak w ProtectedRoute).

export const ADMIN_ROLES = ['superadmin', 'rada_starszych'];

// Relacja: { table, column, type: 'one' | 'many' }
//  one:  bieżąca tabela ma FK `column` -> table(id)
//  many: `table` ma FK `column` -> bieżąca(id)
const T = (resource, extra = {}) => ({ resource, ...extra });

export const REGISTRY = {
  // ── Rdzeń / konfiguracja ────────────────────────────────────────────────
  app_users: T(null, {
    hiddenColumns: ['password_hash', 'totp_secret', 'totp_backup_codes'],
    writeRoles: ADMIN_ROLES,
    // Własny profil może edytować każdy — obsłużone w routes (self-update whitelist).
    selfUpdateColumns: ['full_name', 'name', 'avatar_url', 'phone', 'totp_required'],
  }),
  app_settings: T(null, { writeRoles: ADMIN_ROLES }),
  app_permissions: T(null, { writeRoles: ADMIN_ROLES }),
  app_modules: T(null, { writeRoles: ADMIN_ROLES }),
  app_module_tabs: T(null, { writeRoles: ADMIN_ROLES }),
  campuses: T(null, { writeRoles: ADMIN_ROLES }),
  notifications: T(null),
  user_presence: T(null),
  push_subscriptions: T(null),
  push_tokens: T(null),
  ical_subscriptions: T(null),
  integration_settings: T('module:settings', {
    readRoles: ADMIN_ROLES,
    writeRoles: ADMIN_ROLES,
    hiddenColumns: [],
  }),

  // ── Programy / kalendarz ────────────────────────────────────────────────
  programs: T('module:programs', {
    relationships: { type: { table: 'program_types', column: 'type_id', type: 'one' } },
  }),
  program_types: T('module:programs'),
  program_songs: T('module:programs', {
    relationships: { song: { table: 'songs', column: 'song_id', type: 'one' } },
  }),
  schedule_assignments: T('module:programs'),
  events: T('module:calendar'),
  ministry_events: T('module:calendar'),
  tasks: T('module:calendar'),
  user_task_comments: T(null),

  // ── Członkowie ──────────────────────────────────────────────────────────
  members: T('module:members'),
  households: T('module:members'),
  parent_contacts: T('module:members'),
  groups: T('module:members'),
  group_members: T('module:members'),

  // ── Uwielbienie / zespoły ───────────────────────────────────────────────
  songs: T('module:worship'),
  song_attachments: T('module:worship'),
  worship_events: T('module:worship'),
  worship_team: T('module:worship'),
  media_events: T('module:media'),
  media_team: T('module:media'),
  equipment: T('module:media'),
  atmosfera_events: T('module:atmosfera'),
  atmosfera_members: T('module:atmosfera'),
  team_members: T(null),
  team_roles: T(null),
  team_member_roles: T(null),

  // ── Kids ────────────────────────────────────────────────────────────────
  kids_groups: T('module:kids'),
  kids_students: T('module:kids'),
  kids_teachers: T('module:kids'),
  kids_events: T('module:kids'),
  checkin_locations: T('module:kids'),
  checkin_sessions: T('module:kids'),
  checkins: T('module:kids'),

  // ── Grupy domowe ────────────────────────────────────────────────────────
  home_groups: T('module:homegroups', {
    relationships: {
      home_group_leaders: { table: 'home_group_leaders', column: 'home_group_id', type: 'many' },
      home_group_members: { table: 'home_group_members', column: 'group_id', type: 'many' },
    },
  }),
  home_group_leaders: T('module:homegroups'),
  home_group_members: T('module:homegroups', {
    relationships: { home_groups: { table: 'home_groups', column: 'group_id', type: 'one' } },
  }),
  homegroups_events: T('module:homegroups'),

  // ── Finanse ─────────────────────────────────────────────────────────────
  finance_transactions: T('module:finance'),
  finance_balances: T('module:finance'),
  expenses: T('module:finance'),
  expense_categories: T('module:finance'),

  // ── Nauczanie / modlitwa / młodzieżówka ────────────────────────────────
  teachings: T('module:teaching'),
  teaching_speakers: T('module:teaching'),
  prayer_requests: T('module:prayer'),
  wall_posts: T('module:prayer'),
  mlodziezowka_events: T('module:mlodziezowka'),
  mlodziezowka_members: T('module:mlodziezowka'),
  mlodziezowka_tasks: T('module:mlodziezowka'),
  custom_mc_members: T('module:mlodziezowka'),

  // ── Komunikator ─────────────────────────────────────────────────────────
  conversations: T('module:komunikator'),
  conversation_participants: T('module:komunikator', {
    relationships: { users: { table: 'app_users', column: 'user_id', type: 'one' } },
  }),
  messages: T('module:komunikator'),

  // ── Mail (klient pocztowy) ──────────────────────────────────────────────
  mail_accounts: T('module:mail', {
    hiddenColumns: ['smtp_password_encrypted', 'imap_password_encrypted'],
    writeRoles: ADMIN_ROLES,
  }),
  mail_messages: T('module:mail', {
    relationships: {
      attachments: { table: 'mail_attachments', column: 'message_id', type: 'many' },
      labels: { table: 'mail_message_labels', column: 'message_id', type: 'many' },
    },
  }),
  mail_attachments: T('module:mail'),
  mail_labels: T('module:mail'),
  mail_message_labels: T('module:mail', {
    relationships: { label: { table: 'mail_labels', column: 'label_id', type: 'one' } },
  }),
  mail_campaigns: T('module:mailing'),
  mail_templates: T('module:mailing'),

  // ── Formularze ──────────────────────────────────────────────────────────
  forms: T('module:forms'),
  form_submissions: T('module:forms', {
    relationships: { forms: { table: 'forms', column: 'form_id', type: 'one' } },
  }),

  // ── Kampanie push / SMS ─────────────────────────────────────────────────
  push_campaigns: T('module:push_campaigns'),
  push_campaign_recipients: T('module:push_campaigns'),
  push_campaign_events: T('module:push_campaigns'),
  sms_campaigns: T('module:sms_campaigns'),
  sms_campaign_recipients: T('module:sms_campaigns'),
  sms_incoming: T('module:sms_campaigns'),

  // ── 2FA log ─────────────────────────────────────────────────────────────
  totp_auth_logs: T(null, { writeRoles: [] }), // tylko serwer pisze
};

// Tabele dynamiczne CustomModule: custom_<key>_(events|tasks|members|wall|dane)
// — tworzone w locie; dopuszczamy po wzorcu nazwy.
const CUSTOM_TABLE_RE = /^custom_[a-z0-9_]+$/;

export function getTableRule(table) {
  if (REGISTRY[table]) return REGISTRY[table];
  if (CUSTOM_TABLE_RE.test(table)) return { resource: null, custom: true };
  return null;
}

// Cache app_permissions per tenant (60 s) — jak PermissionsContext, ale na serwerze.
const permsCache = new Map(); // dbName -> { rows, fetchedAt }

export async function loadPermissions(pool, dbName) {
  const cached = permsCache.get(dbName);
  if (cached && Date.now() - cached.fetchedAt < 60_000) return cached.rows;
  let rows = [];
  try {
    ({ rows } = await pool.query(`SELECT role, resource, can_read, can_write FROM app_permissions`));
  } catch {
    rows = []; // brak tabeli => brak dodatkowych ograniczeń poza rejestrem
  }
  permsCache.set(dbName, { rows, fetchedAt: Date.now() });
  return rows;
}

export function invalidatePermissions(dbName) {
  permsCache.delete(dbName);
}

// Czy user (rola) może wykonać op na tabeli? op: 'read' | 'write'
export async function canAccess({ pool, dbName, table, op, user }) {
  const rule = getTableRule(table);
  if (!rule) return { ok: false, reason: `Tabela '${table}' nie jest dostępna przez API` };
  if (ADMIN_ROLES.includes(user.role) || user.is_super_admin) return { ok: true, rule };

  if (op === 'write') {
    if (rule.writeRoles && !rule.writeRoles.includes(user.role)) {
      return { ok: false, reason: 'Brak uprawnień do zapisu' };
    }
  }
  if (op === 'read' && rule.readRoles && !rule.readRoles.includes(user.role)) {
    return { ok: false, reason: 'Brak uprawnień do odczytu' };
  }

  if (rule.resource) {
    const perms = await loadPermissions(pool, dbName);
    const perm = perms.find((p) => p.role === user.role && p.resource === rule.resource);
    // Brak wpisu w macierzy => brak dostępu do modułu (zgodnie z hasModuleAccess).
    const allowed = op === 'read' ? perm?.can_read : perm?.can_write;
    if (!allowed) return { ok: false, reason: `Brak dostępu do ${rule.resource}` };
  }
  return { ok: true, rule };
}
