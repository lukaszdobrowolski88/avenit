// Katalog capability — jedno źródło prawdy dla web + api + admin.
//
// Klucz capability:
//   module:<mod>                       — dostęp do modułu
//   tab:<mod>:<tab>                    — dostęp do zakładki
//   res:<resource>:read|create|update|delete  — CRUD per zasób danych
//   action:<mod>:<action>             — akcja domenowa (publikuj, wyślij, eksport…)
//   field:<resource>:<col>:read|write — poziom pola (kolumny wrażliwe)
//
// Zasoby (resource) i ich przypisanie do modułów są zsynchronizowane z
// packages/api/src/dataapi/registry.js (test spójności w packages/api/test).
// Etykiety są po polsku (UI owija je w tr()).

export const CRUD_OPS = ['read', 'create', 'update', 'delete'];
export const CRUD_LABELS = { read: 'Odczyt', create: 'Tworzenie', update: 'Edycja', delete: 'Usuwanie' };

// Przyjazne nazwy zasobów danych (surowe klucze tabel -> etykieta w macierzy uprawnień).
// Brakujący klucz => fallback do surowej nazwy (patrz capabilityGroups).
export const RESOURCE_LABELS = {
  // Programy
  programs: 'Programy', program_types: 'Typy programów', program_songs: 'Pieśni w programie',
  schedule_assignments: 'Przypisania do służby',
  // Kalendarz
  events: 'Wydarzenia', ministry_events: 'Wydarzenia służb', tasks: 'Zadania',
  // Członkowie
  members: 'Członkowie', attendance: 'Obecność', households: 'Gospodarstwa domowe',
  parent_contacts: 'Kontakty rodziców', groups: 'Grupy', group_members: 'Członkowie grup',
  // Grupy domowe
  home_groups: 'Grupy domowe', home_group_leaders: 'Liderzy grup domowych',
  home_group_members: 'Członkowie grup domowych', homegroups_events: 'Wydarzenia grup domowych',
  // Media
  media_events: 'Wydarzenia Media', media_team: 'Zespół Media', equipment: 'Sprzęt',
  // Kids
  kids_events: 'Wydarzenia dziecięce', kids_groups: 'Grupy dziecięce', kids_students: 'Dzieci',
  kids_teachers: 'Nauczyciele dziecięcy', checkin_locations: 'Lokalizacje check-in',
  checkin_sessions: 'Sesje check-in', checkins: 'Check-iny',
  // Uwielbienie
  worship_events: 'Wydarzenia Uwielbienia', worship_team: 'Zespół Uwielbienia',
  songs: 'Pieśni', song_attachments: 'Załączniki pieśni',
  // Atmosfera
  atmosfera_events: 'Wydarzenia Atmosfera', atmosfera_members: 'Członkowie Atmosfera',
  // Finanse
  finance_transactions: 'Transakcje finansowe', finance_balances: 'Salda finansowe',
  expenses: 'Wydatki', expense_categories: 'Kategorie wydatków',
  // Nauczanie
  teachings: 'Nauczania', teaching_speakers: 'Mówcy',
  // Modlitwa
  prayer_requests: 'Prośby modlitewne',
  // Młodzieżówka
  mlodziezowka_events: 'Wydarzenia młodzieżówki', mlodziezowka_members: 'Członkowie młodzieżówki',
  mlodziezowka_tasks: 'Zadania młodzieżówki',
  // Komunikator
  conversations: 'Rozmowy', conversation_participants: 'Uczestnicy rozmów',
  messages: 'Wiadomości', wall_posts: 'Wpisy na ścianie',
  // Poczta
  mail_accounts: 'Konta pocztowe', mail_messages: 'Wiadomości e-mail', mail_attachments: 'Załączniki e-mail',
  mail_labels: 'Etykiety e-mail', mail_message_labels: 'Etykiety wiadomości', mail_templates: 'Szablony e-mail',
  mail_campaigns: 'Kampanie e-mail',
  // Formularze
  forms: 'Formularze', form_submissions: 'Zgłoszenia formularzy',
  // Push
  push_campaigns: 'Kampanie push', push_campaign_recipients: 'Odbiorcy kampanii push',
  push_campaign_events: 'Zdarzenia kampanii push',
  // SMS
  sms_campaigns: 'Kampanie SMS', sms_campaign_recipients: 'Odbiorcy kampanii SMS', sms_incoming: 'Przychodzące SMS',
  // Ustawienia / inne
  integration_settings: 'Ustawienia integracji', custom_mc_members: 'Członkowie (moduł własny)',
};

// Definicje modułów. Kolejność = kolejność w macierzy uprawnień.
export const MODULES = [
  {
    key: 'programs', label: 'Programy',
    resources: ['programs', 'program_types', 'program_songs', 'schedule_assignments'],
    tabs: [],
    actions: [
      { key: 'publish', label: 'Publikuj program' },
      { key: 'send_email', label: 'Wyślij program e-mailem' },
      { key: 'send_assignment', label: 'Wyślij zaproszenie do służby' },
      { key: 'export_pdf', label: 'Eksport PDF' },
      { key: 'export_ppt', label: 'Eksport PowerPoint' },
      { key: 'export_propresenter', label: 'Eksport ProPresenter' },
    ],
    fields: [],
  },
  {
    key: 'calendar', label: 'Kalendarz',
    resources: ['events', 'ministry_events', 'tasks'],
    tabs: [],
    actions: [
      { key: 'export_ical', label: 'Eksport iCal' },
    ],
    fields: [],
  },
  {
    key: 'members', label: 'Członkowie',
    resources: ['members', 'attendance', 'households', 'parent_contacts', 'groups', 'group_members'],
    tabs: [],
    actions: [
      { key: 'import', label: 'Import członków' },
      { key: 'export', label: 'Eksport członków' },
    ],
    fields: [
      { resource: 'members', column: 'phone', label: 'Telefon' },
      { resource: 'members', column: 'email', label: 'E-mail' },
      { resource: 'members', column: 'notes', label: 'Notatki' },
      { resource: 'members', column: 'birth_date', label: 'Data urodzenia' },
      { resource: 'members', column: 'membership_declaration_url', label: 'Deklaracja członkowska' },
    ],
  },
  {
    key: 'homegroups', label: 'Grupy domowe',
    resources: ['home_groups', 'home_group_leaders', 'home_group_members', 'homegroups_events'],
    tabs: [
      { key: 'groups', label: 'Grupy' },
      { key: 'leaders', label: 'Liderzy' },
      { key: 'members', label: 'Członkowie' },
      { key: 'finances', label: 'Finanse' },
    ],
    actions: [],
    fields: [],
  },
  {
    key: 'media', label: 'Media Team',
    resources: ['media_events', 'media_team', 'equipment'],
    tabs: [
      { key: 'schedule', label: 'Grafik' },
      { key: 'tasks', label: 'Zadania' },
      { key: 'members', label: 'Członkowie' },
      { key: 'finances', label: 'Finanse' },
    ],
    actions: [],
    fields: [],
  },
  {
    key: 'kids', label: 'Małe Avenit',
    resources: ['kids_groups', 'kids_students', 'kids_teachers', 'kids_events', 'checkin_locations', 'checkin_sessions', 'checkins'],
    tabs: [
      { key: 'schedule', label: 'Grafik' },
      { key: 'groups', label: 'Grupy' },
      { key: 'teachers', label: 'Nauczyciele' },
      { key: 'students', label: 'Uczniowie' },
      { key: 'finances', label: 'Finanse' },
    ],
    actions: [
      { key: 'checkin', label: 'Check-in (odprawa)' },
      { key: 'checkout', label: 'Check-out (odbiór)' },
    ],
    fields: [],
  },
  {
    key: 'worship', label: 'Grupa Uwielbienia',
    resources: ['songs', 'song_attachments', 'worship_events', 'worship_team'],
    tabs: [
      { key: 'schedule', label: 'Grafik' },
      { key: 'songs', label: 'Baza Pieśni' },
      { key: 'members', label: 'Członkowie' },
      { key: 'finances', label: 'Finanse' },
      { key: 'wall', label: 'Tablica' },
    ],
    actions: [],
    fields: [],
  },
  {
    key: 'atmosfera', label: 'Atmosfera Team',
    resources: ['atmosfera_events', 'atmosfera_members'],
    tabs: [
      { key: 'schedule', label: 'Grafik' },
      { key: 'members', label: 'Członkowie' },
      { key: 'finances', label: 'Finanse' },
    ],
    actions: [],
    fields: [],
  },
  {
    key: 'finance', label: 'Finanse',
    resources: ['finance_transactions', 'finance_balances', 'expenses', 'expense_categories'],
    tabs: [],
    actions: [
      { key: 'approve', label: 'Zatwierdź wydatek' },
      { key: 'export', label: 'Eksport finansów' },
    ],
    fields: [
      { resource: 'finance_transactions', column: 'amount', label: 'Kwota' },
    ],
  },
  {
    key: 'teaching', label: 'Nauczanie',
    resources: ['teachings', 'teaching_speakers'],
    tabs: [
      { key: 'wall', label: 'Tablica' },
      { key: 'schedule', label: 'Grafik' },
      { key: 'series', label: 'Serie' },
      { key: 'speakers', label: 'Mówcy' },
    ],
    actions: [],
    fields: [],
  },
  {
    key: 'prayer', label: 'Centrum Modlitwy',
    resources: ['prayer_requests', 'wall_posts'],
    tabs: [
      { key: 'wall', label: 'Ściana Modlitwy' },
      { key: 'leaders_requests', label: 'Prośby dla Liderów' },
    ],
    actions: [],
    fields: [],
  },
  {
    key: 'mlodziezowka', label: 'Młodzieżówka',
    resources: ['mlodziezowka_events', 'mlodziezowka_members', 'mlodziezowka_tasks', 'custom_mc_members'],
    tabs: [
      { key: 'events', label: 'Wydarzenia' },
      { key: 'tasks', label: 'Zadania' },
      { key: 'leaders', label: 'Liderzy' },
      { key: 'members', label: 'Członkowie' },
      { key: 'finances', label: 'Finanse' },
    ],
    actions: [],
    fields: [],
  },
  {
    key: 'komunikator', label: 'Komunikator',
    resources: ['conversations', 'conversation_participants', 'messages'],
    tabs: [
      { key: 'direct', label: 'Rozmowy prywatne' },
      { key: 'groups', label: 'Grupy' },
      { key: 'ministry', label: 'Kanały służb' },
    ],
    actions: [],
    fields: [],
  },
  {
    key: 'mail', label: 'Poczta',
    resources: ['mail_accounts', 'mail_messages', 'mail_attachments', 'mail_labels', 'mail_message_labels'],
    tabs: [],
    actions: [
      { key: 'send', label: 'Wyślij e-mail' },
      { key: 'sync', label: 'Synchronizuj pocztę' },
      { key: 'test', label: 'Test SMTP' },
    ],
    fields: [],
  },
  {
    key: 'mailing', label: 'Mailing',
    resources: ['mail_campaigns', 'mail_templates'],
    tabs: [],
    actions: [
      { key: 'send', label: 'Wyślij kampanię e-mail' },
    ],
    fields: [],
  },
  {
    key: 'forms', label: 'Formularze',
    resources: ['forms', 'form_submissions'],
    tabs: [],
    actions: [
      { key: 'export', label: 'Eksport odpowiedzi' },
      { key: 'manage_payments', label: 'Zarządzaj płatnościami' },
    ],
    fields: [],
  },
  {
    key: 'push_campaigns', label: 'Kampanie push',
    resources: ['push_campaigns', 'push_campaign_recipients', 'push_campaign_events'],
    tabs: [],
    actions: [
      { key: 'send', label: 'Wyślij kampanię push' },
    ],
    fields: [],
  },
  {
    key: 'sms_campaigns', label: 'Kampanie SMS',
    resources: ['sms_campaigns', 'sms_campaign_recipients', 'sms_incoming'],
    tabs: [],
    actions: [
      { key: 'send', label: 'Wyślij kampanię SMS' },
    ],
    fields: [],
  },
  {
    // Tabele app_* mają w registry resource:null (odczyt otwarty — potrzebny wszystkim
    // do konfiguracji i własnych uprawnień). Ich ZAPIS jest bramkowany akcjami manage_*
    // w warstwie Data API (SETTINGS_WRITE_CAPABILITY), nie przez CRUD.
    key: 'settings', label: 'Ustawienia',
    resources: ['integration_settings'],
    tabs: [],
    actions: [
      { key: 'manage_users', label: 'Zarządzaj użytkownikami' },
      { key: 'manage_roles', label: 'Zarządzaj rolami' },
      { key: 'manage_permissions', label: 'Zarządzaj uprawnieniami' },
      { key: 'manage_modules', label: 'Zarządzaj modułami i zakładkami' },
      { key: 'manage_integrations', label: 'Zarządzaj integracjami' },
    ],
    fields: [
      { resource: 'app_users', column: 'role', label: 'Rola użytkownika' },
      { resource: 'app_users', column: 'is_active', label: 'Status aktywności' },
    ],
  },
];

// Zapis do tabel app_* (resource:null) wymaga akcji manage_* zamiast CRUD.
export const SETTINGS_WRITE_CAPABILITY = {
  app_users: 'action:settings:manage_users',
  app_roles: 'action:settings:manage_roles',
  app_permissions: 'action:settings:manage_permissions', // tabela legacy
  permission_grants: 'action:settings:manage_permissions',
  app_modules: 'action:settings:manage_modules',
  app_module_tabs: 'action:settings:manage_modules',
  app_settings: 'action:settings:manage_integrations',
  campuses: 'action:settings:manage_modules',
};

const MODULE_BY_KEY = Object.fromEntries(MODULES.map((m) => [m.key, m]));
export function getModule(key) { return MODULE_BY_KEY[key] || null; }

// Zasób -> moduł (do egzekwowania po stronie serwera).
export const RESOURCE_MODULE = {};
for (const m of MODULES) for (const r of m.resources) RESOURCE_MODULE[r] = m.key;

// Wylicza WSZYSTKIE capability z katalogu (płaska lista kluczy).
export function allCapabilities() {
  const caps = [];
  for (const m of MODULES) {
    caps.push(`module:${m.key}`);
    for (const t of m.tabs) caps.push(`tab:${m.key}:${t.key}`);
    for (const r of m.resources) for (const op of CRUD_OPS) caps.push(`res:${r}:${op}`);
    for (const a of m.actions) caps.push(`action:${m.key}:${a.key}`);
    for (const f of m.fields) { caps.push(`field:${f.resource}:${f.column}:read`); caps.push(`field:${f.resource}:${f.column}:write`); }
  }
  return caps;
}

// Struktura do renderu macierzy (grupy per moduł).
export function capabilityGroups() {
  return MODULES.map((m) => ({
    key: m.key,
    label: m.label,
    rows: [
      { cap: `module:${m.key}`, label: 'Dostęp do modułu', kind: 'module' },
      ...m.tabs.map((t) => ({ cap: `tab:${m.key}:${t.key}`, label: `Zakładka: ${t.label}`, kind: 'tab' })),
      ...m.resources.flatMap((r) => CRUD_OPS.map((op) => ({ cap: `res:${r}:${op}`, label: `${RESOURCE_LABELS[r] || r} — ${CRUD_LABELS[op]}`, kind: 'crud' }))),
      ...m.actions.map((a) => ({ cap: `action:${m.key}:${a.key}`, label: `Akcja: ${a.label}`, kind: 'action' })),
      ...m.fields.flatMap((f) => [
        { cap: `field:${f.resource}:${f.column}:read`, label: `Pole ${f.label} — odczyt`, kind: 'field' },
        { cap: `field:${f.resource}:${f.column}:write`, label: `Pole ${f.label} — edycja`, kind: 'field' },
      ]),
    ],
  }));
}

// Kolumny z kontrolą na poziomie pola dla danej tabeli/zasobu (do filtrowania w Data API).
const FIELD_COLUMNS = {};
for (const m of MODULES) for (const f of m.fields) {
  (FIELD_COLUMNS[f.resource] ||= []).push(f.column);
}
export function fieldColumns(resource) { return FIELD_COLUMNS[resource] || []; }

// Mapowanie op Data API -> capability CRUD dla zasobu.
export function crudCapability(resource, op) {
  const map = { select: 'read', insert: 'create', update: 'update', delete: 'delete' };
  return `res:${resource}:${map[op] || op}`;
}

// Mapowanie endpointów fn -> capability akcji (do egzekwowania /api/fn/*).
export const FN_CAPABILITY = {
  'send-mail': 'action:mail:send',
  'sync-mail': 'action:mail:sync',
  'test-smtp': 'action:mail:test',
  'send-mailing-campaign': 'action:mailing:send',
  'send-program-email': 'action:programs:send_email',
  'send-assignment-email': 'action:programs:send_assignment',
  'send-form-email': 'action:forms:export',
  'send-sms': 'action:sms_campaigns:send',
  'sms-campaign-dispatch': 'action:sms_campaigns:send',
  'send-push': 'action:push_campaigns:send',
  'push-campaign-dispatch': 'action:push_campaigns:send',
  'ical': 'action:calendar:export_ical',
};
