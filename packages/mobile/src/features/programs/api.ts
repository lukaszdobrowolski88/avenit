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
      const schedule = Array.isArray(row.schedule) ? (row.schedule as ProgramScheduleItem[]) : [];
      return { ...row, schedule };
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

export const useProgramSuggestions = (programId: string | number) =>
  useQuery({
    queryKey: ['programs', 'suggestions', programId],
    queryFn: async (): Promise<SongSuggestionRow[]> => {
      const { data, error } = await supabase
        .from('program_song_suggestions')
        .select('id, song_id, song_key, note, sort_order, song:songs(id, title, key)')
        .eq('program_id', programId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as SongSuggestionRow[];
    },
    enabled: programId != null && programId !== '',
  });

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
