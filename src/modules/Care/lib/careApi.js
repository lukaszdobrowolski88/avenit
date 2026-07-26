// Helpery modułu Opieka i CRM (Care)

export const CARE_TYPES = [
  { value: 'wizyta', label: 'Wizyta' },
  { value: 'telefon', label: 'Telefon' },
  { value: 'email', label: 'E-mail' },
  { value: 'modlitwa', label: 'Modlitwa' },
  { value: 'spotkanie', label: 'Spotkanie' },
];

export const MILESTONE_TYPES = [
  { value: 'nawrócenie', label: 'Nawrócenie' },
  { value: 'chrzest', label: 'Chrzest' },
  { value: 'członkostwo', label: 'Członkostwo' },
  { value: 'ślub', label: 'Ślub' },
  { value: 'inne', label: 'Inne' },
];

export const FIELD_TYPES = [
  { value: 'text', label: 'Tekst' },
  { value: 'number', label: 'Liczba' },
  { value: 'date', label: 'Data' },
  { value: 'select', label: 'Lista wyboru' },
];

// Paleta kolorów tagów (spójna z modułem Dawania)
export const TAG_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#64748b'];

export function careTypeLabel(v) {
  return (CARE_TYPES.find(m => m.value === v) || {}).label || v || '—';
}
export function milestoneTypeLabel(v) {
  return (MILESTONE_TYPES.find(m => m.value === v) || {}).label || v || '—';
}
export function fieldTypeLabel(v) {
  return (FIELD_TYPES.find(m => m.value === v) || {}).label || v || '—';
}

export function memberName(m) {
  if (!m) return '';
  return `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.email || 'Członek';
}

export function memberInitials(m) {
  if (!m) return '?';
  const a = (m.first_name || '').trim()[0] || '';
  const b = (m.last_name || '').trim()[0] || '';
  const init = `${a}${b}`.toUpperCase();
  return init || (m.email || '?').trim()[0]?.toUpperCase() || '?';
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('pl-PL');
  } catch {
    return dateStr;
  }
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('pl-PL', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

// Slugify etykiety pola własnego na field_key (a-z0-9_)
export function slugifyFieldKey(label) {
  const map = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };
  return (label || '')
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, ch => map[ch] || ch)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || `pole_${Date.now()}`;
}
