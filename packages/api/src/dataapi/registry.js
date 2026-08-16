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

import { can, makeResolver } from '@avenit/shared/src/permissions/resolve.js';
import { SETTINGS_WRITE_CAPABILITY, crudCapability } from '@avenit/shared/src/permissions/catalog.js';

export const ADMIN_ROLES = ['superadmin', 'rada_starszych'];

// Relacja: { table, column, type: 'one' | 'many' }
//  one:  bieżąca tabela ma FK `column` -> table(id)
//  many: `table` ma FK `column` -> bieżąca(id)
const T = (resource, extra = {}) => ({ resource, ...extra });

export const REGISTRY = {
  // ── Rdzeń / konfiguracja ────────────────────────────────────────────────
  // Tabele app_* / campuses: odczyt otwarty (config + własne uprawnienia potrzebne
  // wszystkim). Zapis bramkowany akcją manage_* (SETTINGS_WRITE_CAPABILITY) w canAccess.
  app_users: T(null, {
    hiddenColumns: ['password_hash', 'totp_secret', 'totp_backup_codes'],
    // Własny profil może edytować każdy — obsłużone w routes (self-update whitelist).
    selfUpdateColumns: ['full_name', 'name', 'avatar_url', 'phone', 'totp_required', 'onboarding'],
  }),
  app_settings: T(null),
  app_dictionaries: T(null), // słowniki (statusy, kategorie) — zarządzane w Ustawieniach
  app_permissions: T(null), // legacy (zastąpione przez permission_grants)
  app_roles: T(null),
  permission_grants: T(null),
  app_modules: T(null),
  app_module_tabs: T(null),
  // Rekordy własnych kolekcji kreatora. Dostęp egzekwowany PER MODUŁ (module_key)
  // w routes.js (moduleScoped) — nie da się zmapować na jeden resource, bo tabela
  // obsługuje wiele modułów. Tu tylko rejestracja (żeby nie było fail-closed).
  module_records: T(null, { moduleScoped: true }),
  campuses: T(null),
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
  // Zapisy (RSVP) — każdy zalogowany może zapisać/wypisać siebie (jak notifications/user_presence).
  event_registrations: T(null),
  tasks: T('module:calendar'),
  user_task_comments: T(null),

  // ── Członkowie ──────────────────────────────────────────────────────────
  members: T('module:members'),
  attendance: T('module:members'),
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
    relationships: {
      users: { table: 'app_users', column: 'user_id', type: 'one' },
      conversations: { table: 'conversations', column: 'conversation_id', type: 'one' },
    },
  }),
  messages: T('module:komunikator'),

  // ── Mail (klient pocztowy) ──────────────────────────────────────────────
  mail_accounts: T('module:mail', {
    hiddenColumns: ['smtp_password_encrypted', 'imap_password_encrypted'],
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
  push_campaigns: T('module:push_campaigns', {
    // Embedy zagnieżdżonego selectu (CAMPAIGN_SELECT w usePushCampaigns) — bez tego
    // resolveRelationship rzuca 400 i cała lista/edytor kampanii jest pusty.
    // Tabele-dzieci zarejestrowane niżej. (NIE embedujemy creator — created_by to
    // e-mail, a embed to-one joinuje po id.)
    relationships: {
      segments: { table: 'push_campaign_segments', column: 'campaign_id', type: 'many' },
      actions: { table: 'push_campaign_actions', column: 'campaign_id', type: 'many' },
      ab_variants: { table: 'push_campaign_ab_variants', column: 'campaign_id', type: 'many' },
    },
  }),
  push_campaign_recipients: T('module:push_campaigns'),
  push_campaign_events: T('module:push_campaigns'),
  sms_campaigns: T('module:sms_campaigns'),
  sms_campaign_recipients: T('module:sms_campaigns'),
  sms_incoming: T('module:sms_campaigns'),

  // ── Dorejestrowane tabele modułów ──────────────────────────────────────
  // (funkcje dodane po pierwszym rejestrze; wcześniej zwracały 403 na /api/db)
  // Programy
  program_templates: T('module:programs'),
  program_song_suggestions: T('module:programs'),
  // Finanse
  budget_items: T('module:finance'),
  income_transactions: T('module:finance'),
  expense_transactions: T('module:finance'),
  // Mailing (kampanie e-mail)
  email_campaigns: T('module:mailing'),
  email_campaign_recipients: T('module:mailing'),
  email_recipient_segments: T('module:mailing'),
  email_templates: T('module:mailing'),
  email_unsubscribes: T('module:mailing'),
  // Poczta (klient)
  mail_folders: T('module:mail'),
  // Formularze
  form_responses: T('module:forms'),
  // Grupy domowe (zadania)
  home_group_tasks: T('module:homegroups'),
  home_group_task_comments: T('module:homegroups'),
  // Nauczanie / materiały
  teaching_series: T('module:teaching'),
  materials_files: T('module:teaching'),
  materials_folders: T('module:teaching'),
  // Media (zadania)
  media_tasks: T('module:media'),
  media_task_comments: T('module:media'),
  // Komunikator (interakcje)
  message_reactions: T('module:komunikator'),
  message_read_receipts: T('module:komunikator'),
  pinned_messages: T('module:komunikator'),
  typing_status: T('module:komunikator'),
  // Młodzieżówka
  mlodziezowka_leaders: T('module:mlodziezowka'),
  mlodziezowka_task_comments: T('module:mlodziezowka'),
  // Modlitwa
  // Interakcja „Modlę się" = użytkownik sam włącza/wyłącza swój udział przy danej
  // prośbie — dokładnie wzorzec event_registrations (RSVP): każdy zalogowany
  // zapisuje/wypisuje SIEBIE. resource:null, bo żadna rola nie miała grantu
  // res:prayer_interactions:* (tabelę dorejestrowano po seedzie 005 → toggle
  // działał tylko adminom). Treść modlitw (prayer_requests) pozostaje pod module:prayer.
  prayer_interactions: T(null),
  // Widok modlitw z licznikami (features/prayers/api.ts czyta go zamiast tabeli).
  // Read-only projekcja prayer_requests → dostęp dla każdego zalogowanego (dane
  // wspólne wspólnoty, jak prayer_requests dla członka), zapis zablokowany (widok).
  prayer_requests_with_counts: T(null, { writeRoles: [] }),
  // Kazania (moduł „Dla Ciebie" — member-facing). Odczyt dla każdego zalogowanego
  // członka (publikowane treści), zapis tylko admin (zarządzanie w webie).
  sermons: T(null, { writeRoles: ADMIN_ROLES }),
  // Kampanie push
  push_campaign_ab_variants: T('module:push_campaigns'),
  push_campaign_actions: T('module:push_campaigns'),
  push_campaign_segments: T('module:push_campaigns'),
  push_campaign_templates: T('module:push_campaigns'),
  // Kampanie SMS
  sms_campaign_ab_variants: T('module:sms_campaigns'),
  sms_campaign_segments: T('module:sms_campaigns'),
  sms_campaign_templates: T('module:sms_campaigns'),
  sms_inline_responses: T('module:sms_campaigns'),
  // Per-użytkownik / wspólne (dostęp dla każdego zalogowanego — własne dane)
  user_tasks: T(null),
  user_absences: T(null),
  user_dashboard_layouts: T(null),
  push_user_preferences: T(null),
  sms_user_preferences: T(null),

  // ── Projekty / Tablice (Work OS) ────────────────────────────────────────
  // Wszystkie tabele board_* bramkowane res:<tabela>:<op> przez module:boards.
  // Kolejność musi się zgadzać z katalogiem (permissions.test — spójność registry↔catalog).
  boards: T('module:boards'),
  board_groups: T('module:boards'),
  board_columns: T('module:boards'),
  board_items: T('module:boards'),
  board_item_updates: T('module:boards'),
  board_item_activity: T('module:boards'),
  board_views: T('module:boards'),
  board_automations: T('module:boards'),
  board_automation_runs: T('module:boards'),
  board_dashboards: T('module:boards'),

  // ── 2FA log ─────────────────────────────────────────────────────────────
  totp_auth_logs: T(null, { writeRoles: [] }), // tylko serwer pisze
};

// Tabele dynamiczne CustomModule: custom_<moduleKey>_(members|tasks|task_comments|wall)
// — tworzone w locie przez initialize_custom_module. PARYTET DANYCH: mapujemy tabelę
// na moduł, do którego należy (module:<moduleKey>), aby CRUD był egzekwowany capability
// (res:<table>:<op>) tak jak w modułach systemowych. Jawne wpisy w REGISTRY
// (np. custom_mc_members → module:mlodziezowka) mają pierwszeństwo.
const CUSTOM_TABLE_RE = /^custom_[a-z0-9_]+$/;
// Sufiksy tabel danych modułów własnych. 'task_comments' PRZED 'tasks' (dłuższy pierwszy).
// 'events' obsługuje custom_<key>_events (EventsTab), 'dane' — starsza konwencja.
const CUSTOM_TABLE_SUFFIXES = ['task_comments', 'members', 'tasks', 'wall', 'events', 'dane'];

function customModuleKey(table) {
  const body = table.slice('custom_'.length); // <moduleKey>_<suffix>
  for (const suf of CUSTOM_TABLE_SUFFIXES) {
    if (body.endsWith('_' + suf)) {
      const key = body.slice(0, -(suf.length + 1));
      if (key) return key;
    }
  }
  return null; // nieznany kształt — traktuj jak dane wspólne (resource:null)
}

export function getTableRule(table) {
  if (REGISTRY[table]) return REGISTRY[table];
  if (CUSTOM_TABLE_RE.test(table)) {
    const key = customModuleKey(table);
    return key ? { resource: `module:${key}`, custom: true } : { resource: null, custom: true };
  }
  return null;
}

// Cache grantów per tenant (60 s). Zawiera granty permission_grants + role admina.
// grants === null => nowy model niedostępny (przed migracją) → fallback legacy.
const grantsCache = new Map(); // dbName -> { grants, adminRoles, legacy, at }

export async function loadGrants(pool, dbName) {
  const cached = grantsCache.get(dbName);
  if (cached && Date.now() - cached.at < 60_000) return cached;
  let grants = null, adminRoles = new Set(ADMIN_ROLES), legacy = [];
  try {
    const g = await pool.query(`SELECT role, user_id, capability, allowed FROM permission_grants`);
    grants = g.rows;
    const r = await pool.query(`SELECT key FROM app_roles WHERE is_admin = true`);
    adminRoles = new Set(r.rows.map((x) => x.key));
  } catch {
    // Brak nowych tabel (np. przed migracją) — fallback do starego app_permissions.
    grants = null;
    try {
      ({ rows: legacy } = await pool.query(`SELECT role, resource, can_read, can_write FROM app_permissions`));
    } catch { legacy = []; }
  }
  const entry = { grants, adminRoles, legacy, at: Date.now() };
  grantsCache.set(dbName, entry);
  return entry;
}

export function invalidatePermissions(dbName) {
  grantsCache.delete(dbName);
}

// preHandler Fastify egzekwujący capability akcji (np. dla /api/fn/*). Zakłada
// kontekst po requireUser (req.user, req.tenant, req.db). superadmin/role admina
// i tryb legacy (przed migracją) przechodzą.
export function requireCapability(capability) {
  return async (req, reply) => {
    if (!req.user || !req.tenant || !req.db) return; // brak kontekstu użytkownika
    let isSuper = false;
    try {
      const { rows } = await req.db.query(`SELECT is_super_admin FROM app_users WHERE id = $1`, [req.user.id]);
      isSuper = rows[0]?.is_super_admin;
    } catch { /* ignore */ }
    const { grants, adminRoles } = await loadGrants(req.db, req.tenant.db_name);
    if (isSuper || adminRoles.has(req.user.role)) return;
    if (grants === null) return; // legacy — nie egzekwuj akcji (zgodność wsteczna)
    if (!can(grants, { role: req.user.role, userId: req.user.id }, capability)) {
      return reply.code(403).send({ error: `Brak uprawnienia: ${capability}` });
    }
  };
}

const OP_IS_WRITE = { insert: true, update: true, delete: true, select: false };

// Autoryzacja op na tabeli. op: 'select' | 'insert' | 'update' | 'delete'.
// Zwraca { ok, rule, reason, resolver } — resolver do filtrowania pól (lub null w legacy).
export async function canAccess({ pool, dbName, table, op, user }) {
  const rule = getTableRule(table);
  if (!rule) return { ok: false, reason: `Tabela '${table}' nie jest dostępna przez API` };
  const isWrite = !!OP_IS_WRITE[op];
  const { grants, adminRoles, legacy } = await loadGrants(pool, dbName);

  const isAdmin = user.is_super_admin || adminRoles.has(user.role);
  if (isAdmin) return { ok: true, rule, resolver: makeResolver([], { isAdmin: true }) };

  // Twarde floory z registry (sekrety / tylko serwer) — obowiązują niezależnie od grantów.
  if (isWrite && rule.writeRoles && !rule.writeRoles.includes(user.role)) {
    return { ok: false, reason: 'Brak uprawnień do zapisu' };
  }
  if (!isWrite && rule.readRoles && !rule.readRoles.includes(user.role)) {
    return { ok: false, reason: 'Brak uprawnień do odczytu' };
  }

  // ── Model legacy (przed migracją): stare app_permissions read/write per resource ──
  if (grants === null) {
    if (rule.resource) {
      const perm = legacy.find((p) => p.role === user.role && p.resource === rule.resource);
      const allowed = isWrite ? perm?.can_write : perm?.can_read;
      if (!allowed) return { ok: false, reason: `Brak dostępu do ${rule.resource}` };
    }
    return { ok: true, rule, resolver: null };
  }

  // ── Model capability ──
  const subject = { role: user.role, userId: user.id, isAdmin: false };
  const resolver = makeResolver(grants, subject);

  if (rule.resource && rule.resource.startsWith('module:')) {
    // Zasób modułu → CRUD per zasób (res:<table>:<op>).
    const cap = crudCapability(table, op);
    if (!resolver.can(cap)) return { ok: false, reason: `Brak uprawnienia ${cap}` };
  } else if (isWrite && SETTINGS_WRITE_CAPABILITY[table]) {
    // Tabele app_* — zapis przez akcję manage_* (odczyt otwarty).
    if (!resolver.can(SETTINGS_WRITE_CAPABILITY[table])) {
      return { ok: false, reason: `Brak uprawnienia ${SETTINGS_WRITE_CAPABILITY[table]}` };
    }
  }
  // resource:null bez mapy (dane wspólne/per-user) → dozwolone (po floorach powyżej).
  return { ok: true, rule, resolver };
}
