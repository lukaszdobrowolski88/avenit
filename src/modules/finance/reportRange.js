// Helpery zakresów raportów finansowych: miesiąc / kwartał / rok / dowolny zakres dat.
// Zwraca ISO `from`/`to` (YYYY-MM-DD) + czytelną etykietę PL oraz „kubełki" czasu do wykresów.
import {
  startOfMonth, endOfMonth, startOfQuarter, endOfQuarter,
  startOfYear, endOfYear, eachMonthOfInterval, eachDayOfInterval,
  differenceInCalendarDays, parseISO, format, subYears,
} from 'date-fns';

export const REPORT_MODES = ['month', 'quarter', 'year', 'custom'];

export const MONTHS_PL = [
  'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
];
const MONTHS_SHORT = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];

const iso = (d) => format(d, 'yyyy-MM-dd');
const isoToDate = (s) => (s instanceof Date ? s : parseISO(String(s)));

/**
 * Wylicza zakres dat dla danego trybu.
 * @param {('month'|'quarter'|'year'|'custom')} mode
 * @param {{year?:number, month?:number, quarter?:number, from?:string, to?:string}} anchor
 * @returns {{mode:string, from:string, to:string, label:string, year:number}}
 */
export function computeRange(mode, anchor = {}) {
  const now = new Date();
  const year = anchor.year ?? now.getFullYear();

  if (mode === 'month') {
    const m = anchor.month ?? now.getMonth();
    const d = new Date(year, m, 1);
    return { mode, from: iso(startOfMonth(d)), to: iso(endOfMonth(d)), label: `${MONTHS_PL[m]} ${year}`, year };
  }
  if (mode === 'quarter') {
    const q = anchor.quarter ?? (Math.floor(now.getMonth() / 3) + 1);
    const d = new Date(year, (q - 1) * 3, 1);
    return { mode, from: iso(startOfQuarter(d)), to: iso(endOfQuarter(d)), label: `Q${q} ${year}`, year };
  }
  if (mode === 'custom') {
    const from = anchor.from || iso(startOfYear(now));
    const to = anchor.to || iso(now);
    return { mode, from, to, label: `${formatPl(from)} – ${formatPl(to)}`, year: Number(String(from).slice(0, 4)) || year };
  }
  // year (domyślnie)
  const d = new Date(year, 0, 1);
  return { mode: 'year', from: iso(startOfYear(d)), to: iso(endOfYear(d)), label: String(year), year };
}

/** Ten sam zakres przesunięty o N lat wstecz (do porównania rok-do-roku). */
export function shiftRangeYears(range, years = 1) {
  const from = iso(subYears(isoToDate(range.from), years));
  const to = iso(subYears(isoToDate(range.to), years));
  return { ...range, from, to, label: range.label, year: range.year - years };
}

/** Krótka etykieta daty w stylu „5 sty 2026". */
export function formatPl(dateStr) {
  const d = isoToDate(dateStr);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()].toLowerCase()} ${d.getFullYear()}`;
}

/**
 * Kubełki czasu dla wykresów: dzienne dla krótkich zakresów (≤ 62 dni),
 * miesięczne dla dłuższych. Krawędzie przycięte do zakresu.
 * @returns {Array<{key:string, label:string, from:string, to:string}>}
 */
export function bucketsForRange(from, to) {
  const start = isoToDate(from);
  const end = isoToDate(to);
  if (end < start) return [];
  const days = differenceInCalendarDays(end, start) + 1;

  if (days <= 62) {
    return eachDayOfInterval({ start, end }).map((d) => ({
      key: iso(d),
      label: `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`,
      from: iso(d),
      to: iso(d),
    }));
  }

  return eachMonthOfInterval({ start, end }).map((d) => {
    const mStart = startOfMonth(d);
    const mEnd = endOfMonth(d);
    const bFrom = mStart < start ? start : mStart;
    const bTo = mEnd > end ? end : mEnd;
    const sameYear = start.getFullYear() === end.getFullYear();
    return {
      key: iso(mStart),
      label: sameYear ? MONTHS_SHORT[d.getMonth()] : `${MONTHS_SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
      from: iso(bFrom),
      to: iso(bTo),
    };
  });
}

/** Lista lat do pickera (bieżący rok wstecz o `span`). */
export function yearOptions(span = 6) {
  const now = new Date().getFullYear();
  return Array.from({ length: span }, (_, i) => now - i);
}
