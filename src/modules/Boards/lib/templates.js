// Szablony tablic (kościelne). Kolumny mają `ref` do mapowania na realne id po
// utworzeniu; przykładowe elementy odwołują się do kolumn przez `ref`.
import { DEFAULT_STATUS_LABELS, DEFAULT_PRIORITY_LABELS } from './constants';

const STATUS = { labels: DEFAULT_STATUS_LABELS.map(l => ({ ...l })) };
const PRIORITY = { labels: DEFAULT_PRIORITY_LABELS.map(l => ({ ...l })) };
const STAGE = { labels: [
  { id: 'new', title: 'Nowy', color: '#579bfc' },
  { id: 'contact', title: 'Kontakt', color: '#fdab3d' },
  { id: 'active', title: 'Aktywny', color: '#00c875' },
  { id: 'inactive', title: 'Nieaktywny', color: '#c4c4c4' },
] };

export const BOARD_TEMPLATES = [
  {
    key: 'blank', name: 'Pusta tablica', description: 'Zacznij od zera', icon: 'LayoutGrid', color: '#6366f1',
    columns: [
      { ref: 'status', name: 'Status', type: 'status', settings: STATUS },
      { ref: 'people', name: 'Osoby', type: 'people' },
      { ref: 'date', name: 'Termin', type: 'date' },
    ],
    groups: [{ name: 'Grupa zadań', color: '#579bfc' }, { name: 'Ukończone', color: '#00c875' }],
    items: [],
  },
  {
    key: 'event', name: 'Planowanie wydarzenia', description: 'Konferencja, koncert, spotkanie', icon: 'CalendarRange', color: '#e2445c',
    columns: [
      { ref: 'status', name: 'Status', type: 'status', settings: STATUS },
      { ref: 'owner', name: 'Odpowiedzialny', type: 'people' },
      { ref: 'due', name: 'Termin', type: 'date' },
      { ref: 'prio', name: 'Priorytet', type: 'priority', settings: PRIORITY },
      { ref: 'budget', name: 'Budżet', type: 'number', settings: { unit: 'zł' } },
    ],
    groups: [{ name: 'Przygotowania', color: '#fdab3d' }, { name: 'W dniu wydarzenia', color: '#579bfc' }, { name: 'Po wydarzeniu', color: '#00c875' }],
    items: [
      { name: 'Rezerwacja sali', group: 0, cells: { status: 'working', prio: 'high' } },
      { name: 'Nagłośnienie i multimedia', group: 0, cells: { status: 'todo', prio: 'medium' } },
      { name: 'Plakaty i promocja', group: 0, cells: { status: 'todo' } },
      { name: 'Rejestracja uczestników', group: 1, cells: { status: 'todo' } },
      { name: 'Podziękowania dla wolontariuszy', group: 2, cells: { status: 'todo' } },
    ],
  },
  {
    key: 'team', name: 'Zadania zespołu', description: 'Bieżące zadania służby', icon: 'CheckSquare', color: '#00c875',
    columns: [
      { ref: 'status', name: 'Status', type: 'status', settings: STATUS },
      { ref: 'owner', name: 'Osoba', type: 'people' },
      { ref: 'due', name: 'Termin', type: 'date' },
      { ref: 'prio', name: 'Priorytet', type: 'priority', settings: PRIORITY },
    ],
    groups: [{ name: 'Do zrobienia', color: '#579bfc' }, { name: 'W trakcie', color: '#fdab3d' }, { name: 'Zrobione', color: '#00c875' }],
    items: [
      { name: 'Przygotować materiały na spotkanie', group: 0, cells: { status: 'todo', prio: 'medium' } },
      { name: 'Zaktualizować listę kontaktów', group: 1, cells: { status: 'working', prio: 'low' } },
    ],
  },
  {
    key: 'mission', name: 'Projekt misyjny', description: 'Wyjazd/akcja misyjna', icon: 'CalendarRange', color: '#a25ddc',
    columns: [
      { ref: 'status', name: 'Status', type: 'status', settings: STATUS },
      { ref: 'team', name: 'Zespół', type: 'people' },
      { ref: 'timeline', name: 'Harmonogram', type: 'timeline' },
      { ref: 'notes', name: 'Notatki', type: 'long_text' },
    ],
    groups: [{ name: 'Planowanie', color: '#579bfc' }, { name: 'Realizacja', color: '#fdab3d' }, { name: 'Podsumowanie', color: '#00c875' }],
    items: [
      { name: 'Zbiórka funduszy', group: 0, cells: { status: 'working' } },
      { name: 'Logistyka i transport', group: 0, cells: { status: 'todo' } },
    ],
  },
  {
    key: 'crm', name: 'CRM wolontariuszy', description: 'Opieka nad wolontariuszami', icon: 'Users', color: '#0086c0',
    columns: [
      { ref: 'stage', name: 'Etap', type: 'status', settings: STAGE },
      { ref: 'owner', name: 'Opiekun', type: 'people' },
      { ref: 'area', name: 'Obszar', type: 'dropdown', settings: { multi: true, options: [
        { id: 'worship', title: 'Uwielbienie', color: '#a25ddc' },
        { id: 'kids', title: 'Dzieci', color: '#fdab3d' },
        { id: 'media', title: 'Media', color: '#0086c0' },
        { id: 'hospitality', title: 'Gościnność', color: '#00c875' },
      ] } },
      { ref: 'lastContact', name: 'Ostatni kontakt', type: 'date' },
      { ref: 'notes', name: 'Notatki', type: 'long_text' },
    ],
    groups: [{ name: 'Nowi', color: '#579bfc' }, { name: 'Aktywni', color: '#00c875' }],
    items: [
      { name: 'Jan Kowalski', group: 0, cells: { stage: 'new', area: ['worship'] } },
      { name: 'Anna Nowak', group: 1, cells: { stage: 'active', area: ['kids', 'hospitality'] } },
    ],
  },
];
