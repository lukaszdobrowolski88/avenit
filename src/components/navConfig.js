// Architektura menu bocznego — czysta logika (bez Reacta), testowana w navConfig.test.js.
// Etykiety grup to polskie klucze i18n (renderowane przez tr()).

// Grupy menu (kolejność stała). W grupie pozycje idą wg app_modules.display_order.
// Moduły o kluczach spoza listy (z kreatora modułów) trafiają do „Moje moduły”.
export const NAV_GROUPS = [
  // fixedOrder: kolejność wg listy kluczy (Pulpit, Wydarzenia, Programy), nie wg display_order.
  { id: 'start', label: 'Start', keys: ['dashboard', 'calendar', 'programs'], fixedOrder: true },
  { id: 'people', label: 'Ludzie', keys: ['members', 'homegroups', 'groups', 'attendance', 'rsvp', 'prayer'] },
  { id: 'ministries', label: 'Służby', keys: ['worship', 'media', 'atmosfera', 'kids', 'mlodziezowka', 'teaching', 'serve'] },
  { id: 'communication', label: 'Komunikacja', keys: ['komunikator', 'mail', 'mailing', 'push_campaigns', 'sms_campaigns'] },
  { id: 'finance', label: 'Finanse', keys: ['finance', 'giving'] },
  { id: 'tools', label: 'Narzędzia', keys: ['boards', 'forms', 'rooms', 'automation', 'analytics', 'ai'] },
  { id: 'custom', label: 'Moje moduły', keys: [] },
];

// Klucze modułów, które nie mają już osobnego ekranu (są zakładkami innych modułów) —
// nie pokazujemy ich w menu, a stare adresy przekierowują na właściwą zakładkę (UXE-05).
export const HIDDEN_NAV_KEYS = ['care', 'sermons'];

// Gdzie żyją moduły scalone z innymi (stare ścieżki → zakładka).
export const MERGED_MODULE_TARGETS = {
  care: '/members?tab=care',
  sermons: '/teaching?tab=kazania',
};

// Domyślne ikony (nazwy lucide) per klucz — używane, gdy ikona z bazy dubluje się z inną pozycją.
export const KEY_ICONS = {
  dashboard: 'LayoutDashboard',
  calendar: 'CalendarDays',
  programs: 'ListOrdered',
  members: 'Users',
  homegroups: 'Home',
  groups: 'Home',
  attendance: 'ClipboardCheck',
  rsvp: 'MailCheck',
  prayer: 'Heart',
  worship: 'Music',
  media: 'Video',
  atmosfera: 'Coffee',
  kids: 'Baby',
  mlodziezowka: 'Flame',
  teaching: 'BookOpen',
  serve: 'UserCheck',
  komunikator: 'MessageCircle',
  mail: 'Inbox',
  mailing: 'Send',
  push_campaigns: 'BellRing',
  sms_campaigns: 'Smartphone',
  finance: 'Wallet',
  giving: 'Gift',
  boards: 'SquareKanban',
  forms: 'ClipboardList',
  rooms: 'DoorOpen',
  automation: 'Workflow',
  analytics: 'BarChart3',
  ai: 'Sparkles',
  settings: 'Settings',
};

// Ścieżki podstron, które nie są pozycją menu, a należą do modułu (UXE-11).
export const ROUTE_ALIASES = [
  ['/wydarzenie', 'calendar'],
  ['/wydarzenia', 'calendar'],
  ['/calendar', 'calendar'],
  ['/programs', 'programs'],
  ['/care', 'members'],
  ['/sermons', 'teaching'],
  ['/settings', 'settings'],
];

const matchesPrefix = (pathname, prefix) =>
  !!prefix && (pathname === prefix || pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`));

// Klucz aktywnej pozycji menu dla ścieżki: najdłuższy pasujący prefiks ścieżki pozycji
// (z granicą segmentu), potem aliasy podstron, potem /module/:key.
export function resolveActiveKey(pathname, links = []) {
  const path = (pathname || '/').replace(/\/+$/, '') || '/';
  if (path === '/') return 'dashboard';
  let best = null;
  for (const l of links) {
    if (!l || !l.path || l.path === '/') continue;
    const lp = l.path.split('?')[0].replace(/\/+$/, '');
    if (!lp) continue;
    if (matchesPrefix(path, lp) && (!best || lp.length > best.len)) best = { key: l.key, len: lp.length };
  }
  if (best) return best.key;
  for (const [prefix, key] of ROUTE_ALIASES) {
    if (matchesPrefix(path, prefix)) return key;
  }
  const m = path.match(/^\/module\/([^/]+)/);
  if (m) return decodeURIComponent(m[1]);
  return null;
}

// Grupuje pozycje (zachowując ich kolejność wejściową) i odrzuca puste grupy.
export function groupNavLinks(links = []) {
  const known = new Map();
  NAV_GROUPS.forEach((g) => g.keys.forEach((k) => known.set(k, g.id)));
  const buckets = new Map(NAV_GROUPS.map((g) => [g.id, []]));
  for (const l of links) {
    const gid = known.get(l.key) || 'custom';
    buckets.get(gid).push(l);
  }
  return NAV_GROUPS
    .map((g) => {
      let ls = buckets.get(g.id);
      if (g.fixedOrder) ls = [...ls].sort((a, b) => g.keys.indexOf(a.key) - g.keys.indexOf(b.key));
      return { id: g.id, label: g.label, links: ls };
    })
    .filter((g) => g.links.length > 0);
}

// Usuwa powtórzenia ikon: pierwsza pozycja zachowuje swoją ikonę, kolejna dostaje ikonę
// domyślną dla swojego klucza (jeśli ta jest wolna). Zwraca nowe obiekty z polem iconName.
export function dedupeIconNames(links = []) {
  const used = new Set();
  return links.map((l) => {
    let name = l.iconName || KEY_ICONS[l.key] || 'Square';
    if (used.has(name)) {
      const alt = KEY_ICONS[l.key];
      if (alt && !used.has(alt)) name = alt;
    }
    used.add(name);
    return { ...l, iconName: name };
  });
}

// Normalizacja tekstu do wyszukiwania: małe litery, bez polskich znaków.
export function foldText(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l');
}

// Dopasowanie „od początku słowa”: każde słowo zapytania musi być początkiem któregoś słowa
// w tekście. Zwraca 0 (brak), 2 (trafienie w etykietę) lub 1 (trafienie w słowa kluczowe).
export function wordStartScore(query, label, keywords = '') {
  const q = foldText(query).trim();
  if (!q) return 0;
  const qWords = q.split(/\s+/).filter(Boolean);
  const words = (txt) => foldText(txt).split(/[^a-z0-9]+/).filter(Boolean);
  const labelWords = words(label);
  const all = labelWords.concat(words(keywords));
  const hit = (pool) => qWords.every((qw) => pool.some((w) => w.startsWith(qw)));
  if (hit(labelWords)) return 2;
  if (hit(all)) return 1;
  return 0;
}
