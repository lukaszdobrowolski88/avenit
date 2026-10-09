import { useCallback } from 'react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { usePermissions } from '../../lib/permissions';
import { normalizeModuleLabel } from '../modules/nav';

// Nazwy kalendarzy (module_key wydarzenia) — jak web: etykieta modułu z ustawień kościoła,
// a bez niej nazwy systemowe. 'general' = wydarzenia bez modułu.
// (Zapasowe nazwy = domyślne nazwy modułów; nazwa z bazy zawsze wygrywa.)
const CALENDAR_LABELS: Record<string, string> = {
  general: 'Ogólne',
  worship: 'Zespół uwielbienia',
  media: 'MediaTeam',
  atmosfera: 'Atmosfera Team',
  kids: 'Dzieci',
  mc: 'Scena / MC',
  homegroups: 'Grupy domowe',
  youth: 'Młodzież',
  mlodziezowka: 'Młodzieżówka',
  // Wpisy-zadania (tablica zadań Kalendarza + moje elementy tablic z terminem) — tasks.ts.
  tasks: 'Zadania',
};

export const useCalendarLabel = () => {
  const { modules } = usePermissions();
  return useCallback(
    (key: string | null | undefined) => {
      const k = key || 'general';
      if (k === 'general') return CALENDAR_LABELS.general;
      return normalizeModuleLabel(modules.find((m) => m.key === k)?.label) || CALENDAR_LABELS[k] || k;
    },
    [modules],
  );
};

export const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const dayDiff = (d: Date, today = new Date()) =>
  Math.round((startOfDay(d).getTime() - startOfDay(today).getTime()) / 86_400_000);

const plural = (n: number, one: string, few: string, many: string) => {
  if (n === 1) return one;
  const m10 = n % 10;
  const m100 = n % 100;
  return m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};

// „Dziś”, „Jutro”, „Za 3 dni”, „Za 2 tygodnie”, „Wczoraj”, „5 dni temu”.
export const relativeDay = (d: Date, today = new Date()): string => {
  const n = dayDiff(d, today);
  if (n === 0) return 'Dziś';
  if (n === 1) return 'Jutro';
  if (n === -1) return 'Wczoraj';
  const a = Math.abs(n);
  const count = (k: number, one: string, few: string, many: string) => (k === 1 ? one : `${k} ${plural(k, one, few, many)}`);
  const txt =
    a < 7
      ? `${a} dni`
      : a < 30
        ? count(Math.round(a / 7), 'tydzień', 'tygodnie', 'tygodni')
        : count(Math.round(a / 30), 'miesiąc', 'miesiące', 'miesięcy');
  return n > 0 ? `Za ${txt}` : `${cap(txt)} temu`;
};

// „Niedziela, 11 października” (+ rok, gdy inny niż bieżący).
export const longDay = (d: Date, today = new Date()) =>
  cap(format(d, d.getFullYear() === today.getFullYear() ? 'EEEE, d MMMM' : 'EEEE, d MMMM yyyy', { locale: pl }));

export const monthLabel = (d: Date) => cap(format(d, 'LLLL yyyy', { locale: pl }));

interface Timed {
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
}

export const timeRange = (e: Timed) => {
  if (e.allDay) return 'Cały dzień';
  if (e.endsAt && startOfDay(e.endsAt).getTime() === startOfDay(e.startsAt).getTime()) {
    return `${hm(e.startsAt)}–${hm(e.endsAt)}`;
  }
  return hm(e.startsAt);
};
export const startTime = (e: Timed) => (e.allDay ? null : hm(e.startsAt));
export const endTime = (e: Timed) =>
  !e.allDay && e.endsAt && startOfDay(e.endsAt).getTime() === startOfDay(e.startsAt).getTime() ? hm(e.endsAt) : null;

// Koniec wydarzenia do porównań „trwa / minęło” (bez końca: +1 h, cały dzień: koniec dnia).
export const effectiveEnd = (e: Timed) =>
  e.endsAt ??
  (e.allDay
    ? new Date(e.startsAt.getFullYear(), e.startsAt.getMonth(), e.startsAt.getDate(), 23, 59)
    : new Date(e.startsAt.getTime() + 60 * 60_000));

export const isOngoing = (e: Timed, now = new Date()) =>
  !e.allDay && e.startsAt <= now && effectiveEnd(e) > now;
export const isOver = (e: Timed, now = new Date()) => effectiveEnd(e) <= now;

// HTML z edytora (details_html, zakładki własne) → czytelny tekst z akapitami i punktorami.
export const htmlToText = (html: string | null | undefined): string => {
  if (!html) return '';
  return String(html)
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<\/\s*(p|div|li|h[1-6]|blockquote|tr)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};
