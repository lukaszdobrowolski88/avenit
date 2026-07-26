// Helpery modułu Frekwencja dorosłych (Attendance)

export const SESSION_TYPES = [
  { value: 'service', label: 'Nabożeństwo', color: '#10b981' },
  { value: 'group', label: 'Grupa', color: '#3b82f6' },
  { value: 'event', label: 'Wydarzenie', color: '#f59e0b' },
  { value: 'prayer', label: 'Modlitwa', color: '#8b5cf6' },
];

export function sessionTypeLabel(v) {
  return (SESSION_TYPES.find(t => t.value === v) || {}).label || v || '—';
}

export function sessionTypeColor(v) {
  return (SESSION_TYPES.find(t => t.value === v) || {}).color || '#94a3b8';
}

export function memberName(m) {
  if (!m) return '';
  return `${m.first_name || ''} ${m.last_name || ''}`.trim() || 'Członek';
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('pl-PL');
  } catch {
    return dateStr;
  }
}

// Frekwencja sesji: liczba odznaczonych obecnych członków/gości,
// a jeśli nikogo nie odznaczono — szybka liczba (headcount).
export function sessionAttendance(session, recordCount = 0) {
  if (recordCount && recordCount > 0) return recordCount;
  return Number(session?.headcount) || 0;
}

// Numer tygodnia ISO oraz klucz "rok-tydzień" do agregacji trendów.
export function isoWeekKey(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (target.getUTCDay() + 6) % 7; // pon=0
  target.setUTCDate(target.getUTCDate() - dayNum + 3); // czwartek bieżącego tygodnia
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((target - firstThursday) / (7 * 24 * 3600 * 1000));
  return { year: target.getUTCFullYear(), week };
}

// Etykieta krótkiej daty (dzień.miesiąc) do osi wykresu tygodniowego.
export function shortDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  return `${d.getDate()}.${d.getMonth() + 1}`;
}

// Poniedziałek tygodnia zawierającego podaną datę (YYYY-MM-DD).
export function weekStart(date) {
  const d = new Date(date);
  const dayNum = (d.getDay() + 6) % 7; // pon=0
  d.setDate(d.getDate() - dayNum);
  d.setHours(0, 0, 0, 0);
  return d;
}
