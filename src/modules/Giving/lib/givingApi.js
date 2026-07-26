// Helpery modułu Dawania (Giving)

export function formatMoney(amount, currency = 'PLN') {
  const n = Number(amount) || 0;
  try {
    return new Intl.NumberFormat('pl-PL', { style: 'currency', currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

export const GIVING_METHODS = [
  { value: 'cash', label: 'Gotówka' },
  { value: 'transfer', label: 'Przelew' },
  { value: 'card', label: 'Karta' },
  { value: 'blik', label: 'BLIK' },
  { value: 'online', label: 'Online' },
  { value: 'przelewy24', label: 'Przelewy24' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'other', label: 'Inne' },
];

export const GIVING_FREQUENCIES = [
  { value: 'weekly', label: 'Co tydzień' },
  { value: 'biweekly', label: 'Co 2 tygodnie' },
  { value: 'monthly', label: 'Co miesiąc' },
  { value: 'quarterly', label: 'Co kwartał' },
  { value: 'yearly', label: 'Co rok' },
];

export const GIVING_STATUSES = [
  { value: 'completed', label: 'Zaksięgowane' },
  { value: 'pending', label: 'Oczekujące' },
  { value: 'failed', label: 'Nieudane' },
  { value: 'refunded', label: 'Zwrócone' },
];

export function methodLabel(v) {
  return (GIVING_METHODS.find(m => m.value === v) || {}).label || v || '—';
}
export function frequencyLabel(v) {
  return (GIVING_FREQUENCIES.find(m => m.value === v) || {}).label || v || '—';
}
export function statusLabel(v) {
  return (GIVING_STATUSES.find(m => m.value === v) || {}).label || v || '—';
}

export function memberName(m) {
  if (!m) return '';
  return `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.email || 'Członek';
}

// Nazwa darczyńcy do wyświetlenia
export function donorLabel(d, membersById) {
  if (!d) return '—';
  if (d.is_anonymous) return 'Anonimowo';
  if (d.member_id && membersById?.[d.member_id]) return memberName(membersById[d.member_id]);
  return d.donor_name || d.donor_email || '—';
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('pl-PL');
  } catch {
    return dateStr;
  }
}

// Oblicz następną datę pobrania dla planu cyklicznego
export function computeNextRun(frequency, from = new Date(), dayOfMonth = null) {
  const d = new Date(from);
  switch (frequency) {
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'biweekly': d.setDate(d.getDate() + 14); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
    default: d.setMonth(d.getMonth() + 1);
  }
  if (dayOfMonth && ['monthly', 'quarterly', 'yearly'].includes(frequency)) {
    d.setDate(Math.min(dayOfMonth, 28));
  }
  return d.toISOString().slice(0, 10);
}
