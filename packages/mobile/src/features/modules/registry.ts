import type { LucideIcon } from 'lucide-react-native';
import {
  BarChart3,
  Baby,
  Bell,
  BellRing,
  BookOpen,
  Bot,
  Briefcase,
  ClipboardCheck,
  Calendar,
  CalendarOff,
  ClipboardList,
  DoorOpen,
  FolderOpen,
  Gift,
  HandHeart,
  HeartHandshake,
  Home,
  LayoutGrid,
  ListChecks,
  Mail,
  MailCheck,
  MessageCircle,
  MessageSquare,
  Music,
  Podcast,
  Send,
  Settings,
  Share2,
  Sparkles,
  UserCheck,
  Users,
  UsersRound,
  Video,
  Wallet,
  Workflow,
} from 'lucide-react-native';

// Mapa modułów weba (app_modules.key) → ekran w apce albo strona weba.
// Widoczność liczy usePermissions (to samo co Sidebar weba); tu jest tylko „gdzie
// prowadzi" i „jak wygląda". Moduł bez natywnego ekranu otwiera się na webie (z biletem SSO).

export type ModuleSection = 'community' | 'teams' | 'manage';

export interface ModuleEntry {
  key: string;
  label: string; // domyślna nazwa — tenant może ją zmienić w app_modules.label
  Icon: LucideIcon;
  tint: string;
  bg: string;
  section: ModuleSection;
  // Ekran natywny (expo-router). Brak = otwórz web pod `webPath`.
  route?: string;
  webPath: string;
  // Dodatkowe słowa dla wyszukiwarki (np. „ccli” → Analityka, „kazania” → Nauczanie).
  keywords?: string;
  // Krótki opis pod nazwą (moduły otwierane w przeglądarce — co tam jest).
  hint?: string;
}

const m = (e: ModuleEntry) => e;

export const MODULE_REGISTRY: Record<string, ModuleEntry> = {
  programs: m({ key: 'programs', label: 'Programy', Icon: ListChecks, tint: '#2A2312', bg: '#ECE8DE', section: 'community', route: '/(app)/programs', webPath: '/programs', keywords: 'nabożeństwa plan' }),
  calendar: m({ key: 'calendar', label: 'Wydarzenia', Icon: Calendar, tint: '#2A2312', bg: '#ECE8DE', section: 'community', route: '/(app)/calendar', webPath: '/wydarzenia', keywords: 'kalendarz grafik' }),
  komunikator: m({ key: 'komunikator', label: 'Komunikator', Icon: MessageCircle, tint: '#2A2312', bg: '#ECE8DE', section: 'community', route: '/(app)/messenger', webPath: '/komunikator', keywords: 'czat wiadomości' }),
  prayer: m({ key: 'prayer', label: 'Ściana modlitwy', Icon: HandHeart, tint: '#2A2312', bg: '#ECE8DE', section: 'community', route: '/(app)/prayers', webPath: '/prayer', keywords: 'modlitwy intencje' }),
  homegroups: m({ key: 'homegroups', label: 'Grupy domowe', Icon: Home, tint: '#2A2312', bg: '#ECE8DE', section: 'community', route: '/(app)/home-groups', webPath: '/home-groups' }),
  teaching: m({ key: 'teaching', label: 'Nauczanie', Icon: BookOpen, tint: '#2A2312', bg: '#ECE8DE', section: 'community', route: '/(app)/teachings', webPath: '/teaching', keywords: 'kazania serie' }),
  sermons: m({ key: 'sermons', label: 'Kazania', Icon: Podcast, tint: '#2A2312', bg: '#ECE8DE', section: 'community', route: '/(app)/sermons', webPath: '/teaching?tab=kazania' }),
  boards: m({ key: 'boards', label: 'Projekty', Icon: LayoutGrid, tint: '#2A2312', bg: '#ECE8DE', section: 'community', route: '/(app)/work', webPath: '/projekty', keywords: 'tablice zadania boards' }),

  worship: m({ key: 'worship', label: 'Zespół uwielbienia', Icon: Music, tint: '#2A2312', bg: '#ECE8DE', section: 'teams', route: '/(app)/teams/worship', webPath: '/worship' }),
  // Baza pieśni to część modułu Uwielbienia na webie (zakładka) — tu osobny kafel.
  songs: m({ key: 'songs', label: 'Baza pieśni', Icon: Music, tint: '#2A2312', bg: '#ECE8DE', section: 'teams', route: '/(app)/songs', webPath: '/worship' }),
  media: m({ key: 'media', label: 'MediaTeam', Icon: Video, tint: '#2A2312', bg: '#ECE8DE', section: 'teams', route: '/(app)/teams/media', webPath: '/media' }),
  atmosfera: m({ key: 'atmosfera', label: 'Atmosfera Team', Icon: Sparkles, tint: '#2A2312', bg: '#ECE8DE', section: 'teams', route: '/(app)/teams/atmosfera', webPath: '/atmosfera' }),
  kids: m({ key: 'kids', label: 'Dzieci', Icon: Baby, tint: '#2A2312', bg: '#ECE8DE', section: 'teams', route: '/(app)/teams/kids', webPath: '/kids', keywords: 'kids meldowanie szkółka' }),
  mlodziezowka: m({ key: 'mlodziezowka', label: 'Młodzieżówka', Icon: UsersRound, tint: '#2A2312', bg: '#ECE8DE', section: 'teams', route: '/(app)/teams/mlodziezowka', webPath: '/mlodziezowka' }),

  members: m({ key: 'members', label: 'Członkowie', Icon: Users, tint: '#2A2312', bg: '#ECE8DE', section: 'manage', route: '/(app)/members', webPath: '/members', keywords: 'opieka duszpasterska crm ludzie osoby' }),
  forms: m({ key: 'forms', label: 'Formularze', Icon: ClipboardList, tint: '#2A2312', bg: '#ECE8DE', section: 'manage', route: '/(app)/forms', webPath: '/forms' }),
  giving: m({ key: 'giving', label: 'Hojność', Icon: Gift, tint: '#2A2312', bg: '#ECE8DE', section: 'manage', route: '/(app)/giving/admin', webPath: '/giving', keywords: 'darowizny zbiórki dawanie' }),
  finance: m({ key: 'finance', label: 'Finanse', Icon: Wallet, tint: '#2A2312', bg: '#ECE8DE', section: 'manage', route: '/(app)/finance', webPath: '/finance' }),
  care: m({ key: 'care', label: 'Opieka duszpasterska', Icon: HeartHandshake, tint: '#2A2312', bg: '#ECE8DE', section: 'manage', webPath: '/members' }),
  attendance: m({ key: 'attendance', label: 'Frekwencja', Icon: UserCheck, tint: '#2A2312', bg: '#ECE8DE', section: 'manage', route: '/(app)/attendance', webPath: '/attendance', keywords: 'obecność liczenie' }),
  rooms: m({ key: 'rooms', label: 'Rezerwacje sal', Icon: DoorOpen, tint: '#2A2312', bg: '#ECE8DE', section: 'manage', route: '/(app)/rooms', webPath: '/rooms' }),
  rsvp: m({ key: 'rsvp', label: 'Zapisy (RSVP)', Icon: MailCheck, tint: '#2A2312', bg: '#ECE8DE', section: 'manage', webPath: '/rsvp', keywords: 'obecność zaproszenia', hint: 'Zaproszenia i zapisy na wydarzenia' }),
  serve: m({ key: 'serve', label: 'Dostępność', Icon: CalendarOff, tint: '#2A2312', bg: '#ECE8DE', section: 'manage', route: '/(app)/serve', webPath: '/serve', keywords: 'służba niedostępność wolontariusze nieobecności', hint: 'Kto z wolontariuszy nie może służyć i kiedy' }),
  mailing: m({ key: 'mailing', label: 'Kampanie e-mail', Icon: Send, tint: '#2A2312', bg: '#ECE8DE', section: 'manage', webPath: '/mailing', keywords: 'mailing newsletter' }),
  mail: m({ key: 'mail', label: 'Skrzynka pocztowa', Icon: Mail, tint: '#2A2312', bg: '#ECE8DE', section: 'manage', webPath: '/mail', keywords: 'poczta e-mail' }),
  sms_campaigns: m({ key: 'sms_campaigns', label: 'Kampanie SMS', Icon: MessageSquare, tint: '#2A2312', bg: '#ECE8DE', section: 'manage', webPath: '/sms-campaigns', keywords: 'sms wiadomości' }),
  push_campaigns: m({ key: 'push_campaigns', label: 'Kampanie push', Icon: BellRing, tint: '#2A2312', bg: '#ECE8DE', section: 'manage', webPath: '/push-campaigns', keywords: 'powiadomienia push' }),
  automation: m({ key: 'automation', label: 'Automatyzacje', Icon: Workflow, tint: '#2A2312', bg: '#ECE8DE', section: 'manage', webPath: '/automation', keywords: 'reguły workflow' }),
  analytics: m({ key: 'analytics', label: 'Analityka', Icon: BarChart3, tint: '#2A2312', bg: '#ECE8DE', section: 'manage', webPath: '/analytics', keywords: 'ccli raport pieśni statystyki', hint: 'Statystyki i raport CCLI' }),
  ai: m({ key: 'ai', label: 'Asystent AI', Icon: Bot, tint: '#2A2312', bg: '#ECE8DE', section: 'manage', webPath: '/ai' }),
  settings: m({ key: 'settings', label: 'Ustawienia', Icon: Settings, tint: '#2A2312', bg: '#ECE8DE', section: 'manage', webPath: '/settings', keywords: 'uprawnienia użytkownicy role kampusy', hint: 'Użytkownicy, uprawnienia i moduły kościoła' }),
};

// Klucze, których NIE pokazujemy jako kafelka modułu (pulpit to zakładka Start).
export const HIDDEN_MODULE_KEYS = new Set(['dashboard']);

// Moduł z kreatora (spoza rejestru) — natywny ekran z zakładkami (app/(app)/custom/[key]).
export const customModuleEntry = (key: string, label: string, path: string | null): ModuleEntry => ({
  key,
  label,
  Icon: Briefcase,
  tint: '#2A2312',
  bg: '#ECE8DE',
  section: 'teams',
  route: `/(app)/custom/${key}`,
  webPath: path || `/module/${key}`,
});

// Skróty osobiste — zawsze dostępne (serwer i tak zwraca tylko dane tej osoby).
export interface PersonalEntry {
  key: string;
  label: string;
  Icon: LucideIcon;
  tint: string;
  bg: string;
  route: string;
  // Krótka etykieta pod kaflem na pulpicie (sekcja „Dla Ciebie” daje kontekst „moje”).
  short: string;
  // Pokazuj tylko, gdy moduł widoczny.
  requiresModule?: string;
}

export const PERSONAL_ENTRIES: PersonalEntry[] = [
  // Bez wymogu Projektów (module:boards): zadania z tablic służb (Media, Młodzieżówka, moduły
  // z kreatora…) są widoczne w zakresie służby — serwer sam zawęża wiersze.
  { key: 'my-work', label: 'Moje zadania', short: 'Zadania', Icon: ClipboardCheck, tint: '#2A2312', bg: '#ECE8DE', route: '/(app)/work' },
  { key: 'my-rsvp', label: 'Moje zaproszenia', short: 'Zaproszenia', Icon: MailCheck, tint: '#2A2312', bg: '#ECE8DE', route: '/(app)/rsvp' },
  { key: 'my-availability', label: 'Moje nieobecności', short: 'Nieobecności', Icon: CalendarOff, tint: '#2A2312', bg: '#ECE8DE', route: '/(app)/serve/availability' },
  { key: 'my-giving', label: 'Moja hojność', short: 'Hojność', Icon: Gift, tint: '#2A2312', bg: '#ECE8DE', route: '/(app)/giving' },
  { key: 'setlist', label: 'Planowane pieśni', short: 'Pieśni', Icon: Music, tint: '#2A2312', bg: '#ECE8DE', route: '/(app)/setlist' },
  { key: 'materials', label: 'Materiały', short: 'Materiały', Icon: FolderOpen, tint: '#2A2312', bg: '#ECE8DE', route: '/(app)/materials' },
  { key: 'shared', label: 'Udostępnione mi', short: 'Udostępnione', Icon: Share2, tint: '#2A2312', bg: '#ECE8DE', route: '/(app)/materials/shared' },
  { key: 'notifications', label: 'Powiadomienia', short: 'Powiadomienia', Icon: Bell, tint: '#2A2312', bg: '#ECE8DE', route: '/(app)/notifications' },
];

export const SECTION_LABELS: Record<ModuleSection, string> = {
  community: 'Wspólnota',
  teams: 'Zespoły i służby',
  manage: 'Zarządzanie',
};
