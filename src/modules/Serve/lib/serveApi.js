// Helpery modułu Służby (Serve): dostępność wolontariuszy + raport CCLI

export function memberName(m) {
  if (!m) return '—';
  return `${m.first_name || ''} ${m.last_name || ''}`.trim() || 'Wolontariusz';
}

export function songLabel(s) {
  if (!s) return '—';
  return s.title || 'Pieśń';
}

export function programLabel(p) {
  if (!p) return '—';
  const d = formatDate(p.date);
  if (p.title) return `${p.title} (${d})`;
  return d;
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('pl-PL');
  } catch {
    return dateStr;
  }
}

export const todayIso = () => new Date().toISOString().slice(0, 10);

// Pierwszy dzień bieżącego roku (YYYY-01-01)
export const startOfYearIso = () => `${new Date().getFullYear()}-01-01`;

// Czy niedostępność jest nadchodząca lub wciąż trwa (end_date >= dziś)
export function isUpcoming(blockout) {
  if (!blockout?.end_date) return false;
  return blockout.end_date >= todayIso();
}
