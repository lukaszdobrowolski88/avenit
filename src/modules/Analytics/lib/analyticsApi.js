// Helpery modułu Analityki (BI / Dashboard liderów)

// Formatowanie kwoty w PLN
export function formatMoney(amount, currency = 'PLN') {
  const n = Number(amount) || 0;
  try {
    return new Intl.NumberFormat('pl-PL', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${n.toFixed(0)} ${currency}`;
  }
}

// Formatowanie liczby całkowitej
export function formatNumber(value) {
  const n = Number(value) || 0;
  try {
    return new Intl.NumberFormat('pl-PL').format(n);
  } catch {
    return String(n);
  }
}

export const MONTHS = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];

// Statusy osób w kolejności lejka: Gość → Sympatyk → Członek
export const MEMBER_STATUSES = [
  { value: 'Gość', label: 'Goście', color: '#94a3b8' },
  { value: 'Sympatyk', label: 'Sympatycy', color: '#3b82f6' },
  { value: 'Członek', label: 'Członkowie', color: '#10b981' },
];

// Agregacja wartości do 12 miesięcy danego roku.
// items: tablica obiektów; getDate → string/Date; getValue → liczba (domyślnie 1 = zliczanie).
export function aggregateMonthly(items, getDate, getValue = () => 1) {
  const arr = Array.from({ length: 12 }, () => 0);
  (items || []).forEach((it) => {
    const raw = getDate(it);
    if (!raw) return;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return;
    arr[d.getMonth()] += Number(getValue(it)) || 0;
  });
  const max = Math.max(1, ...arr);
  return arr.map((v, i) => ({ m: i, v, h: Math.round((v / max) * 100) }));
}

// Lista lat do filtra (bieżący rok wstecz o `back` lat)
export function yearOptions(back = 5) {
  const current = new Date().getFullYear();
  const out = [];
  for (let y = current; y >= current - back; y--) out.push({ value: y, label: String(y) });
  return out;
}
