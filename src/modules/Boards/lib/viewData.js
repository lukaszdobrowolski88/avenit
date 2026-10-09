// Zastosowanie konfiguracji widoku (filtry/sortowanie/szukanie/grupowanie)
// do listy elementów. Wspólne dla wszystkich widoków.
import { cellToText, findLabel, isCellEmpty } from './columnTypes';
import { boardColor } from './palette';
import { STATUS_COLORS } from '../../../components/ui/DataTable';
import { tr } from '../../../i18n';

// Wartość filtra „Osoby” oznaczająca bieżącego użytkownika — zapisany widok z „Ja” działa dla każdego.
export const ME = '__me__';
const lower = (v) => String(v ?? '').trim().toLowerCase();

// Filtr bez wartości (świeżo dodany, jeszcze nie wybrany) nie zawęża listy — wcześniej np. pusty
// filtr statusu pokazywał tylko zadania BEZ statusu.
export function filterHasValue(filter) {
  if (!filter) return false;
  if (filter.op === 'is_empty') return true;
  const v = filter.value;
  if (typeof v === 'boolean') return true;
  if (v === null || v === undefined) return false;
  if (Array.isArray(v)) return v.length > 0;
  return String(v).trim() !== '';
}

// Czy w którejkolwiek kolumnie „Osoby” zadania jest dana osoba (e-mail bez wielkości liter).
export function isAssignedTo(item, columns, email) {
  const e = lower(email);
  if (!e) return false;
  return columns.some((c) => c.type === 'people' && (item.cells?.[c.id] || []).some((p) => lower(p?.email) === e));
}

// Dopasowanie pojedynczego filtra {columnId, op, value} do wartości komórki.
function matchFilter(column, cell, filter, ctx = {}) {
  const { op, value } = filter;
  switch (column.type) {
    case 'status':
    case 'priority':
      if (op === 'is_empty') return cell == null;
      if (op === 'is_not') return cell != null && cell !== value;
      return cell === value;
    case 'people': {
      const emails = (cell || []).map(p => lower(p?.email));
      if (op === 'is_empty') return emails.length === 0;
      return emails.includes(lower(value === ME ? ctx.me : value));
    }
    case 'dropdown': {
      const ids = cell || [];
      if (op === 'is_empty') return ids.length === 0;
      return ids.includes(value);
    }
    case 'checkbox':
      return !!cell === (value === true || value === 'true');
    case 'number': {
      const n = typeof cell === 'number' ? cell : null;
      if (n == null) return op === 'is_empty';
      if (op === 'gt') return n > Number(value);
      if (op === 'lt') return n < Number(value);
      return n === Number(value);
    }
    case 'date': {
      if (op === 'is_empty') return !cell;
      if (!cell) return false;
      const d = String(cell).slice(0, 10);
      if (op === 'before') return d < value;
      if (op === 'after') return d > value;
      return d === value;
    }
    default: {
      const text = cellToText(column, cell).toLowerCase();
      if (op === 'is_empty') return !text;
      return text.includes(String(value).toLowerCase());
    }
  }
}

export function applyView(items, columns, config = {}) {
  let out = items.filter(it => !it.parent_item_id);
  const colById = Object.fromEntries(columns.map(c => [c.id, c]));

  // Szukanie
  const q = (config.search || '').trim().toLowerCase();
  if (q) {
    out = out.filter(it => {
      if ((it.name || '').toLowerCase().includes(q)) return true;
      return columns.some(c => cellToText(c, it.cells?.[c.id]).toLowerCase().includes(q));
    });
  }

  // „Moje” — przypisane do mnie (dowolna kolumna Osoby). Bez znanego użytkownika — bez zawężania.
  if (config.mine && config.me) out = out.filter(it => isAssignedTo(it, columns, config.me));

  // Filtry (bez wartości — pomijane; „Ja” bez znanego użytkownika — pomijane)
  const ctx = { me: config.me || null };
  for (const f of (config.filters || [])) {
    const col = colById[f.columnId];
    if (!col || !filterHasValue(f)) continue;
    if (col.type === 'people' && f.value === ME && !ctx.me && f.op !== 'is_empty') continue;
    out = out.filter(it => matchFilter(col, it.cells?.[f.columnId], f, ctx));
  }

  // Sortowanie
  for (const s of [...(config.sorts || [])].reverse()) {
    const col = colById[s.columnId];
    if (!col) continue;
    const dir = s.dir === 'desc' ? -1 : 1;
    out = [...out].sort((a, b) => {
      const ac = a.cells?.[s.columnId], bc = b.cells?.[s.columnId];
      // Puste zawsze na końcu (jak Monday) — niezależnie od kierunku sortowania.
      const ae = isCellEmpty(col.type, ac), be = isCellEmpty(col.type, bc);
      if (ae && be) return 0;
      if (ae) return 1;
      if (be) return -1;
      const av = sortKey(col, ac);
      const bv = sortKey(col, bc);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }
  return out;
}

// Czy widok coś ukrywa (szukanie, „Moje”, filtry z wartością) — do komunikatu „Brak pasujących”.
export function hasActiveFilters(config = {}) {
  return !!config.mine || (config.filters || []).some(filterHasValue) || !!String(config.search || '').trim();
}

function sortKey(column, cell) {
  if (cell == null) return '';
  switch (column.type) {
    case 'number': case 'rating': return typeof cell === 'number' ? cell : -Infinity;
    case 'checkbox': return cell ? 1 : 0;
    case 'status': case 'priority': {
      const labels = column.settings?.labels || [];
      const idx = labels.findIndex(l => l.id === cell);
      return idx < 0 ? 999 : idx;
    }
    case 'date': return cell || '';
    case 'timeline': return cell?.start || '';
    default: return cellToText(column, cell).toLowerCase();
  }
}

// Grupowanie elementów po kolumnie (dla Kanbana i wykresu). Zwraca [{key, title, color, items}].
// Tytuły wiader systemowych przez tr() (widać je w kolumnach Kanbana i legendzie wykresu); kolory
// z palety aplikacji — kolory etykiet z bazy mogą być jeszcze z palety Monday, więc boardColor().
export function groupItemsByColumn(items, column) {
  const buckets = new Map();
  const ensure = (key, title, color) => {
    if (!buckets.has(key)) buckets.set(key, { key, title, color: boardColor(color), items: [] });
    return buckets.get(key);
  };
  const NONE = STATUS_COLORS.neutral;

  if (column.type === 'status' || column.type === 'priority') {
    (column.settings?.labels || []).forEach(l => ensure(l.id, l.title, l.color));
    ensure('__empty__', tr('Bez wartości'), NONE);
    for (const it of items) {
      const v = it.cells?.[column.id];
      const l = findLabel(column, v);
      ensure(l ? l.id : '__empty__', l ? l.title : tr('Bez wartości'), l ? l.color : NONE).items.push(it);
    }
  } else if (column.type === 'people') {
    for (const it of items) {
      const ppl = it.cells?.[column.id] || [];
      if (ppl.length === 0) ensure('__empty__', tr('Nieprzypisane'), NONE).items.push(it);
      else ppl.forEach(p => ensure(p.email, p.name, STATUS_COLORS.info).items.push(it));
    }
  } else if (column.type === 'dropdown') {
    (column.settings?.options || []).forEach(o => ensure(o.id, o.title, o.color));
    ensure('__empty__', tr('Bez etykiety'), NONE);
    for (const it of items) {
      const ids = it.cells?.[column.id] || [];
      if (ids.length === 0) ensure('__empty__').items.push(it);
      else ids.forEach(id => { const o = (column.settings?.options || []).find(x => x.id === id); if (o) ensure(o.id, o.title, o.color).items.push(it); });
    }
  } else if (column.type === 'checkbox') {
    ensure('true', tr('Zaznaczone'), STATUS_COLORS.success); ensure('false', tr('Niezaznaczone'), NONE);
    for (const it of items) ensure(it.cells?.[column.id] ? 'true' : 'false').items.push(it);
  }
  return Array.from(buckets.values());
}
