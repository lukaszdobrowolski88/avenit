import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

// Baza pieśni — model jak na webie (WorshipModule/SongForm): tekst w `lyrics` (zwykły
// tekst, sekcje oddzielone pustą linią, „pusty slajd” = pusty slajd w prezentacji),
// akordy w `chords_bars` (HTML z edytora taktów weba albo zwykły tekst „| e | e |”),
// materiały w `attachments` [{type:'file'|'link', name, url, description, date}].

export interface SongAttachment {
  type: 'file' | 'link';
  name: string;
  url: string;
  description?: string | null;
  date?: string | null;
}

export interface SongListItem {
  id: number;
  title: string;
  author: string | null;
  key: string | null;
  tempo: string | null;
  meter: string | null;
  tags: string[];
}

export interface SongRecord extends SongListItem {
  lyrics: string | null;
  chordsBars: string | null;
  category: string | null;
  attachments: SongAttachment[];
  sheetMusicUrl: string | null;
}

const asList = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const parseJson = (v: unknown) => {
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};
const str = (v: unknown) => (v == null || v === '' ? null : String(v));

const toListItem = (r: any): SongListItem => ({
  id: Number(r.id),
  title: String(r.title ?? 'Bez tytułu'),
  author: str(r.author) ?? str(r.artist),
  key: str(r.key),
  tempo: r.tempo != null && r.tempo !== '' ? String(r.tempo) : r.bpm != null ? String(r.bpm) : null,
  meter: str(r.meter),
  tags: asList(r.tags).map(String).filter(Boolean),
});

export const useSongLibrary = () =>
  useQuery({
    queryKey: ['songs', 'library'],
    queryFn: async (): Promise<SongListItem[]> => {
      // Cała baza (web też ładuje wszystko) — wcześniej limit 200 ucinał listę.
      const { data, error } = await supabase
        .from('songs')
        .select('id, title, author, key, tempo, meter, tags')
        .order('title', { ascending: true })
        .limit(5000);
      if (error) throw error;
      return ((data ?? []) as any[]).map(toListItem);
    },
  });

export const useSongRecord = (id: number | null) =>
  useQuery({
    queryKey: ['songs', 'record', id],
    enabled: id != null && Number.isFinite(id),
    queryFn: async (): Promise<SongRecord | null> => {
      const { data, error } = await supabase.from('songs').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const r = data as any;
      return {
        ...toListItem(r),
        lyrics: str(r.lyrics),
        chordsBars: str(r.chords_bars) ?? str(r.chords),
        category: str(r.category),
        attachments: asList(parseJson(r.attachments) ?? r.attachments)
          .filter((a) => a && a.url)
          .map((a) => ({
            type: a.type === 'link' ? 'link' : 'file',
            name: String(a.name || 'Załącznik'),
            url: String(a.url),
            description: a.description ?? null,
            date: a.date ?? null,
          })),
        sheetMusicUrl: str(r.sheet_music_url),
      };
    },
  });

// Historia użycia: programy, w których planie jest pieśń. Obsługuje obecny zapis planu
// ({type:'song', songId}) i starsze (selectedSongs / songIds), których web szuka.
export interface SongUse {
  programId: number;
  title: string | null;
  date: string;
  key: string | null;
}
export const useSongUsage = (id: number | null, withCampusFilter?: <T>(q: T) => T) =>
  useQuery({
    queryKey: ['songs', 'usage', id],
    enabled: id != null,
    queryFn: async (): Promise<SongUse[]> => {
      const base = supabase.from('programs').select('id, title, date, schedule');
      const { data, error } = await (withCampusFilter ? withCampusFilter(base) : base).order('date', { ascending: false }).limit(500);
      if (error) return [];
      const out: SongUse[] = [];
      for (const p of (data ?? []) as any[]) {
        const schedule = asList(parseJson(p.schedule) ?? p.schedule);
        let key: string | null = null;
        const hit = schedule.some((it) => {
          if (it?.type === 'song' && Number(it.songId) === id) {
            key = it.songKey ?? null;
            return true;
          }
          if (asList(it?.selectedSongs).some((s) => Number(s?.songId) === id)) return true;
          return asList(it?.songIds).some((s) => Number(s) === id);
        });
        if (hit) out.push({ programId: Number(p.id), title: p.title ?? null, date: String(p.date).slice(0, 10), key });
      }
      return out;
    },
  });

const invalidateSongs = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['songs'] });
  qc.invalidateQueries({ queryKey: ['programs', 'song-titles'] });
};

export interface SongInput {
  title: string;
  author: string | null;
  key: string | null;
  tempo: string | null;
  meter: string | null;
  tags: string[];
  lyrics: string | null;
}

// Zapis pól podstawowych i tekstu (akordy `chords_bars` edytuje się na webie — ich nie
// ruszamy). Zwraca id pieśni.
export const useSaveSong = (id: number | null) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SongInput): Promise<number> => {
      const row = {
        title: input.title,
        author: input.author,
        key: input.key || 'C',
        tempo: input.tempo,
        meter: input.meter,
        tags: input.tags,
        lyrics: input.lyrics,
      };
      if (id != null) {
        const { error } = await (supabase.from('songs') as any).update(row).eq('id', id);
        if (error) throw new Error(error.message || 'Nie udało się zapisać pieśni.');
        return id;
      }
      const { data, error } = await (supabase.from('songs') as any).insert([{ ...row, attachments: [] }]).select('id').single();
      if (error) throw new Error(error.message || 'Nie udało się dodać pieśni.');
      return Number((data as any).id);
    },
    onSuccess: () => invalidateSongs(qc),
  });
};

export const useDeleteSong = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('songs').delete().eq('id', id);
      if (error) throw new Error(error.message || 'Nie udało się usunąć pieśni.');
    },
    onSuccess: () => invalidateSongs(qc),
  });
};

export const useSetSongAttachments = (id: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (attachments: SongAttachment[]) => {
      const { error } = await (supabase.from('songs') as any).update({ attachments }).eq('id', id);
      if (error) throw new Error(error.message || 'Nie udało się zapisać materiałów.');
    },
    onSuccess: () => invalidateSongs(qc),
  });
};

// Tag w całej bazie: zmiana nazwy albo usunięcie (jak „Zarządzaj tagami” na webie —
// osobny zapis każdej pieśni z tym tagiem).
export const useRetagSongs = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ songs, from, to }: { songs: SongListItem[]; from: string; to: string | null }) => {
      const affected = songs.filter((s) => s.tags.includes(from));
      for (const s of affected) {
        const next = Array.from(new Set(s.tags.map((t) => (t === from ? to : t)).filter(Boolean) as string[]));
        const { error } = await (supabase.from('songs') as any).update({ tags: next }).eq('id', s.id);
        if (error) throw new Error(error.message || `Nie udało się zmienić tagów pieśni „${s.title}”.`);
      }
      return affected.length;
    },
    onSuccess: () => invalidateSongs(qc),
  });
};
