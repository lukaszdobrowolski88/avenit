import { describe, it, expect } from 'vitest';
import { resolveDragEnd } from './dnd';

// Dwie grupy: g1 [a,b,c], g2 [d]
const items = [
  { id: 'a', group_id: 'g1', display_order: 0 },
  { id: 'b', group_id: 'g1', display_order: 1 },
  { id: 'c', group_id: 'g1', display_order: 2 },
  { id: 'd', group_id: 'g2', display_order: 0 },
];
const groupIds = ['g1', 'g2', 'g3']; // g3 pusta
const base = { items, groupIds, visibleItems: items };

describe('resolveDragEnd', () => {
  it('reorder w obrębie grupy (a nad c)', () => {
    expect(resolveDragEnd({ ...base, activeId: 'a', overId: 'c' }))
      .toEqual({ type: 'reorder', groupId: 'g1', orderedIds: ['b', 'c', 'a'] });
  });

  it('przeniesienie MIĘDZY grupami — upuszczenie na element w innej grupie', () => {
    expect(resolveDragEnd({ ...base, activeId: 'a', overId: 'd' }))
      .toEqual({ type: 'move', itemId: 'a', toGroup: 'g2', toIndex: 0 });
  });

  it('przeniesienie do PUSTEJ grupy (upuszczenie na grupę) → na koniec', () => {
    expect(resolveDragEnd({ ...base, activeId: 'a', overId: 'g3' }))
      .toEqual({ type: 'move', itemId: 'a', toGroup: 'g3', toIndex: 0 });
  });

  it('aktywne sortowanie blokuje ręczny reorder w grupie', () => {
    expect(resolveDragEnd({ ...base, activeId: 'a', overId: 'c', sortActive: true })).toBeNull();
  });

  it('sortowanie NIE blokuje przenoszenia między grupami', () => {
    expect(resolveDragEnd({ ...base, activeId: 'a', overId: 'd', sortActive: true }))
      .toMatchObject({ type: 'move', toGroup: 'g2' });
  });

  it('upuszczenie na samego siebie / brak over → null', () => {
    expect(resolveDragEnd({ ...base, activeId: 'a', overId: 'a' })).toBeNull();
    expect(resolveDragEnd({ ...base, activeId: 'a', overId: null })).toBeNull();
    expect(resolveDragEnd({ ...base, activeId: 'nieistnieje', overId: 'c' })).toBeNull();
  });
});
