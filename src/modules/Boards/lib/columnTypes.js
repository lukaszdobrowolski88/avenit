// Rejestr typów kolumn tablicy (Monday-style). Każdy typ opisuje: etykietę,
// ikonę (nazwa lucide), domyślne ustawienia, domyślną wartość komórki oraz
// możliwości (czy można po nim grupować w Kanbanie, jakie podsumowania wspiera).
import { DEFAULT_STATUS_LABELS, DEFAULT_PRIORITY_LABELS } from './constants';
import { isDoneLabel } from '@avenit/shared/src/lib/boardStatus.js';
import { tr, appLocale } from '../../../i18n';

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

// ── Zakończenie i termin ─────────────────────────────────────────────
// Dzisiejsza data jako 'YYYY-MM-DD' w czasie LOKALNYM (toISOString dawał dzień UTC — po północy
// czasu polskiego zadania z „wczoraj” jeszcze nie były po terminie).
export function localDateKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Zadanie zakończone = w którejś kolumnie Status ma etykietę „zakończenia” (flaga done albo nazwa).
export function isItemDone(item, columns = []) {
  return columns.some((c) => c.type === 'status' && isDoneLabel(findLabel(c, item?.cells?.[c.id])));
}

// Termin z wartości kolumny Data ('YYYY-MM-DD…') albo Oś czasu ({start,end} → koniec).
export function dueDateOf(value) {
  if (!value) return null;
  const raw = typeof value === 'object' ? (value.end || value.start) : value;
  const d = String(raw || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

// Po terminie: termin przed dzisiejszym dniem (lokalnie) i zadanie niezakończone.
export function isOverdue(value, item, columns = [], today = localDateKey()) {
  const due = dueDateOf(value);
  return !!due && due < today && !isItemDone(item, columns);
}

// Plik-obraz (miniatura): typ MIME z wgrania albo rozszerzenie nazwy/adresu.
const IMG_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;
export function isImageFile(f) {
  if (!f) return false;
  if (/^image\//i.test(String(f.type || ''))) return true;
  return IMG_EXT.test(String(f.name || '')) || IMG_EXT.test(String(f.url || '').split(/[?#]/)[0]);
}

// Rozwiąż wybrane opcje dropdownu na obiekty {id,title,color}
export function resolveOptions(column, ids) {
  const options = column?.settings?.options || [];
  return (ids || []).map(id => options.find(o => o.id === id)).filter(Boolean);
}

// ── Formatowanie dat i liczb (komórki, Kanban, kalendarz, CSV, wyszukiwanie) ──
// 'YYYY-MM-DD' to dzień kalendarzowy — parsujemy lokalnie, bo new Date('2026-10-12') to północ UTC
// (na zachód od Greenwich wychodził dzień wcześniej). Znaczniki czasu (created_at) — zwykły Date.
export function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const s = String(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const DMY = { day: '2-digit', month: '2-digit', year: 'numeric' };
const DM = { day: '2-digit', month: '2-digit' };

// dd.mm.yyyy (separator wg języka — jak kalendarz CustomDatePicker), zamiast surowego ISO.
export function formatDate(v) {
  const d = toDate(v);
  return d ? d.toLocaleDateString(appLocale(), DMY) : '';
}

// Zakres „12.10 – 18.10.2026” (rok raz, gdy ten sam); inny rok → obie daty pełne.
export function formatDateRange(start, end) {
  const s = toDate(start), e = toDate(end);
  if (!s && !e) return '';
  if (!s) return `– ${formatDate(e)}`;
  if (!e || s.getTime() === e.getTime()) return formatDate(s);
  const head = s.getFullYear() === e.getFullYear() ? s.toLocaleDateString(appLocale(), DM) : formatDate(s);
  return `${head} – ${formatDate(e)}`;
}

// Liczba wg języka („1,5” po polsku). `decimals` > 0 = stała liczba miejsc po przecinku;
// 0/brak = bez zaokrąglania (domyślne decimals: 0 nie ma przełącznika w UI, a zaokrąglanie
// chowałoby wpisane ułamki).
export function formatNumber(value, decimals) {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const d = Number.isInteger(decimals) && decimals > 0 ? Math.min(decimals, 10) : null;
  return n.toLocaleString(appLocale(), d != null
    ? { minimumFractionDigits: d, maximumFractionDigits: d }
    : { maximumFractionDigits: 10 });
}

// „1 plik / 2 pliki / 5 plików” — kategoria liczby z Intl (dla ukraińskiego 21 = forma pojedyncza).
export function filesCountText(n) {
  let cat = 'other';
  try { cat = new Intl.PluralRules(appLocale()).select(n); } catch { /* stare przeglądarki */ }
  if (cat === 'one') return tr('{n} plik', { n });
  if (cat === 'few') return tr('{n} pliki', { n });
  return tr('{n} plików', { n });
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
      return formatDate(String(value).slice(0, 10));
    case 'timeline':
      return formatDateRange(value.start, value.end);
    case 'link':
      return value.text || value.url || '';
    case 'files':
      return (value || []).length ? filesCountText(value.length) : '';
    case 'number': {
      const n = formatNumber(value, column.settings?.decimals);
      return n ? `${n}${column.settings?.unit ? ' ' + column.settings.unit : ''}` : '';
    }
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
