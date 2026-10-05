import { Image as ImageIcon, MoreHorizontal, Music, Type as TypeIcon, type LucideIcon } from 'lucide-react-native';
import type { ProgramScheduleItem } from '../../lib/domain';

// Element planu programu — ten sam kształt co web (ProgramDetail.createScheduleItem),
// żeby plan edytowany w telefonie i w przeglądarce był jednym planem.
export type ScheduleKind = 'item' | 'header' | 'song' | 'media';

export type PlanItem = ProgramScheduleItem & {
  person?: string | null;
  details?: string | null;
  songKey?: string | null;
  timing?: 'before' | 'during' | 'after' | null;
  teamAssignments?: Record<string, string>;
  mediaType?: 'video' | 'presentation' | 'image' | 'countdown' | null;
  mediaUrl?: string | null;
};

export const MEDIA_TYPES: { value: 'video' | 'presentation' | 'image' | 'countdown'; label: string }[] = [
  { value: 'video', label: 'Wideo' },
  { value: 'presentation', label: 'Prezentacja' },
  { value: 'image', label: 'Obraz' },
  { value: 'countdown', label: 'Odliczanie' },
];

export const KIND_META: Record<ScheduleKind, { label: string; Icon: LucideIcon }> = {
  item: { label: 'Element', Icon: TypeIcon },
  header: { label: 'Nagłówek', Icon: MoreHorizontal },
  song: { label: 'Pieśń', Icon: Music },
  media: { label: 'Media', Icon: ImageIcon },
};

export const TIMING: { value: 'before' | 'during' | 'after'; label: string }[] = [
  { value: 'before', label: 'Przed' },
  { value: 'during', label: 'W trakcie' },
  { value: 'after', label: 'Po' },
];

export const MUSICAL_KEYS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];

// Id jak na webie (Date.now()) — liczba, unikalna w obrębie planu.
let seq = 0;
export const newItemId = () => Date.now() * 10 + (seq++ % 10);

export const newPlanItem = (kind: ScheduleKind): PlanItem => ({
  id: newItemId() as unknown as string,
  type: kind,
  title: kind === 'header' ? 'NOWA SEKCJA' : '',
  person: '',
  details: '',
  notes: '',
  duration: kind === 'header' ? 0 : 180,
  timing: 'during',
  songId: null,
  songKey: null,
  teamAssignments: {},
});

// Czas trwania (sekundy) jako „3 min” / „1 h 15 min” / „2:30”.
export const fmtDuration = (sec: number | null | undefined) => {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if (!s) return '';
  if (s % 60) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const m = s / 60;
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
};

export const totalSeconds = (items: PlanItem[]) => items.reduce((s, it) => s + (Number(it?.duration) || 0), 0);
