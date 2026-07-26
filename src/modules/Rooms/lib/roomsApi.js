// Helpery modułu Rezerwacji sal i zasobów (Rooms)

export const RESOURCE_TYPES = [
  { value: 'room', label: 'Sala' },
  { value: 'equipment', label: 'Sprzęt' },
];

export function typeLabel(v) {
  return (RESOURCE_TYPES.find(t => t.value === v) || {}).label || v || '—';
}

// Domyślna paleta kolorów dla zasobów
export const PRESET_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#64748b'];

// ---- Data / czas ----

// Zwraca wartość dla <input type="datetime-local"> w czasie lokalnym ("YYYY-MM-DDTHH:mm")
export function toLocalInputValue(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Konwertuje wartość z <input type="datetime-local"> (czas lokalny) na ISO (UTC) do zapisu w timestamptz
export function localInputToIso(value) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pl-PL', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

export function formatTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return String(iso);
  }
}

export function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return String(iso);
  }
}

// Czas trwania rezerwacji jako czytelny tekst (np. "1 godz 30 min")
export function formatDuration(startIso, endIso) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (isNaN(start) || isNaN(end) || end <= start) return '—';
  const mins = Math.round((end - start) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h} godz ${m} min`;
  if (h) return `${h} godz`;
  return `${m} min`;
}

// Dodaje N tygodni do daty, zwraca nowy obiekt Date
export function addWeeks(date, weeks) {
  const d = new Date(date);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

// Dodaje N dni do daty, zwraca nowy obiekt Date
export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Początek dnia (lokalnie)
export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Początek tygodnia (poniedziałek, lokalnie)
export function startOfWeek(date) {
  const d = startOfDay(date);
  const day = (d.getDay() + 6) % 7; // 0 = poniedziałek
  d.setDate(d.getDate() - day);
  return d;
}

// Czy dwa przedziały czasu się nakładają: aStart < bEnd && aEnd > bStart
export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return new Date(aStart) < new Date(bEnd) && new Date(aEnd) > new Date(bStart);
}

// Generator UUID po stronie klienta (dla recurrence_group)
export function newUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback (RFC4122 v4)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
