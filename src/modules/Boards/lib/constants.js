// Stałe i palety kolorów dla modułu Tablice (Work OS w stylu Monday.com)

// Paleta kolorów statusów/etykiet (zbliżona do Monday)
export const STATUS_COLORS = [
  '#00c875', // zielony
  '#fdab3d', // pomarańczowy
  '#e2445c', // czerwony
  '#579bfc', // niebieski
  '#a25ddc', // fioletowy
  '#0086c0', // ciemnoniebieski
  '#ff5ac4', // różowy
  '#ff642e', // ceglasty
  '#9cd326', // limonkowy
  '#66ccff', // błękitny
  '#784bd1', // indygo
  '#037f4c', // ciemnozielony
  '#333333', // grafitowy
  '#c4c4c4', // szary
];

// Kolory grup
export const GROUP_COLORS = [
  '#579bfc', '#00c875', '#a25ddc', '#e2445c', '#fdab3d',
  '#ff5ac4', '#0086c0', '#9cd326', '#784bd1', '#ff642e',
];

// Domyślne etykiety kolumny Status
export const DEFAULT_STATUS_LABELS = [
  { id: 'todo', title: 'Do zrobienia', color: '#c4c4c4' },
  { id: 'working', title: 'W trakcie', color: '#fdab3d' },
  { id: 'stuck', title: 'Zablokowane', color: '#e2445c' },
  { id: 'done', title: 'Gotowe', color: '#00c875' },
];

// Domyślne etykiety kolumny Priorytet
export const DEFAULT_PRIORITY_LABELS = [
  { id: 'low', title: 'Niski', color: '#579bfc' },
  { id: 'medium', title: 'Średni', color: '#5559df' },
  { id: 'high', title: 'Wysoki', color: '#401694' },
  { id: 'critical', title: 'Pilne', color: '#e2445c' },
];

// Nowy identyfikator (bez zależności od Date.now w środowiskach, ale tu w UI jest OK)
export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

// Kolejny kolor z palety wg indeksu
export function pickColor(palette, index) {
  return palette[index % palette.length];
}
