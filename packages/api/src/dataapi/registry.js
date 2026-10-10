// Rejestr tabel Data API — serwerowa warstwa autoryzacji (zastępuje RLS).
//
// Zasady:
//  - Tabela spoza rejestru => brak dostępu (fail-closed).
//  - `resource` wiąże tabelę z macierzą uprawnień app_permissions (can_read/can_write
//    per rola) — tak jak dotąd w UI (ProtectedRoute/Sidebar), ale egzekwowane na serwerze.
//  - `resource: null` => tabela dostępna dla każdego zalogowanego (dane wspólne).
//  - `writeRoles` => nadpisuje can_write (tylko wymienione role mogą pisać).
//  - `readOnly` => zapis przez /api/db zablokowany dla WSZYSTKICH (także admina) — np. stare
//    tabele zadań po przeniesieniu na Tablice; serwer (fn/*, worker) pisze bezpośrednio SQL-em.
//  - `hiddenColumns` => nigdy nie wychodzą w SELECT i nie wolno ich ustawiać/filtrów.
//  - `relationships` => dozwolone embedy (zagnieżdżone selecty) — patrz querybuilder.
//
// Role (app_users.role): superadmin, rada_starszych, koordynator, lider, czlonek.
// superadmin i rada_starszych mają pełny dostęp (jak w ProtectedRoute).

import { can, makeResolver } from '@avenit/shared/src/permissions/resolve.js';
import { SETTINGS_WRITE_CAPABILITY, crudCapabilities } from '@avenit/shared/src/permissions/catalog.js';
import { ministryGrants } from '@avenit/shared/src/permissions/ministry.js';
import { isModuleScopedTable, allowedModules } from '@avenit/shared/src/permissions/moduleScope.js';

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
    selfUpdateColumns: ['full_name', 'name', 'avatar_url', 'phone', 'onboarding'], // bez totp_required: wymóg 2FA ustawia tylko administrator (admin-update-user)
  }),
  app_settings: T(null),
  app_dictionaries: T(null), // słowniki (statusy, kategorie) — zarządzane w Ustawieniach
  app_permissions: T(null), // legacy (zastąpione przez permission_grants)
  app_roles: T(null),
  permission_grants: T(null),
  // Przynależność do służb (osoba×służba×kampus×rola). Odczyt otwarty (kto jest w jakiej
  // służbie); zapis bramkowany manage_users (SETTINGS_WRITE_CAPABILITY) w canAccess.
  ministry_memberships: T(null),
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
  // Integracje (klucze API itp.) = tylko realny admin (is_admin/superadmin). Wcześniej też
  // rada_starszych (przez ADMIN_ROLES); zgodnie z „Starszy Zboru bez ustawień technicznych"
  // zawężamy do superadmina. Celowo NIE ruszamy współdzielonej stałej ADMIN_ROLES (używa jej
  // też zapis kazań/fallback) — zmiana punktowa tylko tutaj.
  integration_settings: T('module:settings', {
    readRoles: ['superadmin'],
    writeRoles: ['superadmin'],
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
  // Zunifikowane wydarzenia modułów służb (team_type). Widoczne w kalendarzu dla
  // wszystkich (jak events), zapis przez EventsTab modułu; scoping po team_type w kliencie.
  module_events: T(null),
  // Zapisy (RSVP) — każdy zalogowany może zapisać/wypisać siebie (jak notifications/user_presence).
  event_registrations: T(null),
  // Zaproszenia RSVP (kampanie + pozycje) — rodzina RSVP, dostęp jak event_registrations
  // (otwarte dla zalogowanych; UI gejtuje tworzenie/wysyłkę). Potrzebne m.in. sekcji
  // „Zaproszenia" na stronie wydarzenia oraz modułowi Rsvp.
  rsvp_campaigns: T(null),
  // Moduły „growth suite” (migracja 006) — wcześniej poza REGISTRY = 403 dla wszystkich.
  donations: T('module:giving'),
  giving_recurring: T('module:giving'),
  giving_campaigns: T('module:giving'),
  giving_funds: T('module:giving'),
  giving_pledges: T('module:giving'),
  attendance_sessions: T('module:attendance'),
  attendance_records: T('module:attendance'),
  resources: T('module:rooms'),
  resource_bookings: T('module:rooms'),
  volunteer_blockouts: T('module:serve'),
  song_usage: T('module:analytics'), // raport CCLI — w Analityce (2026-10)
  automation_workflows: T('module:automation'),
  automation_steps: T('module:automation'),
  automation_runs: T('module:automation'),
  rsvp_invitations: T(null),
  // Stare zadania Kalendarza — przeniesione na Tablicę „Zadania” (source_kind 'tasks'); tylko odczyt.
  tasks: T('module:calendar', { readOnly: true }),
  user_task_comments: T(null),

  // ── Członkowie ──────────────────────────────────────────────────────────
  members: T('module:members'),
  attendance: T('module:members'),
  // Relacje dla check-inu Dzieci (web: households.select('*, parent_contacts(*), kids_students(*)')).
  // Bez nich zapytanie dostawało 400 „Nieznana relacja” — wyszukiwanie rodziny po telefonie nie działało.
  households: T('module:members', {
    relationships: {
      parent_contacts: { table: 'parent_contacts', column: 'household_id', type: 'many' },
      kids_students: { table: 'kids_students', column: 'household_id', type: 'many' },
      members: { table: 'members', column: 'household_id', type: 'many' },
    },
  }),
  parent_contacts: T('module:members'),
  groups: T('module:members'),
  group_members: T('module:members'),
  // Opieka/CRM scalona z Członkami — dane per-członek (notatki, opieka duszpasterska,
  // kamienie milowe, tagi, pola własne). Wcześniej NIEzarejestrowane → 403 (fail-closed).
  member_notes: T('module:members'),
  member_care_log: T('module:members'),
  member_milestones: T('module:members'),
  member_tags: T('module:members'),
  member_custom_fields: T('module:members'),
  // Definicje pól własnych wydarzeń (kalendarz, per module_key). Odczyt otwarty (potrzebny
  // do renderu pól przy wydarzeniach w każdym module); zapis tylko admin (edytor „Pola"
  // bramkowany module:settings po stronie UI).
  event_custom_fields: T(null, { writeRoles: ADMIN_ROLES }),
  member_custom_values: T('module:members'),

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
  // Zapisane składy grafiku (szablony per zespół, migracja 090). Odczyt jak team_roles;
  // zapis tylko z dostępem do modułu zespołu (sharedWrites.js).
  schedule_templates: T(null),

  // ── Kids ────────────────────────────────────────────────────────────────
  kids_groups: T('module:kids'),
  kids_students: T('module:kids'),
  kids_teachers: T('module:kids'),
  kids_events: T('module:kids'),
  checkin_locations: T('module:kids'),
  checkin_sessions: T('module:kids'),
  // web: checkins.select('*, kids_students(*), checkin_locations(*), households(*)') — to-one po FK.
  checkins: T('module:kids', {
    relationships: {
      kids_students: { table: 'kids_students', column: 'student_id', type: 'one' },
      checkin_locations: { table: 'checkin_locations', column: 'location_id', type: 'one' },
      households: { table: 'households', column: 'household_id', type: 'one' },
    },
  }),
  kids_parent_notifications: T('module:kids'),

  // ── Grupy domowe ────────────────────────────────────────────────────────
  home_groups: T('module:homegroups', {
    relationships: {
      home_group_leaders: { table: 'home_group_leaders', column: 'group_id', type: 'many' },
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
  finance_tags: T('module:finance'),
  finance_recurring: T('module:finance'),
  finance_vendors: T('module:finance'),
  finance_report_schedules: T('module:finance'),
  budget_audit: T('module:finance'),
  budget_versions: T('module:finance'),
  // Propozycje budżetu: każdy zalogowany może ZGŁOSIĆ (lider służby bez dostępu do
  // Finansów); zatwierdzanie do budżetu i tak wymaga zapisu budget_items (module:finance).
  budget_proposals: T(null),

  // ── Nauczanie / modlitwa / młodzieżówka ────────────────────────────────
  teachings: T('module:teaching'),
  teaching_speakers: T('module:teaching'),
  prayer_requests: T('module:prayer'),
  // Tablica zespołów (WallTab „Tablica" w modułach worship/media/atmosfera/homegroups/
  // kids/mlodziezowka) — wspólna tabela filtrowana po team_type w UI. To NIE ściana
  // modlitwy (to prayer_requests). Dostęp dla każdego zalogowanego członka (jak
  // prayer_interactions/user_tasks); inaczej członek zespołu bez module:prayer dostawał 403.
  wall_posts: T(null),
  mlodziezowka_events: T('module:mlodziezowka'),
  mlodziezowka_members: T('module:mlodziezowka'),
  mlodziezowka_tasks: T('module:mlodziezowka', { readOnly: true }), // zadania → Tablice
  custom_mc_members: T('module:mlodziezowka'),

  // ── Komunikator ─────────────────────────────────────────────────────────
  conversations: T('module:komunikator', {
    relationships: {
      conversation_participants: { table: 'conversation_participants', column: 'conversation_id', type: 'many' },
    },
  }),
  conversation_participants: T('module:komunikator', {
    relationships: {
      users: { table: 'app_users', column: 'user_id', type: 'one' },
      conversations: { table: 'conversations', column: 'conversation_id', type: 'one' },
    },
  }),
  messages: T('module:komunikator'),

  // ── Mail (klient pocztowy) ──────────────────────────────────────────────
  mail_accounts: T('module:mail', {
    // Sekrety skrzynek nigdy nie wychodzą przez /api/db (zapis — tak, odczyt — tylko funkcje serwera).
    hiddenColumns: ['encrypted_password', 'smtp_password', 'smtp_password_encrypted', 'imap_password_encrypted'],
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
  sms_campaigns: T('module:sms_campaigns', {
    // CAMPAIGN_SELECT w useSmsCampaigns — bez tego lista kampanii SMS zawsze 400.
    // created_by to e-mail (insert z user.email), stąd creator po app_users.email.
    relationships: {
      segments: { table: 'sms_campaign_segments', column: 'campaign_id', type: 'many' },
      ab_variants: { table: 'sms_campaign_ab_variants', column: 'campaign_id', type: 'many' },
      creator: { table: 'app_users', column: 'created_by', references: 'email', type: 'one' },
    },
  }),
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
  email_campaigns: T('module:mailing', {
    relationships: {
      template: { table: 'email_templates', column: 'template_id', type: 'one' },
      creator: { table: 'app_users', column: 'created_by', references: 'email', type: 'one' },
    },
  }),
  email_campaign_recipients: T('module:mailing'),
  email_recipient_segments: T('module:mailing'),
  email_templates: T('module:mailing', {
    relationships: { creator: { table: 'app_users', column: 'created_by', references: 'email', type: 'one' } },
  }),
  email_unsubscribes: T('module:mailing'),
  // Poczta (klient)
  mail_folders: T('module:mail'),
  // Formularze
  form_responses: T('module:forms'),
  // Grupy domowe (zadania)
  // Stare zadania modułów (i komentarze) przeniesione na Tablice — tylko odczyt (import/historia).
  home_group_tasks: T('module:homegroups', { readOnly: true }),
  home_group_task_comments: T('module:homegroups', { readOnly: true }),
  // Nauczanie / materiały
  teaching_series: T('module:teaching'),
  // Materiały/Pliki są WSPÓLNE dla wielu modułów (Pliki w finance/homegroups/media/…),
  // filtrowane w UI po team_type. Dostęp dla każdego zalogowanego (jak wall_posts) —
  // inaczej user bez module:teaching nie otworzy Plików w swoim module ani „Udostępnione mi".
  materials_files: T(null),
  materials_folders: T(null),
  materials_shares: T(null),
  event_materials: T(null),
  // Media (zadania)
  media_tasks: T('module:media', { readOnly: true }),
  media_task_comments: T('module:media', { readOnly: true }),
  // Komunikator (interakcje)
  message_reactions: T('module:komunikator'),
  message_read_receipts: T('module:komunikator'),
  pinned_messages: T('module:komunikator', {
    relationships: { messages: { table: 'messages', column: 'message_id', type: 'one' } },
  }),
  typing_status: T('module:komunikator'),
  // Ankiety i prośby o modlitwę w czacie (migracja 064). Dostęp jak reszta czatu
  // (module:komunikator + res:* grant); członek dostaje granty w migracji 065.
  poll_votes: T('module:komunikator'),
  prayer_responses: T('module:komunikator'),
  // Komunikator+ (migracja 088). Zgłoszenia wiadomości: dodaje uczestnik rozmowy (zgłaszający
  // widzi własne), czyta i rozstrzyga moderator — admin aplikacji albo action:komunikator:moderate
  // (zakres i walidacja: komunikatorPlus.js, wołane z routes.js).
  message_reports: T(null),
  // Zablokowane osoby — tabela osobista (ownership.js, właściciel blocker_email).
  user_blocks: T(null),
  // Połączenia audio/wideo (migracja 096): odczyt tylko w rozmowach, w których jestem
  // (komunikator.js — CONV_TABLES; jak message_reports bez osobnego zasobu w macierzy uprawnień),
  // zapis wyłącznie serwer (fn call-* z module:komunikator, webhook LiveKit, worker).
  calls: T(null, {
    readOnly: true,
    relationships: {
      call_participants: { table: 'call_participants', column: 'call_id', type: 'many' },
    },
  }),
  call_participants: T(null, { readOnly: true }),
  // Goście z linku (migracja 097): poczekalnia czytana przez uczestników rozmowy (jak calls),
  // zapis tylko serwer (src/calls/guests.js). call_guest_links celowo POZA rejestrem (token = sekret).
  call_guest_requests: T(null, { readOnly: true, hiddenColumns: ['secret_hash'] }),
  // Spotkania online (migracja 098): odczyt uczestników rozmowy spotkania (komunikator.js — CONV_TABLES),
  // zapis tylko fn meeting-*. meeting_invites celowo POZA rejestrem (e-maile gości — fn meeting-get).
  meetings: T(null, { readOnly: true }),
  // link_previews / message_translations — celowo POZA rejestrem: tylko przez fn
  // (link-preview, translate-message), bez odczytu/zapisu przez /api/db.
  // Młodzieżówka
  mlodziezowka_leaders: T('module:mlodziezowka'),
  mlodziezowka_task_comments: T('module:mlodziezowka', { readOnly: true }),
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
// Zadania modułów własnych żyją na Tablicach (import board-import-legacy) — stare tabele tylko do odczytu.
const CUSTOM_READ_ONLY_SUFFIXES = new Set(['tasks', 'task_comments']);

function customModuleParts(table) {
  const body = table.slice('custom_'.length); // <moduleKey>_<suffix>
  for (const suf of CUSTOM_TABLE_SUFFIXES) {
    if (body.endsWith('_' + suf)) {
      const key = body.slice(0, -(suf.length + 1));
      if (key) return { key, suffix: suf };
    }
  }
  return null; // nieznany kształt — traktuj jak dane wspólne (resource:null)
}

export function getTableRule(table) {
  if (REGISTRY[table]) return REGISTRY[table];
  if (CUSTOM_TABLE_RE.test(table)) {
    const parts = customModuleParts(table);
    if (!parts) return { resource: null, custom: true };
    return {
      resource: `module:${parts.key}`,
      custom: true,
      ...(CUSTOM_READ_ONLY_SUFFIXES.has(parts.suffix) ? { readOnly: true } : {}),
    };
  }
  return null;
}

// Cache grantów per tenant (60 s). Zawiera granty permission_grants + role admina.
// grants === null => nowy model niedostępny (przed migracją) → fallback legacy.
const grantsCache = new Map(); // dbName -> { grants, adminRoles, legacy, moduleKeys, at }

export async function loadGrants(pool, dbName) {
  const cached = grantsCache.get(dbName);
  if (cached && Date.now() - cached.at < 60_000) return cached;
  let grants = null, adminRoles = new Set(ADMIN_ROLES), legacy = [], moduleKeys = [];
  // Klucze modułów (także własnych z kreatora) — kandydaci do uprawnień „w zakresie służby”
  // (moduleScope.js). Błąd/brak tabeli → tylko służby wbudowane.
  try {
    const m = await pool.query(`SELECT key FROM app_modules`);
    moduleKeys = m.rows.map((r) => r.key).filter(Boolean);
  } catch { moduleKeys = []; }
  try {
    const g = await pool.query(`SELECT role, user_id, capability, allowed FROM permission_grants`);
    grants = g.rows;
    const r = await pool.query(`SELECT key FROM app_roles WHERE is_admin = true`);
    adminRoles = new Set(r.rows.map((x) => x.key));
    // Granty z PRZYNALEŻNOŚCI DO SŁUŻB (ministry_memberships) — dokładane per-osoba,
    // ADDYTYWNIE (tylko allowed:true). Osobny try: brak tabeli (przed migracją 025) lub błąd
    // → po prostu bez tych grantów; NIE przełącza w tryb legacy. Kampus tu pomijamy (Faza 4).
    try {
      const mm = await pool.query(`SELECT user_id, ministry_key, role FROM ministry_memberships`);
      const byUser = new Map();
      for (const row of mm.rows) {
        if (!row.user_id) continue;
        if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
        byUser.get(row.user_id).push(row);
      }
      for (const [userId, mems] of byUser) {
        for (const g of ministryGrants(mems)) {
          grants.push({ role: null, user_id: userId, capability: g.capability, allowed: g.allowed });
        }
      }
    } catch { /* brak tabeli/błąd → bez grantów przynależności */ }
  } catch {
    // Brak nowych tabel (np. przed migracją) — fallback do starego app_permissions.
    grants = null;
    try {
      ({ rows: legacy } = await pool.query(`SELECT role, resource, can_read, can_write FROM app_permissions`));
    } catch { legacy = []; }
  }
  const entry = { grants, adminRoles, legacy, moduleKeys, at: Date.now() };
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

// upsert = zapis (insert albo update). Wcześniej brakowało go tu, więc upsert przechodził jak
// odczyt: bez strażników zapisu tabel app_* (manage_*) i bez writeRoles — każdy zalogowany mógł
// przez /api/db upsertem zmienić ustawienia, konta czy granty uprawnień.
const OP_IS_WRITE = { insert: true, update: true, delete: true, upsert: true, select: false };

// Autoryzacja op na tabeli. op: 'select' | 'insert' | 'update' | 'delete' | 'upsert'.
// Zwraca { ok, rule, reason, resolver } — resolver do filtrowania pól (lub null w legacy).
//
// ignoreDuplicates (upsert ON CONFLICT DO NOTHING): niczego nie nadpisuje — wystarcza prawo create.
// Zwykły upsert (DO UPDATE) wymaga create ORAZ update (crudCapabilities).
//
// allowModuleScope (tylko /api/db, które umie zawęzić wiersze): dla wspólnych tabel służb
// (events, schedule_assignments, board_*) brak prawa GLOBALNEGO nie kończy sprawy — gdy osoba
// ma prawo „w zakresie służby” (np. lider Mediów: module:media + res:media_events:create), wynik
// to { ok: true, moduleScope: { modules } } i wołający MUSI zawęzić wiersze do tych modułów
// (moduleScope.js). Bez flagi (realtime, fn/*) — jak dotąd: tylko prawo globalne.
export async function canAccess({ pool, dbName, table, op, user, allowModuleScope = false, ignoreDuplicates = false }) {
  const rule = getTableRule(table);
  if (!rule) return { ok: false, reason: `Tabela '${table}' nie jest dostępna przez API` };
  const isWrite = !!OP_IS_WRITE[op];
  // Tabela tylko do odczytu — odmowa zapisu przed bypassem admina (dane historyczne).
  if (isWrite && rule.readOnly) return { ok: false, reason: `Tabela '${table}' jest tylko do odczytu` };
  const { grants, adminRoles, legacy, moduleKeys } = await loadGrants(pool, dbName);

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
    // Kaskada moduł → dane: dostęp do MODUŁU (module:<key>) jest warunkiem wstępnym dla jego
    // danych. Bez tego rola z szerokim res:* (np. rada_starszych z grantem '*') czytałaby dane
    // modułu mimo odebrania module:X w macierzy. Standardowe role mają module:X (preset/wildcard),
    // więc nic nie tracą — działa dopiero jawny deny (o to chodzi).
    // Zasób modułu → CRUD per zasób (res:<table>:<op>).
    const caps = crudCapabilities(table, op, { ignoreDuplicates });
    const moduleOk = resolver.can(rule.resource);
    const missing = caps.find((c) => !resolver.can(c));
    if (!moduleOk || missing) {
      // Ścieżka „w zakresie służby” (moduleScope.js): bramka modułu to wtedy module:<służba>.
      if (allowModuleScope && isModuleScopedTable(table)) {
        const modules = allowedModules(resolver.can, table, op, moduleKeys || []);
        if (modules.length) return { ok: true, rule, resolver, moduleScope: { modules } };
      }
      return { ok: false, reason: !moduleOk ? `Brak dostępu do modułu ${rule.resource}` : `Brak uprawnienia ${missing}` };
    }
  } else if (isWrite && SETTINGS_WRITE_CAPABILITY[table]) {
    // Tabele app_* — zapis przez akcję manage_* (odczyt otwarty).
    if (!resolver.can(SETTINGS_WRITE_CAPABILITY[table])) {
      return { ok: false, reason: `Brak uprawnienia ${SETTINGS_WRITE_CAPABILITY[table]}` };
    }
  }
  // resource:null bez mapy (dane wspólne/per-user) → dozwolone (po floorach powyżej).
  return { ok: true, rule, resolver };
}
