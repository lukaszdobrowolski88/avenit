// Rejestr typów kolumn tablicy (Monday-style). Każdy typ opisuje: etykietę,
// ikonę (nazwa lucide), domyślne ustawienia, domyślną wartość komórki oraz
// możliwości (czy można po nim grupować w Kanbanie, jakie podsumowania wspiera).
import { DEFAULT_STATUS_LABELS, DEFAULT_PRIORITY_LABELS } from './constants';

// Definicje typów. `icon` = nazwa ikony lucide-react (rozwiązywana w UI).
export const COLUMN_TYPES = {
  status: {
    key: 'status',
    label: 'Status',
    icon: 'CircleDot',
    groupable: true,
    summaries: ['battery'],
    defaultSettings: () => ({ labels: DEFAULT_STATUS_LABELS.map(l => ({ ...l })) }),
    defaultValue: () => null, // labelId | null
  },
  priority: {
    key: 'priority',
    label: 'Priorytet',
    icon: 'SignalHigh',
    groupable: true,
    summaries: ['battery'],
    defaultSettings: () => ({ labels: DEFAULT_PRIORITY_LABELS.map(l => ({ ...l })) }),
    defaultValue: () => null,
  },
  text: {
    key: 'text',
    label: 'Tekst',
    icon: 'Type',
    groupable: false,
    summaries: ['count'],
    defaultSettings: () => ({}),
    defaultValue: () => '',
  },
  long_text: {
    key: 'long_text',
    label: 'Długi tekst',
    icon: 'AlignLeft',
    groupable: false,
    summaries: ['count'],
    defaultSettings: () => ({}),
    defaultValue: () => '',
  },
  number: {
    key: 'number',
    label: 'Liczba',
    icon: 'Hash',
    groupable: false,
    summaries: ['sum', 'avg', 'min', 'max', 'count'],
    defaultSettings: () => ({ unit: '', decimals: 0 }),
    defaultValue: () => null,
  },
  date: {
    key: 'date',
    label: 'Data',
    icon: 'Calendar',
    groupable: false,
    dateLike: true,
    summaries: ['count'],
    defaultSettings: () => ({}),
    defaultValue: () => null, // 'YYYY-MM-DD'
  },
  timeline: {
    key: 'timeline',
    label: 'Oś czasu',
    icon: 'CalendarRange',
    groupable: false,
    dateLike: true,
    timelineLike: true,
    summaries: ['count'],
    defaultSettings: () => ({}),
    defaultValue: () => null, // { start, end }
  },
  people: {
    key: 'people',
    label: 'Osoby',
    icon: 'Users',
    groupable: true,
    summaries: ['count'],
    defaultSettings: () => ({}),
    defaultValue: () => [], // [{ email, name }]
  },
  dropdown: {
    key: 'dropdown',
    label: 'Lista wyboru',
    icon: 'Tags',
    groupable: true,
    summaries: ['count'],
    defaultSettings: () => ({ options: [], multi: true }),
    defaultValue: () => [], // [optionId]
  },
  checkbox: {
    key: 'checkbox',
    label: 'Pole wyboru',
    icon: 'CheckSquare',
    groupable: true,
    summaries: ['count'],
    defaultSettings: () => ({}),
    defaultValue: () => false,
  },
  link: {
    key: 'link',
    label: 'Link',
    icon: 'Link',
    groupable: false,
    summaries: ['count'],
    defaultSettings: () => ({}),
    defaultValue: () => null, // { url, text }
  },
  files: {
    key: 'files',
    label: 'Pliki',
    icon: 'Paperclip',
    groupable: false,
    summaries: ['count'],
    defaultSettings: () => ({}),
    defaultValue: () => [], // [{ name, url, size }]
  },
  rating: {
    key: 'rating',
    label: 'Ocena',
    icon: 'Star',
    groupable: false,
    summaries: ['avg', 'count'],
    defaultSettings: () => ({ max: 5 }),
    defaultValue: () => 0,
  },
  progress: {
    key: 'progress',
    label: 'Postęp',
    icon: 'Gauge',
    groupable: false,
    summaries: ['avg'],
    defaultSettings: () => ({}),
    defaultValue: () => 0, // 0-100
  },
  formula: {
    key: 'formula',
    label: 'Formuła',
    icon: 'Sigma',
    groupable: false,
    computed: true,
    summaries: ['sum', 'avg'],
    defaultSettings: () => ({ expression: '' }),
    defaultValue: () => null, // wyliczana, nie zapisywana
  },
  connect_board: {
    key: 'connect_board',
    label: 'Połącz tablice',
    icon: 'Link2',
    groupable: false,
    relational: true,
    summaries: ['count'],
    defaultSettings: () => ({ targetBoardId: null }),
    defaultValue: () => [], // [{ id, name }] elementy z innej tablicy
  },
  dependency: {
    key: 'dependency',
    label: 'Zależności',
    icon: 'GitBranch',
    groupable: false,
    relational: true,
    summaries: ['count'],
    defaultSettings: () => ({}),
    defaultValue: () => [], // [{ id, name }] elementy z tej samej tablicy (poprzedniki)
  },
  mirror: {
    key: 'mirror',
    label: 'Lustro',
    icon: 'ArrowRightLeft',
    groupable: false,
    computed: true,
    relational: true,
    summaries: [],
    defaultSettings: () => ({ throughColumnId: null, targetColumnId: null }),
    defaultValue: () => null, // wartość odbita z połączonych elementów (nie zapisywana)
  },
  email: {
    key: 'email', label: 'E-mail', icon: 'Mail', groupable: false, summaries: ['count'],
    defaultSettings: () => ({}), defaultValue: () => '',
  },
  phone: {
    key: 'phone', label: 'Telefon', icon: 'Phone', groupable: false, summaries: ['count'],
    defaultSettings: () => ({}), defaultValue: () => '',
  },
  location: {
    key: 'location', label: 'Lokalizacja', icon: 'MapPin', groupable: false, summaries: ['count'],
    defaultSettings: () => ({}), defaultValue: () => '',
  },
  vote: {
    key: 'vote', label: 'Głosowanie', icon: 'ThumbsUp', groupable: false, summaries: ['sum'],
    defaultSettings: () => ({}), defaultValue: () => [], // [emaile głosujących]
  },
  time_tracking: {
    key: 'time_tracking', label: 'Śledzenie czasu', icon: 'Timer', groupable: false, summaries: ['sum'],
    defaultSettings: () => ({}), defaultValue: () => ({ seconds: 0, running: false, startedAt: null }),
  },
  item_id: {
    key: 'item_id', label: 'ID elementu', icon: 'Hash', groupable: false, computed: true, summaries: [],
    defaultSettings: () => ({}), defaultValue: () => null,
  },
  created_log: {
    key: 'created_log', label: 'Utworzono', icon: 'Clock', groupable: false, computed: true, summaries: [],
    defaultSettings: () => ({}), defaultValue: () => null,
  },
  last_updated: {
    key: 'last_updated', label: 'Ostatnia zmiana', icon: 'History', groupable: false, computed: true, summaries: [],
    defaultSettings: () => ({}), defaultValue: () => null,
  },
};

// Kolejność w palecie „dodaj kolumnę"
export const COLUMN_TYPE_ORDER = [
  'status', 'text', 'people', 'date', 'timeline', 'number',
  'dropdown', 'priority', 'checkbox', 'long_text', 'link', 'files', 'rating', 'progress', 'formula',
  'connect_board', 'dependency', 'mirror',
  'email', 'phone', 'location', 'vote', 'time_tracking', 'item_id', 'created_log', 'last_updated',
];

export function getColumnType(type) {
  return COLUMN_TYPES[type] || COLUMN_TYPES.text;
}

export function defaultCellValue(column) {
  return getColumnType(column.type).defaultValue();
}

export function defaultColumnSettings(type) {
  return getColumnType(type).defaultSettings();
}

// Czy wartość komórki jest „pusta" (do podsumowań/filtrów)
export function isCellEmpty(type, value) {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (type === 'text' || type === 'long_text') return value === '';
  if (type === 'checkbox') return value === false;
  if (type === 'number') return value === null;
  if (type === 'rating') return !value;
  if (type === 'link') return !value.url;
  if (type === 'timeline') return !value.start && !value.end;
  return false;
}

// Znajdź etykietę statusu/priorytetu po id
export function findLabel(column, labelId) {
  const labels = column?.settings?.labels || [];
  return labels.find(l => l.id === labelId) || null;
}

// Rozwiąż wybrane opcje dropdownu na obiekty {id,title,color}
export function resolveOptions(column, ids) {
  const options = column?.settings?.options || [];
  return (ids || []).map(id => options.find(o => o.id === id)).filter(Boolean);
}

// Formatuj sekundy → H:MM:SS (śledzenie czasu)
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// Tekstowa reprezentacja wartości (Kanban card, kalendarz, podsumowania tabelaryczne)
export function cellToText(column, value) {
  const type = column.type;
  if (value === null || value === undefined) return '';
  switch (type) {
    case 'status':
    case 'priority': {
      const l = findLabel(column, value);
      return l ? l.title : '';
    }
    case 'people':
      return (value || []).map(p => p.name || p.email).join(', ');
    case 'dropdown':
      return resolveOptions(column, value).map(o => o.title).join(', ');
    case 'checkbox':
      return value ? '✓' : '';
    case 'date':
      return value || '';
    case 'timeline':
      return value.start ? `${value.start}${value.end ? ' → ' + value.end : ''}` : '';
    case 'link':
      return value.text || value.url || '';
    case 'files':
      return `${(value || []).length} plik(ów)`;
    case 'number':
      return value === null ? '' : `${value}${column.settings?.unit ? ' ' + column.settings.unit : ''}`;
    case 'rating': {
      // Clamp: goła '★'.repeat(value) rzuca RangeError dla wartości ujemnej/olbrzymiej (zepsute dane).
      const n = Math.max(0, Math.min(20, Math.floor(Number(value) || 0)));
      return n ? '★'.repeat(n) : '';
    }
    case 'progress':
      return value != null ? `${value}%` : '';
    case 'connect_board':
    case 'dependency':
      return (value || []).map(r => r.name).join(', ');
    case 'vote':
      return String((value || []).length);
    case 'time_tracking':
      return formatDuration(value?.seconds || 0);
    case 'email': case 'phone': case 'location':
      return value || '';
    case 'item_id': case 'created_log': case 'last_updated':
      return ''; // wyliczane z metadanych elementu (render w komórce)
    default:
      return String(value);
  }
}
