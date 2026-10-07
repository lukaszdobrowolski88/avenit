// Architektura menu modułów — port czystej logiki z weba (src/components/navConfig.js
// + normalizeModuleLabel z src/hooks/useModuleLabel.js). Bez Reacta.

export type NavGroupId = 'start' | 'people' | 'ministries' | 'communication' | 'finance' | 'tools' | 'custom';

export interface NavGroup {
  id: NavGroupId;
  label: string;
  keys: string[];
  // Kolejność wg listy kluczy (nie wg display_order).
  fixedOrder?: boolean;
}

// Grupy jak w menu weba (kolejność stała). W grupie pozycje idą wg app_modules.display_order.
// Moduły o kluczach spoza listy (z kreatora modułów) trafiają do „Moje moduły”.
// `songs` (Baza pieśni) to w webie zakładka Uwielbienia — w apce osobna pozycja w Starcie
// (to narzędzie dla wielu zespołów, nie służba).
export const NAV_GROUPS: NavGroup[] = [
  { id: 'start', label: 'Start', keys: ['dashboard', 'calendar', 'programs', 'songs'], fixedOrder: true },
  { id: 'people', label: 'Ludzie', keys: ['members', 'homegroups', 'groups', 'attendance', 'rsvp', 'prayer'] },
  { id: 'ministries', label: 'Służby', keys: ['worship', 'media', 'atmosfera', 'kids', 'mlodziezowka', 'teaching', 'serve'] },
  { id: 'communication', label: 'Komunikacja', keys: ['komunikator', 'mail', 'mailing', 'push_campaigns', 'sms_campaigns'] },
  { id: 'finance', label: 'Finanse', keys: ['finance', 'giving'] },
  { id: 'tools', label: 'Narzędzia', keys: ['boards', 'forms', 'rooms', 'automation', 'analytics', 'ai'] },
  { id: 'custom', label: 'Moje moduły', keys: [] },
];

// Klucze modułów, które nie mają osobnej pozycji (są zakładkami innych modułów) — jak w webie.
export const HIDDEN_NAV_KEYS = new Set(['care', 'sermons']);

// Gdzie żyją moduły scalone z innymi (stare ścieżki / skróty → moduł docelowy).
export const MERGED_MODULE_TARGETS: Record<string, string> = {
  care: 'members',
  sermons: 'teaching',
};

// Poza listą modułów: Pulpit (zakładka Start) i Ustawienia (osobna pozycja na dole).
export const NOT_IN_GROUPS = new Set(['dashboard', 'settings']);

const GROUP_OF = new Map<string, NavGroupId>();
NAV_GROUPS.forEach((g) => g.keys.forEach((k) => GROUP_OF.set(k, g.id)));

export const groupOf = (key: string): NavGroupId => GROUP_OF.get(key) ?? 'custom';

// Grupuje pozycje (zachowując kolejność wejściową) i odrzuca puste grupy.
export const groupNavItems = <T extends { key: string }>(items: T[]): { id: NavGroupId; label: string; items: T[] }[] => {
  const buckets = new Map<NavGroupId, T[]>(NAV_GROUPS.map((g) => [g.id, []]));
  for (const it of items) buckets.get(groupOf(it.key))!.push(it);
  return NAV_GROUPS.map((g) => {
    let list = buckets.get(g.id)!;
    if (g.fixedOrder) list = [...list].sort((a, b) => g.keys.indexOf(a.key) - g.keys.indexOf(b.key));
    return { id: g.id, label: g.label, items: list };
  }).filter((g) => g.items.length > 0);
};

// Stare domyślne nazwy modułów (angielski szyk / mylące, COPY-18, UXE-12). Podmieniamy TYLKO
// dokładnie te domyślne napisy — nazwa nadana przez kościół zostaje (migracja 085 zrobiła to
// w bazie, ale starsze wpisy innych kościołów mogą zostać).
const LEGACY_LABELS: Record<string, string> = {
  'Push Kampanie': 'Kampanie push',
  'SMS Kampanie': 'Kampanie SMS',
  Mailing: 'Kampanie e-mail',
  Poczta: 'Skrzynka pocztowa',
  'Obecność (RSVP)': 'Zapisy (RSVP)',
  Służba: 'Dostępność',
  'Dostępność i CCLI': 'Dostępność',
  'Centrum Modlitwy': 'Ściana modlitwy',
  'Opieka i CRM': 'Opieka duszpasterska',
};

export const normalizeModuleLabel = (label: string | null | undefined): string => {
  if (typeof label !== 'string') return '';
  return LEGACY_LABELS[label.trim()] ?? label;
};

// Normalizacja tekstu do wyszukiwania: małe litery, bez polskich znaków.
export const foldText = (s: string | null | undefined): string =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l');

// Dopasowanie „od początku słowa”: każde słowo zapytania musi być początkiem któregoś słowa
// w tekście. 0 = brak, 2 = trafienie w nazwę, 1 = trafienie w słowa kluczowe.
export const wordStartScore = (query: string, label: string, keywords = ''): number => {
  const q = foldText(query).trim();
  if (!q) return 0;
  const qWords = q.split(/\s+/).filter(Boolean);
  const words = (txt: string) => foldText(txt).split(/[^a-z0-9]+/).filter(Boolean);
  const labelWords = words(label);
  const all = labelWords.concat(words(keywords));
  const hit = (pool: string[]) => qWords.every((qw) => pool.some((w) => w.startsWith(qw)));
  if (hit(labelWords)) return 2;
  if (hit(all)) return 1;
  return 0;
};
