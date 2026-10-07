import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

// „Moje nieobecności” (jedyna funkcja nieobecności w apce) — przez fn my-blockouts
// (volunteer_blockouts; member_id ustala serwer, lider widzi w module Dostępność).
export interface Blockout {
  id: string;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  reason: string | null;
}

export interface MyBlockoutsData {
  memberResolved: boolean;
  blockouts: Blockout[];
}

export const useMyBlockouts = () =>
  useQuery({
    queryKey: ['my-blockouts'],
    queryFn: async (): Promise<MyBlockoutsData> => {
      const { data, error } = await supabase.functions.invoke('my-blockouts', {
        body: { action: 'list' },
      });
      if (error) throw error;
      return (data as MyBlockoutsData) ?? { memberResolved: false, blockouts: [] };
    },
  });

export const useAddBlockout = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { start_date: string; end_date: string; reason?: string | null }) => {
      const { error } = await supabase.functions.invoke('my-blockouts', {
        body: { action: 'add', ...input },
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-blockouts'] }),
  });
};

export const useDeleteBlockout = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.functions.invoke('my-blockouts', {
        body: { action: 'delete', id },
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-blockouts'] }),
  });
};

// ─── Moduł „Dostępność” (lider) ───────────────────────────────────────────────
// Jak web (src/modules/Serve/tabs/AvailabilityTab.jsx): niedostępności WSZYSTKICH wolontariuszy
// (volunteer_blockouts) — tylko to; Raport CCLI jest w Analityce. Dostęp: module:serve.

interface CampusScope {
  selectedCampusId: number | null;
  withCampusFilter: <T>(query: T) => T;
}

export interface VolunteerBlockout extends Blockout {
  memberId: string | null;
  memberName: string;
}
export interface Volunteer {
  id: string;
  name: string;
}

const memberLabel = (m: any) => [m?.first_name, m?.last_name].filter(Boolean).join(' ').trim() || 'Bez nazwiska';

export const useVolunteerAvailability = (scope: CampusScope) =>
  useQuery({
    queryKey: ['serve', 'availability', scope.selectedCampusId],
    queryFn: async (): Promise<{ blockouts: VolunteerBlockout[]; members: Volunteer[] }> => {
      const [bRes, mRes] = await Promise.all([
        scope.withCampusFilter(supabase.from('volunteer_blockouts').select('*')).order('start_date', { ascending: true }),
        scope.withCampusFilter(supabase.from('members').select('id, first_name, last_name')).order('last_name', { ascending: true }),
      ]);
      if (bRes.error) throw bRes.error;
      const members: Volunteer[] = ((mRes.data ?? []) as any[]).map((m) => ({ id: String(m.id), name: memberLabel(m) }));
      const byId = new Map(members.map((m) => [m.id, m.name]));
      return {
        members,
        blockouts: ((bRes.data ?? []) as any[]).map((b) => ({
          id: String(b.id),
          start_date: String(b.start_date).slice(0, 10),
          end_date: String(b.end_date ?? b.start_date).slice(0, 10),
          reason: b.reason ?? null,
          memberId: b.member_id != null ? String(b.member_id) : null,
          memberName: (b.member_id != null && byId.get(String(b.member_id))) || 'Wolontariusz',
        })),
      };
    },
  });

export const useAddVolunteerBlockout = (campusIdForInsert: number | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { memberId: string; start_date: string; end_date: string; reason: string | null }) => {
      if (input.end_date < input.start_date) throw new Error('Data „do” nie może być wcześniejsza niż data „od”.');
      const memberId = Number.isFinite(Number(input.memberId)) ? Number(input.memberId) : input.memberId;
      const { error } = await (supabase.from('volunteer_blockouts') as any)
        .insert({ member_id: memberId, start_date: input.start_date, end_date: input.end_date, reason: input.reason, campus_id: campusIdForInsert })
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['serve'] });
      qc.invalidateQueries({ queryKey: ['team'] });
    },
  });
};

export const useDeleteVolunteerBlockout = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await (supabase.from('volunteer_blockouts') as any).delete().eq('id', id).select('id');
      if (error) throw error;
      if (Array.isArray(data) && data.length === 0) throw new Error('Nie udało się usunąć — wpis mógł zostać już usunięty.');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['serve'] });
      qc.invalidateQueries({ queryKey: ['my-blockouts'] });
      qc.invalidateQueries({ queryKey: ['team'] });
    },
  });
};
