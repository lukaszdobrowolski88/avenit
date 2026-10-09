import { describe, it, expect } from 'vitest';
import { buildMyWorkRows, bucketize, dueColumn, dueOf, isAssigned, rowsFromFn } from './myWork';

const boards = [
  { id: 'p', name: 'Remont', color: '#00c875', module_key: null, source_kind: null },
  { id: 'm', name: 'Media', module_key: 'media', source_kind: 'media_tasks' },
  { id: 'a', name: 'Archiwum', is_archived: true },
  { id: 't', name: 'Szablon', is_template: true },
];
const columns = [
  { id: 'pp', board_id: 'p', type: 'people' },
  { id: 'ps', board_id: 'p', type: 'status', settings: { labels: [{ id: 'd', title: 'Gotowe', color: '#00c875' }, { id: 'w', title: 'Robię' }] } },
  { id: 'pd', board_id: 'p', type: 'date', display_order: 3 },
  { id: 'pdue', board_id: 'p', type: 'date', display_order: 5, settings: { role: 'due' } },
  { id: 'mp', board_id: 'm', type: 'people' },
  { id: 'mt', board_id: 'm', type: 'timeline' },
  { id: 'ap', board_id: 'a', type: 'people' },
  { id: 'tp', board_id: 't', type: 'people' },
];
const me = [{ email: 'Ja@X.pl', name: 'Ja' }];
const items = [
  { id: 1, board_id: 'p', name: 'Farba', cells: { pp: me, ps: 'd', pdue: '2026-10-09', pd: '2026-01-01' } },
  { id: 2, board_id: 'm', name: 'Nagranie', cells: { mp: ['ja@x.pl'], mt: { start: '2026-10-01', end: '2026-10-20' } } },
  { id: 3, board_id: 'a', name: 'Stare', cells: { ap: me } },
  { id: 4, board_id: 't', name: 'Szablon', cells: { tp: me } },
  { id: 5, board_id: 'p', name: 'Nie moje', cells: { pp: [{ email: 'inny@x.pl' }] } },
];

describe('buildMyWorkRows', () => {
  const rows = buildMyWorkRows({ items, boards, columns, email: 'ja@x.pl', paths: { media: '/media' } });

  it('pomija archiwum, szablony i cudze; e-mail bez względu na wielkość liter', () => {
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
  });
  it('termin z kolumny z rolą „termin”, oś czasu → koniec; zrobione przez isDoneLabel; link przez taskItemLink', () => {
    const [a, b] = rows;
    expect(a).toMatchObject({ due: '2026-10-09', done: true, link: '/projekty?board=p&item=1', boardName: 'Remont' });
    expect(a.status.title).toBe('Gotowe');
    expect(a.boardColor).not.toBe('#00c875'); // kolor Monday → paleta aplikacji
    expect(b).toMatchObject({ due: '2026-10-20', done: false, status: null, link: '/media?item=2' });
  });
});

describe('pomocnicze', () => {
  it('dueColumn / dueOf', () => {
    expect(dueColumn(columns.filter((c) => c.board_id === 'p')).id).toBe('pdue');
    expect(dueOf({ id: 't', type: 'timeline' }, { t: { start: '2026-01-02' } })).toBe('2026-01-02');
    expect(dueOf({ id: 'd', type: 'date' }, { d: 'zła' })).toBeNull();
  });
  it('isAssigned', () => {
    expect(isAssigned({ x: [{ email: 'A@b.pl' }] }, [{ id: 'x' }], 'a@B.pl')).toBe(true);
    expect(isAssigned({ x: 'a@b.pl' }, [{ id: 'x' }], 'a@b.pl')).toBe(false);
  });
  it('bucketize', () => {
    const g = bucketize([
      { id: 1, name: 'a', due: '2026-10-01' }, { id: 2, name: 'b', due: '2026-10-09' }, { id: 3, name: 'c', due: '2026-10-10' },
      { id: 4, name: 'd', due: '2026-12-01' }, { id: 5, name: 'e', due: null }, { id: 6, name: 'f', due: '2026-10-01', done: true },
    ], '2026-10-09', '2026-10-11');
    expect(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.map((r) => r.id)])))
      .toEqual({ overdue: [1], today: [2], week: [3], later: [4], none: [5], done: [6] });
  });
  it('rowsFromFn — zapas z fn my-board-items', () => {
    const r = rowsFromFn([{ id: 9, board_id: 'm', board_name: 'Media', module_key: 'media', source_kind: 'media_tasks', name: 'X', date: '2026-10-01', end: '2026-10-03', status: null, done: false }]);
    expect(r[0]).toMatchObject({ id: 9, due: '2026-10-03', link: '/media?item=9' });
  });
});
