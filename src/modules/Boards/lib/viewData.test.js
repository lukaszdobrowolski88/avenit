import { describe, it, expect } from 'vitest';
import { applyView, groupItemsByColumn, ME, filterHasValue, hasActiveFilters } from './viewData';

const numCol = { id: 'n', type: 'number' };
const statusCol = { id: 's', type: 'status', settings: { labels: [{ id: 'todo', title: 'Do', color: '#1' }, { id: 'done', title: 'Gotowe', color: '#2' }] } };
const textCol = { id: 't', type: 'text' };
const columns = [numCol, statusCol, textCol];

const mk = (id, cells, extra = {}) => ({ id, name: id, cells, ...extra });

describe('applyView — szukanie', () => {
  const items = [mk('a', { t: 'Alfa' }), mk('b', { t: 'Beta' })];
  it('filtruje po nazwie i po komórkach', () => {
    expect(applyView(items, columns, { search: 'alf' }).map(i => i.id)).toEqual(['a']);
    expect(applyView(items, columns, { search: 'beta' }).map(i => i.id)).toEqual(['b']);
    expect(applyView(items, columns, { search: 'x' })).toHaveLength(0);
  });
  it('pomija podelementy', () => {
    const withSub = [...items, mk('sub', { t: 'Alfa' }, { parent_item_id: 'a' })];
    expect(applyView(withSub, columns, {}).map(i => i.id)).toEqual(['a', 'b']);
  });
});

describe('applyView — filtry', () => {
  const items = [mk('a', { n: 5, s: 'todo' }), mk('b', { n: 10, s: 'done' }), mk('c', {})];
  it('number gt/lt/eq', () => {
    expect(applyView(items, columns, { filters: [{ columnId: 'n', op: 'gt', value: 6 }] }).map(i => i.id)).toEqual(['b']);
    expect(applyView(items, columns, { filters: [{ columnId: 'n', op: 'lt', value: 6 }] }).map(i => i.id)).toEqual(['a']);
  });
  it('status is / is_not / is_empty', () => {
    expect(applyView(items, columns, { filters: [{ columnId: 's', op: 'is', value: 'done' }] }).map(i => i.id)).toEqual(['b']);
    expect(applyView(items, columns, { filters: [{ columnId: 's', op: 'is_not', value: 'done' }] }).map(i => i.id)).toEqual(['a']);
    expect(applyView(items, columns, { filters: [{ columnId: 's', op: 'is_empty' }] }).map(i => i.id)).toEqual(['c']);
  });
});

describe('applyView — sortowanie', () => {
  it('number rosnąco/malejąco', () => {
    const items = [mk('a', { n: 5 }), mk('b', { n: 1 }), mk('c', { n: 9 })];
    expect(applyView(items, columns, { sorts: [{ columnId: 'n', dir: 'asc' }] }).map(i => i.id)).toEqual(['b', 'a', 'c']);
    expect(applyView(items, columns, { sorts: [{ columnId: 'n', dir: 'desc' }] }).map(i => i.id)).toEqual(['c', 'a', 'b']);
  });

  it('null-liczby NIE interleave jako 0 — puste zawsze na końcu przy asc (regresja sortKey)', () => {
    const items = [mk('a', { n: 5 }), mk('empty', {}), mk('c', { n: -2 })];
    // Poprawnie: -2, 5, potem puste. Bug: puste=0 → wskakuje między -2 a 5.
    expect(applyView(items, columns, { sorts: [{ columnId: 'n', dir: 'asc' }] }).map(i => i.id)).toEqual(['c', 'a', 'empty']);
  });

  it('multi-sort: pierwszy klucz dominuje', () => {
    const items = [mk('a', { s: 'todo', n: 2 }), mk('b', { s: 'todo', n: 1 }), mk('c', { s: 'done', n: 9 })];
    const out = applyView(items, columns, { sorts: [{ columnId: 's', dir: 'asc' }, { columnId: 'n', dir: 'asc' }] }).map(i => i.id);
    expect(out).toEqual(['b', 'a', 'c']); // todo(1), todo(2), done
  });
});

describe('groupItemsByColumn', () => {
  it('status → wiadra wg etykiet + __empty__', () => {
    const items = [mk('a', { s: 'todo' }), mk('b', { s: 'done' }), mk('c', {})];
    const groups = groupItemsByColumn(items, statusCol);
    const byKey = Object.fromEntries(groups.map(g => [g.key, g.items.map(i => i.id)]));
    expect(byKey.todo).toEqual(['a']);
    expect(byKey.done).toEqual(['b']);
    expect(byKey.__empty__).toEqual(['c']);
  });
});

describe('applyView — filtr osób, „Ja” i „Moje”', () => {
  const peopleCol = { id: 'p', type: 'people' };
  const cols = [...columns, peopleCol];
  const items = [
    mk('mine', { p: [{ email: 'Ja@Example.pl', name: 'Ja' }] }),
    mk('anna', { p: [{ email: 'anna@example.pl', name: 'Anna' }] }),
    mk('nobody', {}),
  ];
  it('wybrana osoba (bez wielkości liter)', () => {
    expect(applyView(items, cols, { filters: [{ columnId: 'p', op: 'is', value: 'ANNA@example.pl' }] }).map(i => i.id)).toEqual(['anna']);
  });
  it('„Ja” rozwija się do bieżącego użytkownika', () => {
    expect(applyView(items, cols, { me: 'ja@example.pl', filters: [{ columnId: 'p', op: 'is', value: ME }] }).map(i => i.id)).toEqual(['mine']);
  });
  it('„Ja” bez znanego użytkownika nie zawęża', () => {
    expect(applyView(items, cols, { filters: [{ columnId: 'p', op: 'is', value: ME }] })).toHaveLength(3);
  });
  it('chip „Moje” = przypisane do mnie w dowolnej kolumnie Osoby', () => {
    expect(applyView(items, cols, { mine: true, me: 'ja@example.pl' }).map(i => i.id)).toEqual(['mine']);
    expect(applyView(items, cols, { mine: true })).toHaveLength(3);
  });
});

describe('applyView — filtry bez wartości są pomijane', () => {
  const items = [mk('a', { s: 'todo', t: 'x' }), mk('b', {})];
  it('status/tekst/liczba bez wartości nie zawężają', () => {
    expect(applyView(items, columns, { filters: [{ columnId: 's', op: 'is', value: null }] })).toHaveLength(2);
    expect(applyView(items, columns, { filters: [{ columnId: 't', op: 'contains', value: '  ' }] })).toHaveLength(2);
    expect(applyView(items, columns, { filters: [{ columnId: 'n', op: 'eq', value: '' }] })).toHaveLength(2);
  });
  it('is_empty działa bez wartości', () => {
    expect(applyView(items, columns, { filters: [{ columnId: 's', op: 'is_empty' }] }).map(i => i.id)).toEqual(['b']);
  });
  it('filterHasValue / hasActiveFilters', () => {
    expect(filterHasValue({ op: 'is', value: false })).toBe(true);
    expect(filterHasValue({ op: 'is', value: null })).toBe(false);
    expect(hasActiveFilters({ filters: [{ op: 'is', value: null }] })).toBe(false);
    expect(hasActiveFilters({ mine: true })).toBe(true);
  });
});
