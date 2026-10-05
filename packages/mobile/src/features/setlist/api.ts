import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

// „Planowane pieśni" (read-only) — przez fn program-songs-preview (member-scoped;
// członek służby nie ma grantu res:program_song_suggestions:read).
export interface PlannedSong {
  songId?: number | null; // starsze API nie zwraca
  title: string;
  key: string | null;
  note: string | null;
}

export interface PlannedProgram {
  id: number;
  title: string | null;
  date: string; // YYYY-MM-DD
  songs: PlannedSong[];
}

export const usePlannedSongs = () =>
  useQuery({
    queryKey: ['setlist', 'planned'],
    queryFn: async (): Promise<PlannedProgram[]> => {
      const { data, error } = await supabase.functions.invoke('program-songs-preview', { body: {} });
      if (error) throw new Error(error.message || 'Nie udało się pobrać planowanych pieśni.');
      return (((data as any)?.programs ?? []) as PlannedProgram[]);
    },
  });
