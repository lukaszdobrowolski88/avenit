import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { Lineup } from './lineup';

// Zapisane składy służby (tabela schedule_templates, migracja 090) — jak TemplatesModal na webie.
// Zapis/usuwanie: serwer (sharedWrites) wymaga dostępu do modułu zespołu (module:<team>),
// created_by uzupełnia sam. lineup: { roleKey: ['Imię Nazwisko', …] }.

export interface ScheduleTemplate {
  id: string;
  name: string;
  lineup: Lineup;
}

const KEY = (team: string) => ['team', team, 'schedule-templates'] as const;

const parseLineup = (v: unknown): Lineup => {
  let x: unknown = v;
  if (typeof x === 'string') {
    try {
      x = JSON.parse(x);
    } catch {
      x = {};
    }
  }
  if (!x || typeof x !== 'object' || Array.isArray(x)) return {};
  const out: Lineup = {};
  for (const [k, names] of Object.entries(x as Record<string, unknown>)) {
    if (Array.isArray(names)) out[k] = names.map(String).filter(Boolean);
  }
  return out;
};

// null = tabela niedostępna (np. tenant przed migracją 090) → bez funkcji, jak na webie.
export const useScheduleTemplates = (team: string, enabled = true) =>
  useQuery({
    queryKey: KEY(team),
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<ScheduleTemplate[] | null> => {
      const { data, error } = await supabase.from('schedule_templates').select('*').eq('team_type', team).order('name');
      if (error) return null;
      return ((data ?? []) as any[]).map((t) => ({ id: String(t.id), name: String(t.name ?? ''), lineup: parseLineup(t.lineup) }));
    },
  });

export const useSaveTemplate = (team: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, lineup }: { name: string; lineup: Lineup }) => {
      const { error } = await (supabase.from('schedule_templates') as any).insert({ team_type: team, name, lineup });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY(team) }),
  });
};

export const useDeleteTemplate = (team: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('schedule_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY(team) }),
  });
};
