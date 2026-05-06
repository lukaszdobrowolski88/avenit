import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export interface TeachingSpeaker {
  id: string;
  name: string;
  email: string | null;
  bio: string | null;
  photo_url: string | null;
}

export interface TeachingSeries {
  id: string;
  name: string;
  description: string | null;
  scripture: string | null;
  start_date: string | null;
  end_date: string | null;
  graphics: unknown[] | null;
}

export interface ProgramTeaching {
  programId: number;
  date: string;
  title: string | null;
  scripture: string | null;
  mainPoint: string | null;
  notes: string | null;
  speaker: TeachingSpeaker | null;
  series: TeachingSeries | null;
  youtubeUrl: string | null;
  spotifyUrl: string | null;
  audioUrl: string | null;
}

interface CampusScope {
  selectedCampusId: number | null;
  withCampusFilter: <T>(query: T) => T;
}

export const useTeachings = ({ selectedCampusId, withCampusFilter }: CampusScope) =>
  useQuery({
    queryKey: ['teachings', selectedCampusId],
    queryFn: async (): Promise<ProgramTeaching[]> => {
      const base = supabase.from('programs').select('id, date, teaching');
      const { data, error } = await withCampusFilter(base)
        .order('date', { ascending: false })
        .limit(80);
      if (error) throw error;

      const withTeaching = (data ?? []).filter(
        (p: any) => p.teaching && (p.teaching.title || p.teaching.speaker_id),
      );
      const speakerIds = new Set<string>();
      const seriesIds = new Set<string>();
      for (const p of withTeaching as any[]) {
        if (p.teaching?.speaker_id) speakerIds.add(p.teaching.speaker_id);
        if (p.teaching?.series_id) seriesIds.add(p.teaching.series_id);
      }

      const [speakersRes, seriesRes] = await Promise.all([
        speakerIds.size > 0
          ? supabase.from('teaching_speakers').select('*').in('id', Array.from(speakerIds))
          : Promise.resolve({ data: [], error: null }),
        seriesIds.size > 0
          ? supabase.from('teaching_series').select('*').in('id', Array.from(seriesIds))
          : Promise.resolve({ data: [], error: null }),
      ]);

      const speakerMap = new Map<string, TeachingSpeaker>(
        ((speakersRes.data ?? []) as any[]).map((s) => [s.id, s as TeachingSpeaker]),
      );
      const seriesMap = new Map<string, TeachingSeries>(
        ((seriesRes.data ?? []) as any[]).map((s) => [s.id, s as TeachingSeries]),
      );

      return (withTeaching as any[]).map(
        (p): ProgramTeaching => ({
          programId: p.id,
          date: p.date,
          title: p.teaching?.title ?? null,
          scripture: p.teaching?.scripture ?? null,
          mainPoint: p.teaching?.main_point ?? null,
          notes: p.teaching?.notes ?? null,
          speaker: p.teaching?.speaker_id
            ? speakerMap.get(p.teaching.speaker_id) ?? null
            : null,
          series: p.teaching?.series_id ? seriesMap.get(p.teaching.series_id) ?? null : null,
          youtubeUrl: p.teaching?.youtube_url ?? null,
          spotifyUrl: p.teaching?.spotify_url ?? null,
          audioUrl: p.teaching?.audio_url ?? null,
        }),
      );
    },
  });
