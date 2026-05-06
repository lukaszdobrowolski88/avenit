import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import type { Song } from '../../lib/domain';

export interface UpcomingProgram {
  id: number;
  title: string | null;
  date: string;
  schedule: unknown[] | null;
}

export const useSongsList = (search: string = '') =>
  useQuery({
    queryKey: ['songs', 'list', search],
    queryFn: async (): Promise<Song[]> => {
      let q = supabase
        .from('songs')
        .select('id, title, key, tempo, tags')
        .order('title', { ascending: true })
        .limit(200);
      if (search.trim()) {
        q = q.ilike('title', `%${search.trim()}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Song[];
    },
  });

export const useSongDetail = (id: string | number) =>
  useQuery({
    queryKey: ['songs', 'detail', id],
    queryFn: async (): Promise<Song | null> => {
      const { data, error } = await supabase
        .from('songs')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Song | null;
    },
    enabled: id != null && id !== '',
  });

export const useUpcomingPrograms = (enabled: boolean) =>
  useQuery({
    queryKey: ['upcomingPrograms'],
    queryFn: async (): Promise<UpcomingProgram[]> => {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('programs')
        .select('id, title, date, schedule')
        .gte('date', today)
        .order('date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as UpcomingProgram[];
    },
    enabled,
    staleTime: 30 * 1000,
  });

export const useSongProgramAssignments = (
  songId: number | string | null | undefined,
  enabled: boolean,
) =>
  useQuery({
    queryKey: ['songProgramAssignments', songId],
    queryFn: async (): Promise<Set<number>> => {
      if (songId == null || songId === '') return new Set();
      const { data, error } = await supabase
        .from('program_song_suggestions')
        .select('program_id')
        .eq('song_id', songId);
      if (error) {
        if ((error as any).code === '42P01') return new Set();
        throw error;
      }
      return new Set((data ?? []).map((r: any) => r.program_id as number));
    },
    enabled: enabled && songId != null && songId !== '',
  });

export interface AddSongToProgramInput {
  programId: number;
  songId: number | string;
  songKey: string | null;
  note: string | null;
}

export const useAddSongToProgram = (createdByEmail: string | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddSongToProgramInput) => {
      const { data: existing } = await supabase
        .from('program_song_suggestions')
        .select('sort_order')
        .eq('program_id', input.programId)
        .order('sort_order', { ascending: false })
        .limit(1);
      const nextOrder =
        existing && (existing as any[])[0]?.sort_order != null
          ? ((existing as any[])[0].sort_order as number) + 1
          : 0;

      const { error } = await (supabase.from('program_song_suggestions') as any).insert({
        program_id: input.programId,
        song_id: input.songId,
        song_key: input.songKey,
        note: input.note,
        sort_order: nextOrder,
        created_by_email: createdByEmail,
      });
      if (error) {
        if ((error as any).code === '23505') {
          throw new Error('Ta pieśń jest już przypisana do tego programu.');
        }
        throw error;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['songProgramAssignments', vars.songId] });
      qc.invalidateQueries({ queryKey: ['upcomingPrograms'] });
      qc.invalidateQueries({ queryKey: ['programSongs', vars.programId] });
      qc.invalidateQueries({ queryKey: ['programSuggestionCounts'] });
    },
  });
};

export interface ProgramSuggestionRow {
  id: string;
  program_id: number;
  song_id: number;
  song_key: string | null;
  note: string | null;
  sort_order: number;
  created_by_email: string | null;
  song?: { id: number; title: string; key: string | null } | null;
}

export const useProgramSuggestionCounts = (programIds: number[], enabled: boolean) =>
  useQuery({
    queryKey: ['programSuggestionCounts', programIds.slice().sort().join(',')],
    queryFn: async (): Promise<Record<number, number>> => {
      if (programIds.length === 0) return {};
      const { data, error } = await supabase
        .from('program_song_suggestions')
        .select('program_id')
        .in('program_id', programIds);
      if (error) {
        if ((error as any).code === '42P01') return {};
        throw error;
      }
      const out: Record<number, number> = {};
      for (const r of (data ?? []) as any[]) {
        out[r.program_id] = (out[r.program_id] ?? 0) + 1;
      }
      return out;
    },
    enabled: enabled && programIds.length > 0,
    staleTime: 30 * 1000,
  });

export const useProgramSongs = (programId: number | null) =>
  useQuery({
    queryKey: ['programSongs', programId],
    queryFn: async (): Promise<ProgramSuggestionRow[]> => {
      if (programId == null) return [];
      const { data: rows, error } = await supabase
        .from('program_song_suggestions')
        .select('id, program_id, song_id, song_key, note, sort_order, created_by_email')
        .eq('program_id', programId)
        .order('sort_order', { ascending: true });
      if (error) {
        if ((error as any).code === '42P01') return [];
        throw error;
      }
      const suggestions = (rows ?? []) as Array<{
        id: string;
        program_id: number;
        song_id: number;
        song_key: string | null;
        note: string | null;
        sort_order: number | null;
        created_by_email: string | null;
      }>;
      const songIds = Array.from(new Set(suggestions.map((s) => s.song_id)));
      const songsById = new Map<number, { id: number; title: string; key: string | null }>();
      if (songIds.length > 0) {
        const { data: songsData } = await supabase
          .from('songs')
          .select('id, title, key')
          .in('id', songIds);
        for (const s of (songsData ?? []) as any[]) {
          songsById.set(s.id, { id: s.id, title: s.title, key: s.key ?? null });
        }
      }
      return suggestions.map((s) => ({
        id: s.id,
        program_id: s.program_id,
        song_id: s.song_id,
        song_key: s.song_key,
        note: s.note,
        sort_order: s.sort_order ?? 0,
        created_by_email: s.created_by_email,
        song: songsById.get(s.song_id) ?? null,
      }));
    },
    enabled: programId != null,
  });

export const useUpdateSuggestion = (programId: number | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<ProgramSuggestionRow, 'song_key' | 'note' | 'sort_order'>>;
    }) => {
      const { error } = await (supabase.from('program_song_suggestions') as any)
        .update(patch)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['programSongs', programId] });
    },
  });
};

export const useDeleteSuggestion = (programId: number | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('program_song_suggestions')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['programSongs', programId] });
      qc.invalidateQueries({ queryKey: ['programSuggestionCounts'] });
    },
  });
};

export const useReorderSuggestions = (programId: number | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      await Promise.all(
        orderedIds.map((id, idx) =>
          (supabase.from('program_song_suggestions') as any)
            .update({ sort_order: idx })
            .eq('id', id),
        ),
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['programSongs', programId] });
    },
  });
};

export const useSongTags = (songs: Song[] | undefined) =>
  useMemo(() => {
    if (!songs) return [] as { tag: string; count: number }[];
    const counts = new Map<string, number>();
    for (const s of songs) {
      const tags = Array.isArray(s.tags) ? s.tags : [];
      for (const t of tags) {
        if (typeof t === 'string' && t.trim()) {
          counts.set(t, (counts.get(t) ?? 0) + 1);
        }
      }
    }
    return Array.from(counts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }, [songs]);
