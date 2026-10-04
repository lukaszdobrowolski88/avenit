import type { LucideIcon } from 'lucide-react-native';
import {
  BarChart3,
  Baby,
  Bell,
  BellRing,
  BookOpen,
  Bot,
  Briefcase,
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
}

const m = (e: ModuleEntry) => e;

export const MODULE_REGISTRY: Record<string, ModuleEntry> = {
  programs: m({ key: 'programs', label: 'Programy', Icon: ListChecks, tint: '#be185d', bg: '#fce7f3', section: 'community', route: '/(app)/programs', webPath: '/programs' }),
  calendar: m({ key: 'calendar', label: 'Wydarzenia', Icon: Calendar, tint: '#0e7490', bg: '#cffafe', section: 'community', route: '/(app)/calendar', webPath: '/wydarzenia' }),
  komunikator: m({ key: 'komunikator', label: 'Komunikator', Icon: MessageCircle, tint: '#7c3aed', bg: '#ede9fe', section: 'community', route: '/(app)/messenger', webPath: '/komunikator' }),
  prayer: m({ key: 'prayer', label: 'Ściana modlitwy', Icon: HandHeart, tint: '#c2410c', bg: '#ffedd5', section: 'community', route: '/(app)/prayers', webPath: '/prayer' }),
  homegroups: m({ key: 'homegroups', label: 'Grupy domowe', Icon: Home, tint: '#15803d', bg: '#dcfce7', section: 'community', route: '/(app)/home-groups', webPath: '/home-groups' }),
  teaching: m({ key: 'teaching', label: 'Nauczanie', Icon: BookOpen, tint: '#1d4ed8', bg: '#dbeafe', section: 'community', route: '/(app)/teachings', webPath: '/teaching' }),
  sermons: m({ key: 'sermons', label: 'Kazania', Icon: Podcast, tint: '#9333ea', bg: '#f3e8ff', section: 'community', route: '/(app)/sermons', webPath: '/teaching' }),
  boards: m({ key: 'boards', label: 'Projekty', Icon: LayoutGrid, tint: '#0f766e', bg: '#ccfbf1', section: 'community', route: '/(app)/work', webPath: '/projekty' }),

  worship: m({ key: 'worship', label: 'Zespół Uwielbienia', Icon: Music, tint: '#db2777', bg: '#fce7f3', section: 'teams', route: '/(app)/teams/worship', webPath: '/worship' }),
  // Baza pieśni to część modułu Uwielbienia na webie (zakładka) — tu osobny kafel.
  songs: m({ key: 'songs', label: 'Baza pieśni', Icon: Music, tint: '#be185d', bg: '#fdf2f8', section: 'teams', route: '/(app)/songs', webPath: '/worship' }),
  media: m({ key: 'media', label: 'MediaTeam', Icon: Video, tint: '#2563eb', bg: '#dbeafe', section: 'teams', route: '/(app)/teams/media', webPath: '/media' }),
  atmosfera: m({ key: 'atmosfera', label: 'Atmosfera Team', Icon: Sparkles, tint: '#0d9488', bg: '#ccfbf1', section: 'teams', route: '/(app)/teams/atmosfera', webPath: '/atmosfera' }),
  kids: m({ key: 'kids', label: 'Dzieci', Icon: Baby, tint: '#ca8a04', bg: '#fef9c3', section: 'teams', route: '/(app)/teams/kids', webPath: '/kids' }),
  mlodziezowka: m({ key: 'mlodziezowka', label: 'Młodzieżówka', Icon: UsersRound, tint: '#ea580c', bg: '#ffedd5', section: 'teams', route: '/(app)/teams/mlodziezowka', webPath: '/mlodziezowka' }),

  members: m({ key: 'members', label: 'Członkowie', Icon: Users, tint: '#4338ca', bg: '#e0e7ff', section: 'manage', route: '/(app)/members', webPath: '/members' }),
  forms: m({ key: 'forms', label: 'Formularze', Icon: ClipboardList, tint: '#0369a1', bg: '#e0f2fe', section: 'manage', route: '/(app)/forms', webPath: '/forms' }),
  giving: m({ key: 'giving', label: 'Dawanie', Icon: Gift, tint: '#be123c', bg: '#ffe4e6', section: 'manage', webPath: '/giving' }),
  finance: m({ key: 'finance', label: 'Finanse', Icon: Wallet, tint: '#047857', bg: '#d1fae5', section: 'manage', webPath: '/finance' }),
  care: m({ key: 'care', label: 'Opieka i CRM', Icon: HeartHandshake, tint: '#b91c1c', bg: '#fee2e2', section: 'manage', webPath: '/members' }),
  attendance: m({ key: 'attendance', label: 'Frekwencja', Icon: UserCheck, tint: '#0f766e', bg: '#ccfbf1', section: 'manage', route: '/(app)/attendance', webPath: '/attendance' }),
  rooms: m({ key: 'rooms', label: 'Rezerwacje sal', Icon: DoorOpen, tint: '#a16207', bg: '#fef3c7', section: 'manage', webPath: '/rooms' }),
  rsvp: m({ key: 'rsvp', label: 'Obecność (RSVP)', Icon: MailCheck, tint: '#0e7490', bg: '#cffafe', section: 'manage', webPath: '/rsvp' }),
  serve: m({ key: 'serve', label: 'Służba', Icon: CalendarOff, tint: '#6d28d9', bg: '#ede9fe', section: 'manage', webPath: '/serve' }),
  mailing: m({ key: 'mailing', label: 'Mailing', Icon: Send, tint: '#1d4ed8', bg: '#dbeafe', section: 'manage', webPath: '/mailing' }),
  mail: m({ key: 'mail', label: 'Poczta', Icon: Mail, tint: '#334155', bg: '#e2e8f0', section: 'manage', webPath: '/mail' }),
  sms_campaigns: m({ key: 'sms_campaigns', label: 'SMS Kampanie', Icon: MessageSquare, tint: '#15803d', bg: '#dcfce7', section: 'manage', webPath: '/sms-campaigns' }),
  push_campaigns: m({ key: 'push_campaigns', label: 'Push Kampanie', Icon: BellRing, tint: '#c2410c', bg: '#ffedd5', section: 'manage', webPath: '/push-campaigns' }),
  automation: m({ key: 'automation', label: 'Automatyzacje', Icon: Workflow, tint: '#7c3aed', bg: '#ede9fe', section: 'manage', webPath: '/automation' }),
  analytics: m({ key: 'analytics', label: 'Analityka', Icon: BarChart3, tint: '#0369a1', bg: '#e0f2fe', section: 'manage', webPath: '/analytics' }),
  ai: m({ key: 'ai', label: 'Asystent AI', Icon: Bot, tint: '#9333ea', bg: '#f3e8ff', section: 'manage', webPath: '/ai' }),
  settings: m({ key: 'settings', label: 'Ustawienia', Icon: Settings, tint: '#44403c', bg: '#f5f5f4', section: 'manage', webPath: '/settings' }),
};

// Klucze, których NIE pokazujemy jako kafelka modułu (pulpit to zakładka Start).
export const HIDDEN_MODULE_KEYS = new Set(['dashboard']);

// Moduł z kreatora (spoza rejestru) — zespół/służba, otwierany na webie pod swoją ścieżką.
export const customModuleEntry = (key: string, label: string, path: string | null): ModuleEntry => ({
  key,
  label,
  Icon: Briefcase,
  tint: '#475569',
  bg: '#f1f5f9',
  section: 'teams',
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
  // Pokazuj tylko, gdy moduł widoczny (np. Moja praca wymaga Projektów).
  requiresModule?: string;
}

export const PERSONAL_ENTRIES: PersonalEntry[] = [
  { key: 'my-work', label: 'Moja praca', Icon: Briefcase, tint: '#0f766e', bg: '#ccfbf1', route: '/(app)/work', requiresModule: 'boards' },
  { key: 'my-rsvp', label: 'Moje zaproszenia', Icon: MailCheck, tint: '#0e7490', bg: '#cffafe', route: '/(app)/rsvp' },
  { key: 'my-availability', label: 'Moja dostępność', Icon: CalendarOff, tint: '#6d28d9', bg: '#ede9fe', route: '/(app)/serve/availability' },
  { key: 'my-giving', label: 'Moje dawanie', Icon: Gift, tint: '#be123c', bg: '#ffe4e6', route: '/(app)/giving' },
  { key: 'setlist', label: 'Planowane pieśni', Icon: Music, tint: '#db2777', bg: '#fce7f3', route: '/(app)/setlist' },
  { key: 'materials', label: 'Materiały', Icon: FolderOpen, tint: '#a16207', bg: '#fef3c7', route: '/(app)/materials' },
  { key: 'shared', label: 'Udostępnione mi', Icon: Share2, tint: '#4338ca', bg: '#e0e7ff', route: '/(app)/materials/shared' },
  { key: 'notifications', label: 'Powiadomienia', Icon: Bell, tint: '#b45309', bg: '#fef3c7', route: '/(app)/notifications' },
];

export const SECTION_LABELS: Record<ModuleSection, string> = {
  community: 'Wspólnota',
  teams: 'Zespoły i służby',
  manage: 'Zarządzanie',
};
