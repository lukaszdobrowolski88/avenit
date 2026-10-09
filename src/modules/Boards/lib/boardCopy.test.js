import { describe, it, expect } from 'vitest';
import { planBoardCopy, remapIds, chunk, newId } from './boardCopy';

const seq = () => { let n = 0; return () => `new-${++n}`; };

const SRC = {
  columns: [
    { id: 'c-status', name: 'Status', type: 'status', display_order: 0, width: 140, settings: { labels: [{ id: 'done', title: 'Gotowe' }] } },
    { id: 'c-dep', name: 'Zależy od', type: 'dependency', display_order: 1, settings: { sourceColumnId: 'c-status' } },
  ],
  groups: [{ id: 'g1', name: 'A', color: '#16a34a', display_order: 0 }, { id: 'g2', name: 'B', display_order: 1 }],
  items: [
    { id: 'sub', group_id: 'g1', parent_item_id: 'i1', name: 'Pod', cells: {}, display_order: 0 },
    { id: 'i1', group_id: 'g1', parent_item_id: null, name: 'Rodzic', description: 'opis', cells: { 'c-status': 'done', 'c-dep': ['i2'] }, display_order: 0, event_id: 'ev', source_id: 'x' },
    { id: 'i2', group_id: 'g2', parent_item_id: null, name: 'Drugi', cells: { 'c-dep': ['other-board-item'] }, display_order: 1 },
    { id: 'orphan', group_id: 'g2', parent_item_id: 'missing', name: 'Sierota', cells: {}, display_order: 2 },
  ],
  views: [{ id: 'v1', name: 'Kanban', type: 'kanban', is_default: true, config: { groupBy: 'c-status', widths: { 'c-dep': 200 }, hidden: ['c-dep'] } }],
  formSettings: { title: 'Zgłoś', fields: ['c-status'] },
};

describe('planBoardCopy', () => {
  const plan = planBoardCopy(SRC, { boardId: 'B2', userEmail: 'ja@x.pl', makeId: seq() });
  const map = plan.idMap;
  const allItems = plan.itemLevels.flat();

  it('nadaje nowe id kolumnom, grupom, elementom i widokom (wszystkie na nowej tablicy)', () => {
    expect(plan.columns.map((c) => c.id)).toEqual([map.get('c-status'), map.get('c-dep')]);
    expect([...plan.columns, ...plan.groups, ...allItems, ...plan.views].every((r) => r.board_id === 'B2')).toBe(true);
    expect(new Set(map.values()).size).toBe(map.size);
  });

  it('podelementy po rodzicach, z przemapowanym parent_item_id; sierota staje się elementem', () => {
    expect(plan.itemLevels).toHaveLength(2);
    expect(plan.itemLevels[0].map((i) => i.name)).toEqual(['Rodzic', 'Drugi', 'Sierota']);
    const sub = plan.itemLevels[1][0];
    expect(sub.name).toBe('Pod');
    expect(sub.parent_item_id).toBe(map.get('i1'));
    expect(plan.itemLevels[0].find((i) => i.name === 'Sierota').parent_item_id).toBeNull();
  });

  it('komórki: klucze kolumn i odwołania do elementów tej tablicy przemapowane, obce zostają', () => {
    const parent = allItems.find((i) => i.name === 'Rodzic');
    expect(parent.cells).toEqual({ [map.get('c-status')]: 'done', [map.get('c-dep')]: [map.get('i2')] });
    expect(parent.group_id).toBe(map.get('g1'));
    expect(parent.description).toBe('opis');
    expect(parent.created_by).toBe('ja@x.pl');
    expect(parent).not.toHaveProperty('event_id');
    expect(parent).not.toHaveProperty('source_id');
    const second = allItems.find((i) => i.name === 'Drugi');
    expect(second.cells[map.get('c-dep')]).toEqual(['other-board-item']);
  });

  it('ustawienia kolumn, config widoków i pola formularza wskazują nowe kolumny', () => {
    expect(plan.columns[1].settings.sourceColumnId).toBe(map.get('c-status'));
    expect(plan.views[0].config).toEqual({ groupBy: map.get('c-status'), widths: { [map.get('c-dep')]: 200 }, hidden: [map.get('c-dep')] });
    expect(plan.views[0].is_default).toBe(true);
    expect(plan.formSettings).toEqual({ title: 'Zgłoś', fields: [map.get('c-status')] });
  });

  it('withItems: false — sama struktura', () => {
    const p = planBoardCopy(SRC, { boardId: 'B3', withItems: false, makeId: seq() });
    expect(p.itemLevels).toEqual([]);
    expect(p.columns).toHaveLength(2);
    expect(p.views).toHaveLength(1);
  });
});

describe('remapIds / chunk / newId', () => {
  it('remapIds zostawia liczby, null i nieznane napisy', () => {
    const m = new Map([['a', 'A']]);
    expect(remapIds({ a: ['a', 'b', 1, null], x: { y: 'a' } }, m)).toEqual({ A: ['A', 'b', 1, null], x: { y: 'A' } });
  });
  it('chunk dzieli na paczki', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });
  it('newId daje UUID v4', () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
