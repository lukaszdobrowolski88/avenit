import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { Program, ProgramScheduleItem } from '../../lib/domain';

export interface ProgramListItem {
  id: number;
  date: string;
  title: string | null;
  type_id: number | null;
  schedule: unknown[] | null;
  type?: { id: number; name: string; color: string | null } | null;
  campus_id?: number | null;
}

interface CampusScope {
  selectedCampusId: number | null;
  withCampusFilter: <T>(query: T) => T;
}

export const useUpcomingPrograms = ({ selectedCampusId, withCampusFilter }: CampusScope) =>
  useQuery({
    queryKey: ['programs', 'upcoming', selectedCampusId],
    queryFn: async (): Promise<ProgramListItem[]> => {
      const today = new Date().toISOString().slice(0, 10);
      const base = supabase
        .from('programs')
        .select('id, date, title, type_id, schedule, campus_id, type:program_types(id, name, color)');
      const { data, error } = await withCampusFilter(base)
        .gte('date', today)
        .order('date', { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as ProgramListItem[];
    },
  });

export interface ProgramTypeRow {
  id: number;
  name: string;
  color: string | null;
  icon: string | null;
  sort_order: number | null;
}

export const useProgramTypes = () =>
  useQuery({
    queryKey: ['program_types'],
    queryFn: async (): Promise<ProgramTypeRow[]> => {
      const { data, error } = await supabase
        .from('program_types')
        .select('id, name, color, icon, sort_order')
        .order('sort_order', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as ProgramTypeRow[];
    },
  });

export const useProgramDetail = (id: string | number) =>
  useQuery({
    queryKey: ['programs', 'detail', id],
    queryFn: async (): Promise<(Program & { schedule: ProgramScheduleItem[] }) | null> => {
      const { data, error } = await supabase
        .from('programs')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as any;
      return { ...row, schedule: asSchedule(row.schedule) };
    },
    enabled: id != null && id !== '',
  });

export interface SongSuggestionRow {
  id: string;
  song_id: number;
  song_key: string | null;
  note: string | null;
  sort_order: number;
  song: { id: number; title: string; key: string | null } | null;
}

export interface MyAssignmentRow {
  id: string;
  program_id: number;
  role_key: string | null;
  team_type: string | null;
  status: 'pending' | 'accepted' | 'rejected';
}

export const useMyAssignments = (programId: string | number, email: string | null) =>
  useQuery({
    queryKey: ['assignments', 'my', programId, email],
    queryFn: async (): Promise<MyAssignmentRow[]> => {
      if (!email) return [];
      const { data, error } = await supabase
        .from('schedule_assignments')
        .select('id, program_id, role_key, team_type, status')
        .eq('program_id', programId)
        .eq('assigned_email', email);
      if (error) throw error;
      return (data ?? []) as MyAssignmentRow[];
    },
    enabled: !!email && programId != null && programId !== '',
  });

export const useUpdateAssignmentStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'accepted' | 'rejected' }) => {
      const { error } = await (supabase.from('schedule_assignments') as any)
        .update({ status, responded_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      // Zakładka „Zespół" (useProgramTeam) też pokazuje status — odśwież ją.
      qc.invalidateQueries({ queryKey: ['programs', 'team'] });
    },
  });
};

export interface ProgramTeamMember {
  id: string;
  team_type: string;
  role_key: string;
  assigned_name: string;
  assigned_email: string | null;
  status: 'pending' | 'accepted' | 'rejected';
}

export const useProgramTeam = (programId: string | number) =>
  useQuery({
    queryKey: ['programs', 'team', programId],
    queryFn: async (): Promise<ProgramTeamMember[]> => {
      const { data, error } = await supabase
        .from('schedule_assignments')
        .select('id, team_type, role_key, assigned_name, assigned_email, status')
        .eq('program_id', programId)
        .order('team_type', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProgramTeamMember[];
    },
    enabled: programId != null && programId !== '',
  });

// ── Tworzenie i edycja programów (jak web ProgramsList/ProgramDetail) ──────────

const asSchedule = (raw: unknown): ProgramScheduleItem[] => {
  const v = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  return Array.isArray(v) ? (v as ProgramScheduleItem[]) : [];
};

const invalidatePrograms = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['programs'] });
  qc.invalidateQueries({ queryKey: ['event-detail'] });
  qc.invalidateQueries({ queryKey: ['agenda'] });
  qc.invalidateQueries({ queryKey: ['dashboard'] });
};

// Minione programy (archiwum) — od najnowszych.
export const usePastPrograms = ({ selectedCampusId, withCampusFilter }: CampusScope, enabled: boolean) =>
  useQuery({
    queryKey: ['programs', 'past', selectedCampusId],
    enabled,
    queryFn: async (): Promise<ProgramListItem[]> => {
      const today = new Date().toISOString().slice(0, 10);
      const base = supabase
        .from('programs')
        .select('id, date, title, type_id, schedule, campus_id, type:program_types(id, name, color)');
      const { data, error } = await withCampusFilter(base).lt('date', today).order('date', { ascending: false }).limit(60);
      if (error) throw error;
      return (data ?? []) as unknown as ProgramListItem[];
    },
  });

// Wydarzenia z podpiętymi programami: program_id → [{id, title, date}] (do list i ekranu programu).
export interface LinkedEvent {
  id: number;
  title: string;
  date: string;
  time: string | null;
  programId: number;
}
export const useProgramEventLinks = () =>
  useQuery({
    queryKey: ['programs', 'event-links'],
    queryFn: async (): Promise<LinkedEvent[]> => {
      const { data, error } = await supabase
        .from('events')
        .select('id, title, date, time, program_id')
        .not('program_id', 'is', null)
        .order('date', { ascending: false })
        .limit(500);
      if (error) return [];
      return ((data ?? []) as any[]).map((e) => ({
        id: Number(e.id),
        title: e.title || 'Wydarzenie',
        date: String(e.date).slice(0, 10),
        time: e.time ? String(e.time).slice(0, 5) : null,
        programId: Number(e.program_id),
      }));
    },
  });

// Wydarzenia w okolicy daty (do podpinania programu).
export const useEventsAround = (ymd: string | null, enabled: boolean) =>
  useQuery({
    queryKey: ['programs', 'events-around', ymd],
    enabled: enabled && !!ymd,
    queryFn: async (): Promise<(LinkedEvent & { hasProgram: boolean })[]> => {
      const d = new Date(`${ymd}T12:00:00`);
      const from = new Date(d);
      from.setDate(d.getDate() - 14);
      const to = new Date(d);
      to.setDate(d.getDate() + 14);
      const ymdOf = (x: Date) => x.toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('events')
        .select('id, title, date, time, program_id')
        .gte('date', ymdOf(from))
        .lte('date', ymdOf(to))
        .order('date', { ascending: true })
        .limit(200);
      if (error) return [];
      return ((data ?? []) as any[]).map((e) => ({
        id: Number(e.id),
        title: e.title || 'Wydarzenie',
        date: String(e.date).slice(0, 10),
        time: e.time ? String(e.time).slice(0, 5) : null,
        programId: e.program_id == null ? 0 : Number(e.program_id),
        hasProgram: e.program_id != null,
      }));
    },
  });

// Programy w okolicy daty (do wyboru istniejącego programu na wydarzeniu).
export const useProgramsAround = (ymd: string | null, enabled: boolean) =>
  useQuery({
    queryKey: ['programs', 'around', ymd],
    enabled: enabled && !!ymd,
    queryFn: async (): Promise<ProgramListItem[]> => {
      const d = new Date(`${ymd}T12:00:00`);
      const from = new Date(d);
      from.setDate(d.getDate() - 30);
      const to = new Date(d);
      to.setDate(d.getDate() + 30);
      const ymdOf = (x: Date) => x.toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('programs')
        .select('id, date, title, type_id, schedule, campus_id, type:program_types(id, name, color)')
        .gte('date', ymdOf(from))
        .lte('date', ymdOf(to))
        .order('date', { ascending: true })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as ProgramListItem[];
    },
  });

export interface ProgramHeaderInput {
  title: string | null;
  date: string;
  typeId: number | null;
}

// Nowy program (pusty plan) + opcjonalne podpięcie do wydarzenia. Zwraca id.
export const useCreateProgram = (userEmail: string | null, campusIdForInsert: number | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProgramHeaderInput & { eventId?: number | null }): Promise<number> => {
      const { data, error } = await (supabase.from('programs') as any)
        .insert([
          {
            title: input.title,
            date: input.date,
            type_id: input.typeId,
            schedule: [],
            song_ids: [],
            campus_id: campusIdForInsert,
            created_by: userEmail,
          },
        ])
        .select('id')
        .single();
      if (error) throw new Error(error.message || 'Nie udało się utworzyć programu.');
      const id = Number((data as any).id);
      if (input.eventId) {
        const { error: linkErr } = await (supabase.from('events') as any).update({ program_id: id }).eq('id', input.eventId);
        if (linkErr) throw new Error(`Program utworzony, ale nie udało się podpiąć go do wydarzenia: ${linkErr.message}`);
      }
      return id;
    },
    onSuccess: () => invalidatePrograms(qc),
  });
};

export const useUpdateProgramHeader = (programId: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProgramHeaderInput) => {
      const { error } = await (supabase.from('programs') as any)
        .update({ title: input.title, date: input.date, type_id: input.typeId })
        .eq('id', programId);
      if (error) throw new Error(error.message || 'Nie udało się zapisać programu.');
    },
    onSuccess: () => invalidatePrograms(qc),
  });
};

// Zapis planu — od razu po każdej zmianie, z optymistyczną aktualizacją ekranu
// (przy błędzie wraca poprzedni stan).
export const useSaveSchedule = (programId: number) => {
  const qc = useQueryClient();
  const key = ['programs', 'detail', String(programId)];
  return useMutation({
    mutationFn: async (schedule: ProgramScheduleItem[]) => {
      const { error } = await (supabase.from('programs') as any).update({ schedule }).eq('id', programId);
      if (error) throw new Error(error.message || 'Nie udało się zapisać planu.');
    },
    onMutate: async (schedule) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData(key);
      qc.setQueryData(key, (old: any) => (old ? { ...old, schedule } : old));
      return { prev };
    },
    onError: (_e, _s, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['programs', 'upcoming'] });
      qc.invalidateQueries({ queryKey: ['programs', 'past'] });
      qc.invalidateQueries({ queryKey: ['event-detail'] });
    },
  });
};

// Usunięcie programu — events.program_id nie ma klucza obcego, więc najpierw odpinamy
// program od wydarzeń (inaczej zostałyby martwe odnośniki).
export const useDeleteProgram = (programId: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await (supabase.from('events') as any).update({ program_id: null }).eq('program_id', programId);
      const { error } = await supabase.from('programs').delete().eq('id', programId);
      if (error) throw new Error(error.message || 'Nie udało się usunąć programu.');
    },
    onSuccess: () => invalidatePrograms(qc),
  });
};

// Podpięcie / odpięcie programu na wydarzeniu (events.program_id).
export const useLinkProgram = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ eventId, programId }: { eventId: number; programId: number | null }) => {
      const { error } = await (supabase.from('events') as any).update({ program_id: programId }).eq('id', eventId);
      if (error) throw new Error(error.message || 'Nie udało się zmienić programu wydarzenia.');
    },
    onSuccess: () => invalidatePrograms(qc),
  });
};

export { asSchedule };

// Tytuły/tonacje pieśni z planu (starsze elementy mogą mieć tylko songId).
export const useSongTitles = (ids: (number | string)[]) => {
  const uniq = Array.from(new Set(ids.map(String))).sort();
  return useQuery({
    queryKey: ['programs', 'song-titles', uniq.join(',')],
    enabled: uniq.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<Record<string, { title: string; key: string | null }>> => {
      const { data, error } = await supabase.from('songs').select('id, title, key').in('id', uniq.map(Number));
      if (error) return {};
      return Object.fromEntries(((data ?? []) as any[]).map((s) => [String(s.id), { title: String(s.title ?? ''), key: s.key ?? null }]));
    },
  });
};
