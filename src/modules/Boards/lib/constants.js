// Stałe i palety kolorów dla modułu Tablice (Work OS w stylu Monday.com)

// Palety kolorów = paleta aplikacji (sukces/ostrzeżenie/błąd/info/musztarda/neutralny), nie Monday —
// tablice mają wyglądać jak reszta aplikacji. Stare kolory z bazy mapuje lib/palette.js (boardColor).
import { LABEL_COLORS, GROUP_PALETTE } from './palette';
import { STATUS_COLORS as APP } from '../../../components/ui/DataTable';

export const STATUS_COLORS = LABEL_COLORS;

// Kolory grup
export const GROUP_COLORS = GROUP_PALETTE;

// Domyślne etykiety kolumny Status
export const DEFAULT_STATUS_LABELS = [
  { id: 'todo', title: 'Do zrobienia', color: APP.neutral },
  { id: 'working', title: 'W trakcie', color: APP.warning },
  { id: 'stuck', title: 'Zablokowane', color: APP.danger },
  { id: 'done', title: 'Gotowe', color: APP.success },
];

// Domyślne etykiety kolumny Priorytet
export const DEFAULT_PRIORITY_LABELS = [
  { id: 'low', title: 'Niski', color: APP.neutral },
  { id: 'medium', title: 'Średni', color: APP.info },
  { id: 'high', title: 'Wysoki', color: APP.warning },
  { id: 'critical', title: 'Pilne', color: APP.danger },
];

// Nowy identyfikator (bez zależności od Date.now w środowiskach, ale tu w UI jest OK)
export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

// Kolejny kolor z palety wg indeksu
export function pickColor(palette, index) {
  return palette[index % palette.length];
}
