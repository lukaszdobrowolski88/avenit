// Zastosowanie konfiguracji widoku (filtry/sortowanie/szukanie/grupowanie)
// do listy elementów. Wspólne dla wszystkich widoków.
import { cellToText, findLabel, isCellEmpty } from './columnTypes';

// Dopasowanie pojedynczego filtra {columnId, op, value} do wartości komórki.
function matchFilter(column, cell, filter) {
  const { op, value } = filter;
  switch (column.type) {
    case 'status':
    case 'priority':
      if (op === 'is_empty') return cell == null;
      if (op === 'is_not') return cell != null && cell !== value;
      return cell === value;
    case 'people': {
      const emails = (cell || []).map(p => p.email);
      if (op === 'is_empty') return emails.length === 0;
      return emails.includes(value);
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
      if (op === 'before') return cell < value;
      if (op === 'after') return cell > value;
      return cell === value;
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

  // Filtry
  for (const f of (config.filters || [])) {
    const col = colById[f.columnId];
    if (!col) continue;
    out = out.filter(it => matchFilter(col, it.cells?.[f.columnId], f));
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

// Grupowanie elementów po kolumnie (dla Kanbana). Zwraca [{key, title, color, items}]
export function groupItemsByColumn(items, column) {
  const buckets = new Map();
  const ensure = (key, title, color) => {
    if (!buckets.has(key)) buckets.set(key, { key, title, color, items: [] });
    return buckets.get(key);
  };

  if (column.type === 'status' || column.type === 'priority') {
    (column.settings?.labels || []).forEach(l => ensure(l.id, l.title, l.color));
    ensure('__empty__', 'Bez wartości', '#c4c4c4');
    for (const it of items) {
      const v = it.cells?.[column.id];
      const l = findLabel(column, v);
      ensure(l ? l.id : '__empty__', l ? l.title : 'Bez wartości', l ? l.color : '#c4c4c4').items.push(it);
    }
  } else if (column.type === 'people') {
    for (const it of items) {
      const ppl = it.cells?.[column.id] || [];
      if (ppl.length === 0) ensure('__empty__', 'Nieprzypisane', '#c4c4c4').items.push(it);
      else ppl.forEach(p => ensure(p.email, p.name, '#579bfc').items.push(it));
    }
  } else if (column.type === 'dropdown') {
    (column.settings?.options || []).forEach(o => ensure(o.id, o.title, o.color));
    ensure('__empty__', 'Bez etykiety', '#c4c4c4');
    for (const it of items) {
      const ids = it.cells?.[column.id] || [];
      if (ids.length === 0) ensure('__empty__').items.push(it);
      else ids.forEach(id => { const o = (column.settings?.options || []).find(x => x.id === id); if (o) ensure(o.id, o.title, o.color).items.push(it); });
    }
  } else if (column.type === 'checkbox') {
    ensure('true', 'Zaznaczone', '#00c875'); ensure('false', 'Niezaznaczone', '#c4c4c4');
    for (const it of items) ensure(it.cells?.[column.id] ? 'true' : 'false').items.push(it);
  }
  return Array.from(buckets.values());
}
