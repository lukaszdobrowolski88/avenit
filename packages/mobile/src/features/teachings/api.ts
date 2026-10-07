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
  // Klucz wiersza: `ev_<id>` (kazanie zapisane na wydarzeniu) albo `prog_<id>` (stary program).
  programId: string;
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

const hasTeaching = (t: any) => !!(t && typeof t === 'object' && (t.title || t.speaker_id));

interface CampusScope {
  selectedCampusId: number | null;
  withCampusFilter: <T>(query: T) => T;
}

export const useTeachings = ({ selectedCampusId, withCampusFilter }: CampusScope) =>
  useQuery({
    queryKey: ['teachings', selectedCampusId],
    queryFn: async (): Promise<ProgramTeaching[]> => {
      // Od 2026-10 kazanie żyje na wydarzeniu (events.assignments.teaching — jak grafik Nauczania
      // w webie); starsze dane w programs.teaching czytamy jako zapas (także przez program_id).
      const [evRes, progRes] = await Promise.all([
        withCampusFilter(supabase.from('events').select('id, date, assignments, program_id'))
          .order('date', { ascending: false })
          .limit(160),
        withCampusFilter(supabase.from('programs').select('id, date, teaching'))
          .order('date', { ascending: false })
          .limit(80),
      ]);
      if (evRes.error) throw evRes.error;
      if (progRes.error) throw progRes.error;

      const programs = (progRes.data ?? []) as any[];
      const progById = new Map(programs.map((p) => [String(p.id), p]));
      const usedPrograms = new Set<string>();
      const rows: { key: string; date: string; teaching: any }[] = [];
      for (const ev of (evRes.data ?? []) as any[]) {
        const own = ev.assignments && typeof ev.assignments === 'object' ? ev.assignments.teaching : null;
        const prog = ev.program_id != null ? progById.get(String(ev.program_id)) : null;
        const teaching = hasTeaching(own) ? own : hasTeaching(prog?.teaching) ? prog.teaching : null;
        if (prog) usedPrograms.add(String(prog.id));
        if (teaching && ev.date) rows.push({ key: `ev_${ev.id}`, date: String(ev.date).slice(0, 10), teaching });
      }
      for (const p of programs) {
        if (usedPrograms.has(String(p.id)) || !hasTeaching(p.teaching) || !p.date) continue;
        rows.push({ key: `prog_${p.id}`, date: String(p.date).slice(0, 10), teaching: p.teaching });
      }
      rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
      const withTeaching = rows.map((r) => ({ id: r.key, date: r.date, teaching: r.teaching }));
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
