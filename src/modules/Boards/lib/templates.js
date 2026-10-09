// Szablony tablic (kościelne). Kolumny mają `ref` do mapowania na realne id po
// utworzeniu; przykładowe elementy odwołują się do kolumn przez `ref`.
// Kolory = paleta aplikacji (bez palety Monday); nazwy po polsku jako klucze tłumaczeń —
// localizeTemplate() przepuszcza je przez tr() w chwili tworzenia tablicy.
import { DEFAULT_STATUS_LABELS, DEFAULT_PRIORITY_LABELS } from './constants';
import { STATUS_COLORS as APP } from '../../../components/ui/DataTable';
import { tr } from '../../../i18n';

const STATUS = { labels: DEFAULT_STATUS_LABELS.map(l => ({ ...l, ...(l.id === 'done' ? { done: true } : {}) })) };
const PRIORITY = { labels: DEFAULT_PRIORITY_LABELS.map(l => ({ ...l })) };
const STAGE = { labels: [
  { id: 'new', title: 'Nowy', color: APP.info },
  { id: 'contact', title: 'Kontakt', color: APP.warning },
  { id: 'active', title: 'Aktywny', color: APP.success },
  { id: 'inactive', title: 'Nieaktywny', color: APP.neutral },
] };

export const BOARD_TEMPLATES = [
  {
    key: 'blank', name: 'Pusta tablica', description: 'Zacznij od zera', icon: 'LayoutGrid', color: APP.accent,
    columns: [
      { ref: 'status', name: 'Status', type: 'status', settings: STATUS },
      { ref: 'people', name: 'Osoby', type: 'people' },
      { ref: 'date', name: 'Termin', type: 'date' },
    ],
    groups: [{ name: 'Grupa zadań', color: APP.info }, { name: 'Ukończone', color: APP.success }],
    items: [],
  },
  {
    key: 'event', name: 'Planowanie wydarzenia', description: 'Konferencja, koncert, spotkanie', icon: 'CalendarRange', color: APP.warning,
    columns: [
      { ref: 'status', name: 'Status', type: 'status', settings: STATUS },
      { ref: 'owner', name: 'Odpowiedzialny', type: 'people' },
      { ref: 'due', name: 'Termin', type: 'date' },
      { ref: 'prio', name: 'Priorytet', type: 'priority', settings: PRIORITY },
      { ref: 'budget', name: 'Budżet', type: 'number', settings: { unit: 'zł' } },
    ],
    groups: [{ name: 'Przygotowania', color: APP.warning }, { name: 'W dniu wydarzenia', color: APP.info }, { name: 'Po wydarzeniu', color: APP.success }],
    items: [
      { name: 'Rezerwacja sali', group: 0, cells: { status: 'working', prio: 'high' } },
      { name: 'Nagłośnienie i multimedia', group: 0, cells: { status: 'todo', prio: 'medium' } },
      { name: 'Plakaty i promocja', group: 0, cells: { status: 'todo' } },
      { name: 'Rejestracja uczestników', group: 1, cells: { status: 'todo' } },
      { name: 'Podziękowania dla wolontariuszy', group: 2, cells: { status: 'todo' } },
    ],
  },
  {
    key: 'team', name: 'Zadania zespołu', description: 'Bieżące zadania służby', icon: 'CheckSquare', color: APP.success,
    columns: [
      { ref: 'status', name: 'Status', type: 'status', settings: STATUS },
      { ref: 'owner', name: 'Osoba', type: 'people' },
      { ref: 'due', name: 'Termin', type: 'date' },
      { ref: 'prio', name: 'Priorytet', type: 'priority', settings: PRIORITY },
    ],
    groups: [{ name: 'Do zrobienia', color: APP.info }, { name: 'W trakcie', color: APP.warning }, { name: 'Zrobione', color: APP.success }],
    items: [
      { name: 'Przygotować materiały na spotkanie', group: 0, cells: { status: 'todo', prio: 'medium' } },
      { name: 'Zaktualizować listę kontaktów', group: 1, cells: { status: 'working', prio: 'low' } },
    ],
  },
  {
    key: 'mission', name: 'Projekt misyjny', description: 'Wyjazd/akcja misyjna', icon: 'CalendarRange', color: APP.accent,
    columns: [
      { ref: 'status', name: 'Status', type: 'status', settings: STATUS },
      { ref: 'team', name: 'Zespół', type: 'people' },
      { ref: 'timeline', name: 'Harmonogram', type: 'timeline' },
      { ref: 'notes', name: 'Notatki', type: 'long_text' },
    ],
    groups: [{ name: 'Planowanie', color: APP.info }, { name: 'Realizacja', color: APP.warning }, { name: 'Podsumowanie', color: APP.success }],
    items: [
      { name: 'Zbiórka funduszy', group: 0, cells: { status: 'working' } },
      { name: 'Logistyka i transport', group: 0, cells: { status: 'todo' } },
    ],
  },
  {
    key: 'crm', name: 'CRM wolontariuszy', description: 'Opieka nad wolontariuszami', icon: 'Users', color: APP.info,
    columns: [
      { ref: 'stage', name: 'Etap', type: 'status', settings: STAGE },
      { ref: 'owner', name: 'Opiekun', type: 'people' },
      { ref: 'area', name: 'Obszar', type: 'dropdown', settings: { multi: true, options: [
        { id: 'worship', title: 'Uwielbienie', color: APP.accent },
        { id: 'kids', title: 'Dzieci', color: APP.warning },
        { id: 'media', title: 'Media', color: APP.info },
        { id: 'hospitality', title: 'Gościnność', color: APP.success },
      ] } },
      { ref: 'lastContact', name: 'Ostatni kontakt', type: 'date' },
      { ref: 'notes', name: 'Notatki', type: 'long_text' },
    ],
    groups: [{ name: 'Nowi', color: APP.info }, { name: 'Aktywni', color: APP.success }],
    items: [
      { name: 'Jan Kowalski', group: 0, cells: { stage: 'new', area: ['worship'] } },
      { name: 'Anna Nowak', group: 1, cells: { stage: 'active', area: ['kids', 'hospitality'] } },
    ],
  },
];

// Nazwy przykładowych osób zostają jak są (to dane, nie interfejs).
const PERSON_ITEMS = new Set(['Jan Kowalski', 'Anna Nowak']);
const trTitles = (list) => (list || []).map(x => ({ ...x, title: tr(x.title) }));

// Kopia szablonu w języku interfejsu: nazwy kolumn, grup, etykiet, opcji i przykładowych elementów
// przez tr() — tablica tworzona po angielsku nie ma polskich nagłówków.
export function localizeTemplate(template) {
  return {
    ...template,
    name: tr(template.name),
    description: tr(template.description || ''),
    columns: (template.columns || []).map(c => {
      const s = c.settings || {};
      return {
        ...c,
        name: tr(c.name),
        settings: {
          ...s,
          ...(s.labels ? { labels: trTitles(s.labels) } : {}),
          ...(s.options ? { options: trTitles(s.options) } : {}),
        },
      };
    }),
    groups: (template.groups || []).map(g => ({ ...g, name: tr(g.name) })),
    items: (template.items || []).map(it => ({ ...it, name: PERSON_ITEMS.has(it.name) ? it.name : tr(it.name) })),
  };
}
