// Wspólne helpery tekstowe — jedno źródło prawdy zamiast kopiowanych po modułach wariantów
// (getInitials/stringToColor istniały w ≥3 niespójnych wersjach: różne palety i logika inicjałów).

// Inicjały: pierwsza litera pierwszego i ostatniego członu imienia (np. „Jan Adam Kowalski" → „JK").
export function getInitials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// Stabilna, „tęczowa" paleta do awatarów (rozróżnianie osób) — celowo NIE tokeny akcentu.
const AVATAR_COLORS = ['#ec4899', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7'];

// Deterministyczny kolor z dowolnego stringa (e-mail/nazwa). Pusto → neutralny szary.
export function stringToColor(str) {
  if (!str) return '#6b7280';
  let hash = 0;
  for (let i = 0; i < String(str).length; i++) hash = String(str).charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
