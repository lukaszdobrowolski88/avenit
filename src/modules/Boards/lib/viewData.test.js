import { describe, it, expect } from 'vitest';
import { applyView, groupItemsByColumn } from './viewData';

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
