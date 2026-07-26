import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

// Moduł „Kazania" (member-facing) — czyta tabelę `sermons` (tylko is_published=true).
// Tabelę tworzy migracja web osobno, dlatego brak tabeli obsługujemy jako pusty stan.

export interface Sermon {
  id: string;
  title: string;
  speaker: string | null;
  series: string | null;
  sermon_date: string | null;
  scripture_ref: string | null;
  description: string | null;
  audio_url: string | null;
  video_url: string | null;
  notes: string | null;
  is_published: boolean;
}

const SERMON_COLUMNS =
  'id, title, speaker, series, sermon_date, scripture_ref, description, audio_url, video_url, notes, is_published';

const isMissingTable = (err: unknown): boolean => {
  const e = err as { code?: string; message?: string } | null;
  const code = e?.code ?? '';
  const msg = (e?.message ?? '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    code === 'PGRST202' ||
    msg.includes('does not exist') ||
    msg.includes('could not find')
  );
};

interface CampusScope {
  selectedCampusId: number | null;
  withCampusFilter: <T>(query: T) => T;
}

export const useSermons = ({ selectedCampusId, withCampusFilter }: CampusScope) =>
  useQuery({
    queryKey: ['sermons', selectedCampusId],
    queryFn: async (): Promise<Sermon[]> => {
      try {
        const base = supabase.from('sermons').select(SERMON_COLUMNS).eq('is_published', true);
        const { data, error } = await withCampusFilter(base)
          .order('sermon_date', { ascending: false })
          .limit(100);
        if (error) throw error;
        return (data ?? []) as Sermon[];
      } catch (err) {
        if (isMissingTable(err)) return [];
        throw err;
      }
    },
  });

export const useSermon = (id: string) =>
  useQuery({
    queryKey: ['sermons', 'detail', id],
    queryFn: async (): Promise<Sermon | null> => {
      try {
        const { data, error } = await supabase
          .from('sermons')
          .select(SERMON_COLUMNS)
          .eq('id', id)
          .maybeSingle();
        if (error) throw error;
        return (data ?? null) as Sermon | null;
      } catch (err) {
        if (isMissingTable(err)) return null;
        throw err;
      }
    },
    enabled: id != null && id !== '',
  });
