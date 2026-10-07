// Czysta logika Ustawień (bez Reacta) — testowana w settingsLogic.test.js.

// ── Zakładki Ustawień i adres ?tab= (UXE-10) ──────────────────────────────────────────────
// Widoczne zakładki. „module_manager” scalono z „modules” (UXE-13); „localization” i „notifications”
// ukryte, bo ich ustawienia nic nie zmieniały (UXE-07) — stare linki trafiają w sensowne miejsce.
export const SETTINGS_TABS = [
  'general', 'appearance', 'campuses',
  'users', 'permissions', 'security',
  'modules', 'dictionaries',
  'integrations',
  'subscription',
];
export const SETTINGS_TAB_ALIASES = {
  module_manager: 'modules',
  localization: 'general',
  notifications: 'general',
};

export function resolveSettingsTab(param) {
  const p = String(param || '').trim();
  if (SETTINGS_TABS.includes(p)) return p;
  if (SETTINGS_TAB_ALIASES[p]) return SETTINGS_TAB_ALIASES[p];
  return 'general';
}

// ── SSO: czy każdy może sam założyć konto? ────────────────────────────────────────────────
const on = (v) => v === 'on';
export function ssoOpenToAnyone(get) {
  const anyProvider = on(get('sso_google_enabled')) || on(get('sso_microsoft_enabled'));
  return anyProvider
    && on(get('sso_auto_provision'))
    && !String(get('sso_allowed_domains') || '').trim()
    && !on(get('sso_provision_approval'));
}

// ── Scalanie duplikatów członków służb (UXE-08) ───────────────────────────────────────────
// Grupy rekordów o tym samym imieniu i nazwisku. Samo imię i nazwisko NIE wystarcza do scalenia:
// gdy rekordy mają różne e-maile lub telefony, grupa jest oznaczona jako konflikt i domyślnie
// niezaznaczona (to mogą być dwie różne osoby).
const normName = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const normEmail = (s) => String(s || '').trim().toLowerCase();
const normPhone = (s) => String(s || '').replace(/\D/g, '').replace(/^(00)?48(?=\d{9}$)/, '');

export function pickPrimary(members) {
  return members.find((m) => m.email && m.status === 'Aktywny')
    || members.find((m) => m.email)
    || members.find((m) => m.status === 'Aktywny')
    || members[0];
}

export function groupDuplicateMembers(members) {
  const byName = new Map();
  for (const m of members || []) {
    const n = normName(m.full_name);
    if (!n) continue;
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(m);
  }
  const groups = [];
  for (const [name, list] of byName) {
    if (list.length < 2) continue;
    const emails = new Set(list.map((m) => normEmail(m.email)).filter(Boolean));
    const phones = new Set(list.map((m) => normPhone(m.phone)).filter(Boolean));
    // Rekordy przypisane do różnych grup (np. nauczyciel w dwóch grupach dzieci) to nie duplikaty.
    const groupIds = new Set(list.map((m) => m.group_id).filter((g) => g != null && g !== ''));
    const conflict = emails.size > 1 || phones.size > 1 || groupIds.size > 1;
    const primary = pickPrimary(list);
    groups.push({
      key: name,
      name: list[0].full_name?.trim() || name,
      members: list,
      primary,
      duplicates: list.filter((m) => m.id !== primary.id),
      conflict,
    });
  }
  return groups.sort((a, b) => a.name.localeCompare(b.name));
}

// Dane do uzupełnienia w rekordzie głównym z duplikatów (tylko puste pola, nic nie nadpisujemy).
export function mergeFill(primary, duplicates) {
  const update = {};
  for (const d of duplicates) {
    if (!primary.email && !update.email && d.email) update.email = d.email;
    if (!primary.phone && !update.phone && d.phone) update.phone = d.phone;
    if (!primary.status && !update.status && d.status) update.status = d.status;
  }
  if (!primary.status && !update.status) update.status = 'Aktywny';
  return update;
}

// ── Sesje: czytelny opis urządzenia zamiast surowego user-agenta (UXE-14) ─────────────────
export function describeUserAgent(ua) {
  const s = String(ua || '');
  if (!s) return null;
  let device = null;
  if (/iPhone/i.test(s)) device = 'iPhone';
  else if (/iPad/i.test(s)) device = 'iPad';
  else if (/Android/i.test(s)) device = 'Android';
  else if (/Macintosh|Mac OS X/i.test(s)) device = 'Mac';
  else if (/Windows/i.test(s)) device = 'Windows';
  else if (/CrOS/i.test(s)) device = 'Chromebook';
  else if (/Linux/i.test(s)) device = 'Linux';

  let app = null;
  if (/Avenit/i.test(s) || /CFNetwork|Darwin\//i.test(s)) { app = 'app'; device = device || 'iPhone'; }
  else if (/okhttp|Expo/i.test(s)) { app = 'app'; device = device || 'Android'; }

  let browser = null;
  if (!app) {
    if (/Edg(e|A|iOS)?\//.test(s)) browser = 'Edge';
    else if (/OPR\/|Opera/.test(s)) browser = 'Opera';
    else if (/Firefox\/|FxiOS\//.test(s)) browser = 'Firefox';
    else if (/Chrome\/|CriOS\//.test(s)) browser = 'Chrome';
    else if (/Safari\//.test(s)) browser = 'Safari';
  }
  return { device, browser, app: app === 'app' };
}
