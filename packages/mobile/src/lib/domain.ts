// Inline'owana zawartość `@church/domain` — schemy, transpozycja akordów, format dat.
// Plan zakładał, że nie tworzymy osobnego `@schtomy/domain` pakietu — wszystko trzymamy w mobile.

import { z } from 'zod';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { pl } from 'date-fns/locale';

// =============================================================================
// CHORDS / TRANSPOSE
// =============================================================================

export const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
export type Key = (typeof KEYS)[number];

export const SCALE_DEGREES: Record<string, string[]> = {
  C: ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
  'C#': ['C#', 'D#', 'E#', 'F#', 'G#', 'A#', 'B#'],
  Db: ['Db', 'Eb', 'F', 'Gb', 'Ab', 'Bb', 'C'],
  D: ['D', 'E', 'F#', 'G', 'A', 'B', 'C#'],
  Eb: ['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D'],
  E: ['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#'],
  F: ['F', 'G', 'A', 'Bb', 'C', 'D', 'E'],
  'F#': ['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#'],
  Gb: ['Gb', 'Ab', 'Bb', 'Cb', 'Db', 'Eb', 'F'],
  G: ['G', 'A', 'B', 'C', 'D', 'E', 'F#'],
  Ab: ['Ab', 'Bb', 'C', 'Db', 'Eb', 'F', 'G'],
  A: ['A', 'B', 'C#', 'D', 'E', 'F#', 'G#'],
  Bb: ['Bb', 'C', 'D', 'Eb', 'F', 'G', 'A'],
  B: ['B', 'C#', 'D#', 'E', 'F#', 'G#', 'A#'],
};

export const DEGREE_LABELS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
export const DEFAULT_CHORD_TYPES = ['', 'm', 'm', '', '', 'm', 'dim'];

const CHROMATIC_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const CHROMATIC_NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export const ENHARMONIC_MAP: Record<string, string> = {
  'C#': 'Db', Db: 'C#',
  'D#': 'Eb', Eb: 'D#',
  'E#': 'F', Fb: 'E',
  'F#': 'Gb', Gb: 'F#',
  'G#': 'Ab', Ab: 'G#',
  'A#': 'Bb', Bb: 'A#',
  'B#': 'C', Cb: 'B',
};

export const SHARP_KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
export const FLAT_KEYS = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'];

export interface ParsedChord {
  root: string;
  modifier: string;
  bass: string | null;
}

export const normalizeChord = (chord: string): string => {
  if (!chord || typeof chord !== 'string') return chord;
  let normalized = chord;
  let prev: string;
  do {
    prev = normalized;
    normalized = normalized.replace(/#b|b#/g, '');
  } while (normalized !== prev);
  if (normalized.length === 0) return chord;
  return normalized;
};

export const parseChord = (chord: string): ParsedChord | null => {
  if (!chord || typeof chord !== 'string') return null;
  const match = chord.match(/^([A-G][#b]?)(.*)$/);
  if (!match) return null;
  const root = match[1];
  const rest = match[2];
  const slashIndex = rest.indexOf('/');
  if (slashIndex !== -1) {
    return { root, modifier: rest.substring(0, slashIndex), bass: rest.substring(slashIndex + 1) };
  }
  return { root, modifier: rest, bass: null };
};

export const getNoteIndex = (note: string): number => {
  const noteUpper = note.charAt(0).toUpperCase();
  const accidental = note.substring(1);
  const baseMap: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let baseIndex = baseMap[noteUpper];
  if (baseIndex === undefined) return -1;
  if (accidental === '#') baseIndex = (baseIndex + 1) % 12;
  else if (accidental === 'b') baseIndex = (baseIndex + 11) % 12;
  else if (accidental === '##') baseIndex = (baseIndex + 2) % 12;
  else if (accidental === 'bb') baseIndex = (baseIndex + 10) % 12;
  return baseIndex;
};

export const getNoteForKey = (noteIndex: number, targetKey: string): string => {
  const targetScale = SCALE_DEGREES[targetKey];
  if (targetScale) {
    for (const note of targetScale) {
      if (getNoteIndex(note) === noteIndex) return note;
    }
  }
  return SHARP_KEYS.includes(targetKey)
    ? CHROMATIC_NOTES[noteIndex]
    : CHROMATIC_NOTES_FLAT[noteIndex];
};

export const transposeNote = (note: string, semitones: number, targetKey: string): string => {
  const noteIndex = getNoteIndex(note);
  if (noteIndex === -1) return note;
  const newIndex = (noteIndex + semitones + 12) % 12;
  return getNoteForKey(newIndex, targetKey);
};

export const transposeChord = (chord: string, fromKey: string, toKey: string): string => {
  const parsed = parseChord(chord);
  if (!parsed) return chord;
  const fromIndex = getNoteIndex(fromKey);
  const toIndex = getNoteIndex(toKey);
  const semitones = toIndex - fromIndex;
  const newRoot = transposeNote(parsed.root, semitones, toKey);
  let result = newRoot + parsed.modifier;
  if (parsed.bass) {
    const newBass = transposeNote(parsed.bass, semitones, toKey);
    result += '/' + newBass;
  }
  return normalizeChord(result);
};

// =============================================================================
// FORMAT / DATE
// =============================================================================

export const formatDate = (date: Date | string, fmt = 'd MMM yyyy') => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, fmt, { locale: pl });
};

export const formatDateTime = (date: Date | string) => formatDate(date, 'd MMM yyyy, HH:mm');

export const formatRelative = (date: Date | string) => {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return formatDistanceToNow(d, { addSuffix: true, locale: pl });
};

export const WEEKDAYS_PL = [
  'Niedziela',
  'Poniedziałek',
  'Wtorek',
  'Środa',
  'Czwartek',
  'Piątek',
  'Sobota',
];

// =============================================================================
// SCHEMAS — Song
// =============================================================================

export const SongSchema = z.object({
  id: z.number(),
  title: z.string(),
  key: z.string().nullable().optional(),
  tempo: z.number().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  lyrics: z.string().nullable().optional(),
  chords_bars: z.unknown().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type Song = z.infer<typeof SongSchema>;

export const ProgramSongSuggestionSchema = z.object({
  id: z.union([z.string(), z.number()]),
  program_id: z.number(),
  song_id: z.number(),
  song_key: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  sort_order: z.number().default(0),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type ProgramSongSuggestion = z.infer<typeof ProgramSongSuggestionSchema>;

// =============================================================================
// SCHEMAS — Program
// =============================================================================

export const ScheduleItemTypeSchema = z.enum(['item', 'header', 'song', 'media']);
export type ScheduleItemType = z.infer<typeof ScheduleItemTypeSchema>;

export const ScheduleAttachmentSchema = z.object({
  name: z.string(),
  url: z.string(),
  date: z.string().optional(),
});

export type ScheduleAttachment = z.infer<typeof ScheduleAttachmentSchema>;

export const ProgramScheduleItemSchema = z
  .object({
    id: z.string(),
    type: ScheduleItemTypeSchema,
    title: z.string().nullable().optional(),
    songId: z.union([z.number(), z.string()]).nullable().optional(),
    duration: z.number().nullable().optional(),
    notes: z.string().nullable().optional(),
    customAttachments: z.array(ScheduleAttachmentSchema).nullable().optional(),
  })
  .passthrough();

export type ProgramScheduleItem = z.infer<typeof ProgramScheduleItemSchema>;

export const ProgramSchema = z
  .object({
    id: z.number(),
    date: z.string(),
    title: z.string().nullable().optional(),
    type_id: z.number().nullable().optional(),
    schedule: z.array(ProgramScheduleItemSchema).nullable().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
  })
  .passthrough();

export type Program = z.infer<typeof ProgramSchema>;

export const formatTime = (seconds: number | null | undefined): string => {
  if (!seconds || seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

export const calculateTotalTime = (
  schedule: ProgramScheduleItem[] | null | undefined,
): number => (schedule ?? []).reduce((sum, it) => sum + (it.duration ?? 0), 0);
