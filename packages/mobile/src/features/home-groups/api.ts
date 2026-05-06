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

export const useHomeGroups = ({ selectedCampusId, withCampusFilter }: CampusScope) =>
  useQuery({
    queryKey: ['home_groups', 'list', selectedCampusId],
    queryFn: async (): Promise<HomeGroup[]> => {
      const base = supabase
        .from('home_groups')
        .select(
          'id, name, description, meeting_day, meeting_time, location, address, phone, email, campus_id, leader:home_group_leaders(id, full_name, email, phone)',
        );
      const { data, error } = await withCampusFilter(base).order('name', { ascending: true });
      if (error) throw error;
      const list = (data ?? []) as any[];
      const ids = list.map((g) => g.id);
      const counts = new Map<string, number>();
      if (ids.length > 0) {
        const { data: rows } = await supabase
          .from('home_group_members')
          .select('group_id')
          .in('group_id', ids);
        for (const r of (rows ?? []) as any[]) {
          counts.set(r.group_id, (counts.get(r.group_id) ?? 0) + 1);
        }
      }
      return list.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description ?? null,
        meeting_day: g.meeting_day ?? null,
        meeting_time: g.meeting_time ?? null,
        location: g.location ?? null,
        address: g.address ?? null,
        phone: g.phone ?? null,
        email: g.email ?? null,
        leader: g.leader ?? null,
        members_count: counts.get(g.id) ?? 0,
        campus_id: g.campus_id ?? null,
      }));
    },
  });

export const useHomeGroupDetail = (id: string) =>
  useQuery({
    queryKey: ['home_groups', 'detail', id],
    queryFn: async (): Promise<{ group: HomeGroup | null; members: HomeGroupMember[] }> => {
      if (!id) return { group: null, members: [] };
      const { data: g, error } = await supabase
        .from('home_groups')
        .select(
          'id, name, description, meeting_day, meeting_time, location, address, phone, email, campus_id, leader:home_group_leaders(id, full_name, email, phone)',
        )
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      const { data: members } = await supabase
        .from('home_group_members')
        .select('id, full_name, email, phone, is_leader')
        .eq('group_id', id)
        .order('is_leader', { ascending: false })
        .order('full_name', { ascending: true });
      return {
        group: g
          ? ({
              id: (g as any).id,
              name: (g as any).name,
              description: (g as any).description ?? null,
              meeting_day: (g as any).meeting_day ?? null,
              meeting_time: (g as any).meeting_time ?? null,
              location: (g as any).location ?? null,
              address: (g as any).address ?? null,
              phone: (g as any).phone ?? null,
              email: (g as any).email ?? null,
              leader: (g as any).leader ?? null,
              members_count: (members ?? []).length,
              campus_id: (g as any).campus_id ?? null,
            } satisfies HomeGroup)
          : null,
        members: ((members ?? []) as any[]).map((m) => ({
          id: m.id,
          full_name: m.full_name,
          email: m.email ?? null,
          phone: m.phone ?? null,
          is_leader: !!m.is_leader,
        })),
      };
    },
    enabled: !!id,
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
