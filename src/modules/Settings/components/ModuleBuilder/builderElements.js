// Katalog elementów kreatora graficznego modułów + fabryka i pomocnicze operacje
// na drzewie. Współdzielony przez builder (paleta/płótno/inspektor) i runtime
// (LayoutRenderer). Bez JSX — tylko dane i logika drzewa.
import {
  LayoutTemplate, Columns, Grid3x3, Square, Minus, StretchVertical,
  Heading, Type, Image as ImageIcon, MousePointerClick, List, Quote,
  AlertTriangle, Star, Database, Calendar, CheckSquare, DollarSign, Users,
  MessageSquare, CalendarDays, UserCog, FolderOpen,
  Video, Map, Code, Timer, GalleryThumbnails,
  AppWindow, ChevronsUpDown, BookOpen, Heart, Music,
  Hash, BarChart3, Package, Link2, Contact,
} from 'lucide-react';

export const LAYOUT_VERSION = 1;

// Bezpieczne, unikalne id elementu.
let _seq = 0;
export function newId() {
  _seq += 1;
  return `el-${Date.now().toString(36)}-${_seq.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// Kategorie palety (etykiety owijane w tr() w UI).
export const ELEMENT_CATEGORIES = [
  { key: 'layout', label: 'Układ' },
  { key: 'content', label: 'Treść' },
  { key: 'widget', label: 'Widgety danych' },
  { key: 'data', label: 'Dane' },
];

// Gotowe widgety danych (klucze zgodne z ModuleWidget.WIDGET_TYPES).
export const WIDGET_META = {
  events: { label: 'Wydarzenia', icon: Calendar },
  tasks: { label: 'Zadania', icon: CheckSquare },
  finance: { label: 'Finanse', icon: DollarSign },
  members: { label: 'Członkowie', icon: Users },
  wall: { label: 'Tablica', icon: MessageSquare },
  schedule: { label: 'Grafik', icon: CalendarDays },
  duty: { label: 'Służby', icon: UserCog },
  materials: { label: 'Materiały', icon: FolderOpen },
  equipment: { label: 'Wyposażenie', icon: Package },
  gallery: { label: 'Galeria', icon: GalleryThumbnails },
  links: { label: 'Szybkie linki', icon: Link2 },
  contacts: { label: 'Kontakty', icon: Contact },
};

// Definicje typów elementów. isContainer => może mieć children.
export const ELEMENT_TYPES = {
  // ── Układ ──
  section:  { category: 'layout', label: 'Sekcja', icon: LayoutTemplate, isContainer: true, defaultProps: {} },
  columns:  { category: 'layout', label: 'Kolumny', icon: Columns, isContainer: true, defaultProps: { columns: 2, gap: 'md' } },
  grid:     { category: 'layout', label: 'Siatka', icon: Grid3x3, isContainer: true, defaultProps: { columns: 3, gap: 'md' } },
  card:     { category: 'layout', label: 'Karta', icon: Square, isContainer: true, defaultProps: { title: '' } },
  divider:  { category: 'layout', label: 'Linia', icon: Minus, defaultProps: { lineStyle: 'solid' } },
  spacer:   { category: 'layout', label: 'Odstęp', icon: StretchVertical, defaultProps: { size: 'md' } },
  tabs:     { category: 'layout', label: 'Zakładki', icon: AppWindow, isContainer: true, defaultProps: { labels: [] } },
  accordion:{ category: 'layout', label: 'Akordeon', icon: ChevronsUpDown, isContainer: true, defaultProps: { labels: [] } },
  // ── Treść ──
  heading:  { category: 'content', label: 'Nagłówek', icon: Heading, defaultProps: { text: 'Nagłówek', level: 2, align: 'left' } },
  text:     { category: 'content', label: 'Tekst', icon: Type, defaultProps: { html: '<p>Wpisz treść…</p>' } },
  image:    { category: 'content', label: 'Obraz', icon: ImageIcon, defaultProps: { src: '', alt: '', rounded: 'xl' } },
  button:   { category: 'content', label: 'Przycisk', icon: MousePointerClick, defaultProps: { label: 'Przycisk', href: '', variant: 'primary', align: 'left' } },
  list:     { category: 'content', label: 'Lista', icon: List, defaultProps: { items: ['Pierwszy punkt', 'Drugi punkt'], style: 'disc' } },
  quote:    { category: 'content', label: 'Cytat', icon: Quote, defaultProps: { text: 'Treść cytatu…', author: '' } },
  alert:    { category: 'content', label: 'Wyróżnienie', icon: AlertTriangle, defaultProps: { text: 'Ważna informacja', variant: 'info' } },
  icon:     { category: 'content', label: 'Ikona', icon: Star, defaultProps: { name: 'Star', size: 32 } },
  video:    { category: 'content', label: 'Wideo', icon: Video, defaultProps: { url: '' } },
  map:      { category: 'content', label: 'Mapa', icon: Map, defaultProps: { query: '' } },
  embed:    { category: 'content', label: 'Osadzenie', icon: Code, defaultProps: { url: '', height: 400 } },
  countdown:{ category: 'content', label: 'Licznik', icon: Timer, defaultProps: { target: '', label: 'Do wydarzenia' } },
  gallery:  { category: 'content', label: 'Galeria', icon: GalleryThumbnails, defaultProps: { images: [], columns: 3 } },
  verse:    { category: 'content', label: 'Werset', icon: BookOpen, defaultProps: { text: 'W nim mamy odkupienie przez krew jego…', reference: 'Ef 1,7' } },
  giving:   { category: 'content', label: 'Wesprzyj', icon: Heart, defaultProps: { label: 'Wesprzyj nas', url: '', note: '' } },
  songlist: { category: 'content', label: 'Setlista', icon: Music, defaultProps: { title: 'Pieśni', songs: ['Pieśń 1', 'Pieśń 2'] } },
  // ── Widget danych (jeden typ; konkretny widget w props.widgetType) ──
  widget:   { category: 'widget', label: 'Widget', icon: Database, isContainer: false, defaultProps: { widgetType: 'events' } },
  // ── Dane (kolekcja — Faza 2) ──
  collection: { category: 'data', label: 'Kolekcja danych', icon: Database, defaultProps: { collectionKey: '', title: 'Kolekcja', view: 'list', fields: [], allowCreate: true, allowEdit: true, allowDelete: true } },
  stat:  { category: 'data', label: 'Statystyka', icon: Hash, defaultProps: { collectionKey: '', label: 'Liczba wpisów' } },
  chart: { category: 'data', label: 'Wykres', icon: BarChart3, defaultProps: { collectionKey: '', field: '', chartType: 'bar', title: 'Wykres' } },
};

export function isContainer(type) {
  return !!ELEMENT_TYPES[type]?.isContainer;
}

// Fabryka elementu z domyślnymi propsami.
export function createElement(type, extraProps = {}) {
  const def = ELEMENT_TYPES[type];
  const el = {
    id: newId(),
    type,
    props: { ...structuredClone(def?.defaultProps || {}), ...extraProps },
    style: {},
    responsive: {},
    conditional: null,
    visibleForRoles: null,
  };
  if (def?.isContainer) el.children = [];
  if (type === 'collection' && !el.props.collectionKey) el.props.collectionKey = newId().replace('el-', 'col-');
  return el;
}

export function createWidgetElement(widgetType) {
  return createElement('widget', { widgetType });
}

// ── Kolekcje danych (element 'collection') ─────────────────────────────────
// Typy pól kolekcji (własne rekordy zapisywane w module_records.data).
export const COLLECTION_FIELD_TYPES = [
  { type: 'text', label: 'Tekst' },
  { type: 'textarea', label: 'Długi tekst' },
  { type: 'number', label: 'Liczba' },
  { type: 'currency', label: 'Kwota (PLN)' },
  { type: 'date', label: 'Data' },
  { type: 'select', label: 'Lista wyboru' },
  { type: 'multiselect', label: 'Wielokrotny wybór' },
  { type: 'checkbox', label: 'Tak / Nie' },
  { type: 'rating', label: 'Ocena (gwiazdki)' },
  { type: 'email', label: 'E-mail' },
  { type: 'phone', label: 'Telefon' },
  { type: 'image', label: 'Obraz (URL)' },
  { type: 'file', label: 'Plik (URL)' },
];

// Pola wymagające listy opcji (options).
export const FIELDS_WITH_OPTIONS = ['select', 'multiselect'];

export function newFieldKey() {
  return 'f_' + Math.random().toString(36).slice(2, 8);
}

export function createCollectionField(type = 'text') {
  return {
    key: newFieldKey(), label: 'Nowe pole', type, required: false,
    options: FIELDS_WITH_OPTIONS.includes(type) ? [{ label: 'Opcja 1', value: 'opcja_1' }] : undefined,
  };
}

// Pusty układ.
export function emptyLayout() {
  return { version: LAYOUT_VERSION, root: [], settings: {} };
}

// ── Operacje na drzewie (niemutujące) ──────────────────────────────────────
export function findElement(nodes, id) {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const found = findElement(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

export function updateElement(nodes, id, patch) {
  return nodes.map((n) => {
    if (n.id === id) {
      const next = typeof patch === 'function' ? patch(n) : { ...n, ...patch };
      return next;
    }
    if (n.children) return { ...n, children: updateElement(n.children, id, patch) };
    return n;
  });
}

export function removeElement(nodes, id) {
  const out = [];
  for (const n of nodes) {
    if (n.id === id) continue;
    out.push(n.children ? { ...n, children: removeElement(n.children, id) } : n);
  }
  return out;
}

export function duplicateElementInTree(nodes, id) {
  const cloneWithNewIds = (el) => {
    const clone = { ...structuredClone(el), id: newId() };
    // Kolekcja musi dostać NOWY collectionKey — inaczej kopia współdzieli rekordy oryginału.
    if (clone.type === 'collection' && clone.props) {
      clone.props = { ...clone.props, collectionKey: newId().replace('el-', 'col-') };
    }
    clone.children = el.children ? el.children.map(cloneWithNewIds) : el.children;
    return clone;
  };
  const out = [];
  for (const n of nodes) {
    out.push(n.children ? { ...n, children: duplicateElementInTree(n.children, id) } : n);
    if (n.id === id) out.push(cloneWithNewIds(n));
  }
  return out;
}

// Wstaw element: do kontenera parentId (na koniec) albo do korzenia, opcjonalnie
// przed elementem beforeId (reorder). parentId === null => korzeń.
export function insertElement(nodes, element, { parentId = null, index = null } = {}) {
  if (parentId === null) {
    const copy = [...nodes];
    copy.splice(index == null ? copy.length : index, 0, element);
    return copy;
  }
  return nodes.map((n) => {
    if (n.id === parentId && isContainer(n.type)) {
      const children = [...(n.children || [])];
      children.splice(index == null ? children.length : index, 0, element);
      return { ...n, children };
    }
    if (n.children) return { ...n, children: insertElement(n.children, element, { parentId, index }) };
    return n;
  });
}

// Sklonuj poddrzewo z NOWYMI id (do wstawiania szablonów / importu).
export function cloneTree(nodes) {
  return (nodes || []).map((el) => {
    const c = { ...structuredClone(el), id: newId() };
    if (c.type === 'collection' && c.props) c.props = { ...c.props, collectionKey: newId().replace('el-', 'col-') };
    c.children = el.children ? cloneTree(el.children) : el.children;
    return c;
  });
}

// Sanityzuje drzewo z AI: zostawia tylko znane typy, wymusza świeże id i domyślne propsy.
export function normalizeAiNodes(nodes) {
  if (!Array.isArray(nodes)) return [];
  const out = [];
  for (const n of nodes) {
    if (!n || !ELEMENT_TYPES[n.type]) continue;
    const el = createElement(n.type, (n.props && typeof n.props === 'object') ? n.props : {});
    if (isContainer(n.type)) el.children = normalizeAiNodes(n.children);
    out.push(el);
  }
  return out;
}

// Znajdź rodzica i indeks elementu (do reorder/move).
export function locateElement(nodes, id, parentId = null) {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) return { parentId, index: i };
    if (nodes[i].children) {
      const r = locateElement(nodes[i].children, id, nodes[i].id);
      if (r) return r;
    }
  }
  return null;
}
