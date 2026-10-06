import type { LucideIcon } from 'lucide-react-native';
import {
  Baby,
  Briefcase,
  CalendarDays,
  Home,
  LayoutGrid,
  Shapes,
  Smile,
  ClipboardList,
  FolderOpen,
  MessageSquare,
  Music,
  Package,
  Star,
  User,
  Users,
  Wallet,
} from 'lucide-react-native';

// Konfiguracja zakładek zespołów 1:1 z webem (src/modules/*Module.jsx). Uwaga na klucze:
// web używa RÓŻNYCH identyfikatorów w różnych tabelach —
//   • events.module_key, equipment/materials/team_roles.team_type, schedule team_type → klucz modułu,
//   • budget_items/expense_transactions/budget_proposals.team_type → nazwa wyświetlana (financeName),
//   • wall_posts.ministry → nazwa (tylko Uwielbienie ma tablicę na webie),
//   • boards.source_kind → '<x>_tasks' (zadania jako tablica Projektów).

export type TeamKey = 'worship' | 'media' | 'atmosfera' | 'kids' | 'mlodziezowka' | 'homegroups';

export type TeamTabKey =
  | 'overview'
  | 'checkin'
  | 'wall'
  | 'events'
  | 'schedule'
  | 'songs'
  | 'tasks'
  | 'leaders'
  | 'members'
  | 'roles'
  | 'groups'
  | 'students'
  | 'households'
  | 'finance'
  | 'equipment'
  | 'files';

export interface TeamConfig {
  key: TeamKey;
  tabs: TeamTabKey[]; // kolejność jak na webie (+ „Przegląd” na początku i Finanse bliżej końca)
  financeName: string;
  wallMinistry?: string;
  memberTable?: string;
  leaderTable?: string;
  boardSourceKind?: string;
  eventsTable: 'events' | 'mlodziezowka_events';
  // Zakładka „Członkowie” na webie dla Dzieci to „Nauczyciele” (tab:kids:teachers).
  membersTabKey?: string;
  membersLabel?: string;
}

export const TEAM_CONFIG: Record<TeamKey, TeamConfig> = {
  worship: {
    key: 'worship',
    tabs: ['overview', 'wall', 'events', 'schedule', 'songs', 'members', 'roles', 'equipment', 'finance', 'files'],
    financeName: 'Grupa Uwielbienia',
    wallMinistry: 'Grupa Uwielbienia',
    memberTable: 'worship_team',
    eventsTable: 'events',
  },
  media: {
    key: 'media',
    tabs: ['overview', 'events', 'schedule', 'tasks', 'members', 'roles', 'equipment', 'finance', 'files'],
    financeName: 'MediaTeam',
    memberTable: 'media_team',
    boardSourceKind: 'media_tasks',
    eventsTable: 'events',
  },
  atmosfera: {
    key: 'atmosfera',
    tabs: ['overview', 'events', 'schedule', 'members', 'roles', 'equipment', 'finance', 'files'],
    financeName: 'AtmosferaTeam',
    memberTable: 'atmosfera_members',
    eventsTable: 'events',
  },
  kids: {
    key: 'kids',
    tabs: ['overview', 'checkin', 'events', 'schedule', 'groups', 'members', 'students', 'households', 'equipment', 'finance', 'files'],
    financeName: 'małe Avenit',
    memberTable: 'kids_teachers',
    eventsTable: 'events',
    membersTabKey: 'teachers',
    membersLabel: 'Nauczyciele',
  },
  mlodziezowka: {
    key: 'mlodziezowka',
    tabs: ['events', 'tasks', 'leaders', 'members', 'finance', 'equipment'],
    financeName: 'Mlodziezowka',
    memberTable: 'mlodziezowka_members',
    leaderTable: 'mlodziezowka_leaders',
    boardSourceKind: 'mlodziezowka_tasks',
    eventsTable: 'events',
  },
  homegroups: {
    key: 'homegroups',
    tabs: ['events', 'tasks', 'leaders', 'members', 'finance', 'equipment', 'files'],
    financeName: 'Grupy domowe',
    memberTable: 'home_group_members',
    leaderTable: 'home_group_leaders',
    boardSourceKind: 'home_group_tasks',
    eventsTable: 'events',
  },
};

export const isTeamKey = (s: string | undefined): s is TeamKey =>
  !!s && Object.prototype.hasOwnProperty.call(TEAM_CONFIG, s);

export const TAB_META: Record<TeamTabKey, { label: string; Icon: LucideIcon }> = {
  overview: { label: 'Przegląd', Icon: LayoutGrid },
  checkin: { label: 'Dziś', Icon: Baby },
  wall: { label: 'Tablica', Icon: MessageSquare },
  events: { label: 'Wydarzenia', Icon: CalendarDays },
  schedule: { label: 'Grafik', Icon: ClipboardList },
  songs: { label: 'Baza pieśni', Icon: Music },
  tasks: { label: 'Zadania', Icon: Briefcase },
  leaders: { label: 'Liderzy', Icon: Star },
  members: { label: 'Członkowie', Icon: User },
  roles: { label: 'Służby', Icon: Users },
  groups: { label: 'Grupy', Icon: Shapes },
  students: { label: 'Uczniowie', Icon: Smile },
  households: { label: 'Rodziny', Icon: Home },
  finance: { label: 'Finanse', Icon: Wallet },
  equipment: { label: 'Wyposażenie', Icon: Package },
  files: { label: 'Pliki', Icon: FolderOpen },
};

// Bramka zakładki = klucz `tab:<moduł>:<x>` jak hasTabAccess na webie; null = bez bramki.
export const tabGate = (cfg: TeamConfig, tab: TeamTabKey): string | null => {
  switch (tab) {
    case 'members':
      return cfg.membersTabKey ?? 'members';
    case 'roles':
      return 'members';
    case 'finance':
      return 'finances';
    case 'equipment':
      return 'equipment';
    case 'leaders':
      // Młodzieżówka chowa Liderów (tab:mlodziezowka:leaders); grupy domowe — nie.
      return cfg.key === 'mlodziezowka' ? 'leaders' : null;
    default:
      return null;
  }
};
