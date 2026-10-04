import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

// Frekwencja — kontrakt 1:1 z webem (src/modules/Attendance/tabs/SessionsTab.jsx):
//   attendance_sessions { title, session_date, session_type, headcount, note, campus_id, created_by }
//   attendance_records  { session_id, member_id | guest_name, present:true }
// Odznaczenie = USUNIĘCIE wiersza (web liczy każdy wpis jako obecny).
// Liczba obecnych = wpisy imienne, a gdy ich brak — headcount (szacunek).

export type SessionType = 'service' | 'group' | 'event' | 'prayer';

export const SESSION_TYPES: { key: SessionType; label: string }[] = [
  { key: 'service', label: 'Nabożeństwo' },
  { key: 'group', label: 'Grupa' },
  { key: 'event', label: 'Wydarzenie' },
  { key: 'prayer', label: 'Modlitwa' },
];

export interface Session {
  id: string;
  title: string | null;
  date: string;
  type: SessionType;
  headcount: number | null;
  note: string | null;
  named: number;
  // Wartość do pokazania: imiennie albo szacunkowo.
  count: number;
  estimated: boolean;
}

interface CampusScope {
  selectedCampusId: number | null;
  withCampusFilter: <T>(q: T) => T;
}

const asList = (d: unknown) => ((d ?? []) as any[]);

export const useSessions = (scope: CampusScope) =>
  useQuery({
    queryKey: ['attendance', 'sessions', scope.selectedCampusId],
    queryFn: async (): Promise<Session[]> => {
      const { data, error } = await scope
        .withCampusFilter(supabase.from('attendance_sessions').select('*'))
        .order('session_date', { ascending: false })
        .limit(100);
      if (error) throw error;
      const sessions = asList(data);
      const ids = sessions.map((s) => s.id);
      const named = new Map<string, number>();
      if (ids.length) {
        const { data: recs } = await supabase.from('attendance_records').select('session_id, present').in('session_id', ids);
        for (const r of asList(recs)) {
          if (r.present === false) continue;
          named.set(String(r.session_id), (named.get(String(r.session_id)) ?? 0) + 1);
        }
      }
      return sessions.map((s) => {
        const n = named.get(String(s.id)) ?? 0;
        const hc = s.headcount != null ? Number(s.headcount) : null;
        return {
          id: String(s.id),
          title: s.title ?? null,
          date: String(s.session_date).slice(0, 10),
          type: (s.session_type ?? 'service') as SessionType,
          headcount: hc,
          note: s.note ?? null,
          named: n,
          count: n > 0 ? n : hc ?? 0,
          estimated: n === 0 && hc != null,
        };
      });
    },
  });

export const useCreateSession = (userEmail: string | null, campusIdForInsert: number | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (s: { title: string | null; date: string; type: SessionType; headcount: number | null; note: string | null }) => {
      const { data, error } = await (supabase.from('attendance_sessions') as any)
        .insert({
          title: s.title,
          session_date: s.date,
          session_type: s.type,
          headcount: s.headcount,
          note: s.note,
          campus_id: campusIdForInsert,
          created_by: userEmail,
        })
        .select()
        .single();
      if (error) throw new Error(error.message || 'Nie udało się utworzyć sesji.');
      return String((data as any).id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
  });
};

export const useUpdateSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await (supabase.from('attendance_sessions') as any).update(patch).eq('id', id);
      if (error) throw new Error(error.message || 'Nie udało się zapisać.');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
  });
};

export const useDeleteSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('attendance_sessions').delete().eq('id', id);
      if (error) throw new Error(error.message || 'Nie udało się usunąć sesji.');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
  });
};

export interface AttendanceRecord {
  id: string;
  memberId: number | null;
  guestName: string | null;
}
export interface CheckMember {
  id: number;
  name: string;
}

export const useSessionDetail = (id: string, scope: CampusScope) =>
  useQuery({
    queryKey: ['attendance', 'session', id, scope.selectedCampusId],
    enabled: !!id,
    queryFn: async () => {
      const [{ data: s, error }, { data: recs }, { data: members }] = await Promise.all([
        supabase.from('attendance_sessions').select('*').eq('id', id).maybeSingle(),
        supabase.from('attendance_records').select('*').eq('session_id', id),
        scope
          .withCampusFilter(supabase.from('members').select('id, first_name, last_name'))
          .order('last_name', { ascending: true }),
      ]);
      if (error) throw error;
      const records: AttendanceRecord[] = asList(recs)
        .filter((r) => r.present !== false)
        .map((r) => ({ id: String(r.id), memberId: r.member_id ?? null, guestName: r.guest_name ?? null }));
      const list: CheckMember[] = asList(members).map((m) => ({
        id: Number(m.id),
        name: [m.first_name, m.last_name].filter(Boolean).join(' ') || `#${m.id}`,
      }));
      return {
        session: s
          ? {
              id: String((s as any).id),
              title: (s as any).title ?? null,
              date: String((s as any).session_date).slice(0, 10),
              type: ((s as any).session_type ?? 'service') as SessionType,
              headcount: (s as any).headcount != null ? Number((s as any).headcount) : null,
              note: (s as any).note ?? null,
            }
          : null,
        records,
        members: list,
      };
    },
  });

export const useToggleMember = (sessionId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, recordId }: { memberId: number; recordId: string | null }) => {
      if (recordId) {
        const { error } = await supabase.from('attendance_records').delete().eq('id', recordId);
        if (error) throw new Error(error.message || 'Nie udało się odznaczyć.');
      } else {
        const { error } = await (supabase.from('attendance_records') as any).insert({
          session_id: sessionId,
          member_id: memberId,
          present: true,
        });
        if (error) throw new Error(error.message || 'Nie udało się zaznaczyć.');
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
  });
};

export const useAddGuest = (sessionId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { error } = await (supabase.from('attendance_records') as any).insert({
        session_id: sessionId,
        guest_name: name,
        present: true,
      });
      if (error) throw new Error(error.message || 'Nie udało się dodać gościa.');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
  });
};

export const useRemoveRecord = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (recordId: string) => {
      const { error } = await supabase.from('attendance_records').delete().eq('id', recordId);
      if (error) throw new Error(error.message || 'Nie udało się usunąć.');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
  });
};
