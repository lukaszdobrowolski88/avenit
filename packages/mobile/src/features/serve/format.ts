import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { pl } from 'date-fns/locale';
import type { Blockout } from './api';

// Etykiety nieobecności (ekran „Moje nieobecności” i widżet na pulpicie).
const fmt = (iso: string, pattern: string) => {
  try {
    const out = format(parseISO(iso), pattern, { locale: pl });
    return out.charAt(0).toUpperCase() + out.slice(1);
  } catch {
    return iso;
  }
};

export const rangeLabel = (b: Blockout) =>
  b.start_date === b.end_date ? fmt(b.start_date, 'EEEE, d MMMM') : `${fmt(b.start_date, 'd MMM')} – ${fmt(b.end_date, 'd MMM yyyy')}`;

export const daysLabel = (b: Blockout) => {
  const n = differenceInCalendarDays(parseISO(b.end_date), parseISO(b.start_date)) + 1;
  return n === 1 ? '1 dzień' : `${n} dni`;
};

export const todayIso = () => format(new Date(), 'yyyy-MM-dd');
