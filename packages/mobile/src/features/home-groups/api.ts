import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export interface HomeGroupLeader {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
}

export interface HomeGroup {
  id: string;
  name: string;
  description: string | null;
  meeting_day: string | null;
  meeting_time: string | null;
  location: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  leader: HomeGroupLeader | null;
  members_count: number;
  campus_id?: number | null;
}

export interface HomeGroupMember {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  is_leader: boolean;
}

interface CampusScope {
  selectedCampusId: number | null;
  withCampusFilter: <T>(query: T) => T;
}

interface ScopedGroup extends HomeGroup {
  is_mine: boolean;
  members: HomeGroupMember[];
}

// Prywatność: zamiast bezpośredniego odczytu home_group_* (grant res:home_group_members:read
// odsłaniał kontakty WSZYSTKICH grup każdemu członkowi) idziemy przez scoped endpoint —
// serwer zwraca kontakty/osoby TYLKO dla grup, do których należę (po e-mailu). Jedno
// pobranie współdzielone przez listę i detal (ten sam queryKey, różne `select`).
const fetchScopedGroups = async (): Promise<ScopedGroup[]> => {
  const { data, error } = await supabase.functions.invoke('my-home-groups');
  if (error || !data) return [];
  return ((data as { groups?: ScopedGroup[] }).groups ?? []) as ScopedGroup[];
};

export const useHomeGroups = ({ selectedCampusId }: CampusScope) =>
  useQuery({
    queryKey: ['home_groups', 'scoped'],
    queryFn: fetchScopedGroups,
    // Kampus filtrujemy po stronie klienta (endpoint zwraca wszystkie; izolacja
    // kampusowa jest uśpiona — 0 kampusów). Sam fakt istnienia grupy nie jest prywatny.
    select: (groups): HomeGroup[] =>
      selectedCampusId == null
        ? groups
        : groups.filter((g) => (g.campus_id ?? null) === selectedCampusId),
  });

export const useHomeGroupDetail = (id: string) =>
  useQuery({
    queryKey: ['home_groups', 'scoped'],
    queryFn: fetchScopedGroups,
    enabled: !!id,
    select: (
      groups,
    ): { group: HomeGroup | null; members: HomeGroupMember[]; is_mine: boolean } => {
      const g = groups.find((x) => String(x.id) === String(id)) ?? null;
      return { group: g, members: g?.members ?? [], is_mine: g?.is_mine ?? false };
    },
  });

const DAY_LABELS: Record<string, string> = {
  monday: 'Poniedziałek',
  tuesday: 'Wtorek',
  wednesday: 'Środa',
  thursday: 'Czwartek',
  friday: 'Piątek',
  saturday: 'Sobota',
  sunday: 'Niedziela',
  poniedzialek: 'Poniedziałek',
  wtorek: 'Wtorek',
  sroda: 'Środa',
  czwartek: 'Czwartek',
  piatek: 'Piątek',
  sobota: 'Sobota',
  niedziela: 'Niedziela',
};

export const formatMeetingDay = (day: string | null): string => {
  if (!day) return '';
  return DAY_LABELS[day.toLowerCase()] ?? day;
};

export const formatMeetingTime = (time: string | null): string => {
  if (!time) return '';
  return time.slice(0, 5);
};
