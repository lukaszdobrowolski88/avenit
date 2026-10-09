import { describe, it, expect } from 'vitest';
import { boardItemResults } from './commandPaletteItems';

const labels = { boards: 'Projekty', media: 'Media Team', calendar: 'Wydarzenia' };
const labelFor = (k, f) => labels[k] || f;

describe('boardItemResults (⌘K — elementy tablic)', () => {
  const boards = [
    { id: 'p', name: 'Remont sali', module_key: null, source_kind: null },
    { id: 'm', name: 'Media Team', module_key: 'media', source_kind: 'media_tasks' },
    { id: 'c', name: 'Zadania', module_key: 'calendar', source_kind: 'tasks' },
    { id: 'arch', name: 'Stara', is_archived: true },
    { id: 'tpl', name: 'Szablon', is_template: true },
  ];
  const items = [
    { id: 1, board_id: 'p', name: 'Kupić farbę' },
    { id: 2, board_id: 'm', name: 'Nagrać kazanie' },
    { id: 3, board_id: 'c', name: 'Zamówić kwiaty' },
    { id: 4, board_id: 'arch', name: 'Archiwalne' },
    { id: 5, board_id: 'tpl', name: 'Z szablonu' },
    { id: 6, board_id: 'nieznana', name: 'Bez dostępu' },
  ];

  it('linki przez taskItemLink, podpis = tablica · moduł, bez archiwum/szablonów', () => {
    const r = boardItemResults(items, boards, { labelFor, paths: { media: '/media' } });
    expect(r).toEqual([
      { id: 'board-item-1', label: 'Kupić farbę', sub: 'Remont sali · Projekty', path: '/projekty?board=p&item=1' },
      { id: 'board-item-2', label: 'Nagrać kazanie', sub: 'Media Team', path: '/media?item=2' },
      { id: 'board-item-3', label: 'Zamówić kwiaty', sub: 'Zadania · Wydarzenia', path: '/wydarzenia?item=3' },
    ]);
  });

  it('pusto, gdy brak danych', () => {
    expect(boardItemResults([], [])).toEqual([]);
    expect(boardItemResults(null, null)).toEqual([]);
  });
});
