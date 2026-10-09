import { describe, it, expect } from 'vitest';
import {
  modulePaths, dueOf, isOverdueYmd, collectMyBoardTasks, boardTaskRows,
} from './myBoardTasks';

const labels = [
  { id: 'todo', title: 'Do zrobienia', color: '#6b7280' },
  { id: 'working', title: 'W trakcie', color: '#d97706' },
  { id: 'done', title: 'Gotowe', color: '#16a34a' },
];

describe('modulePaths', () => {
  it('app_modules → { klucz: ścieżka }', () => {
    expect(modulePaths([{ key: 'media', path: '/media' }, { key: 'x' }, null])).toEqual({ media: '/media' });
  });
});

describe('termin', () => {
  it('data i oś czasu (koniec)', () => {
    expect(dueOf({ id: 'd', type: 'date' }, { d: '2026-10-09' })).toBe('2026-10-09');
    expect(dueOf({ id: 't', type: 'timeline' }, { t: { start: '2026-10-01', end: '2026-10-05' } })).toBe('2026-10-05');
    expect(dueOf({ id: 'd', type: 'date' }, { d: null })).toBeNull();
    expect(dueOf(null, {})).toBeNull();
  });
  it('po terminie = przed dziś', () => {
    expect(isOverdueYmd('2026-10-07', '2026-10-08')).toBe(true);
    expect(isOverdueYmd('2026-10-08', '2026-10-08')).toBe(false);
    expect(isOverdueYmd(null, '2026-10-08')).toBe(false);
  });
});

describe('collectMyBoardTasks', () => {
  const boards = [
    { id: 'b1', name: 'Zadania Media Team', source_kind: 'media_tasks', module_key: 'media' },
    { id: 'b2', name: 'Remont' },
    { id: 'tpl', name: 'Szablon', is_template: true },
  ];
  const columns = [
    { id: 'p1', board_id: 'b1', type: 'people', display_order: 1 },
    { id: 's1', board_id: 'b1', type: 'status', settings: { labels }, display_order: 2 },
    { id: 'd1', board_id: 'b1', type: 'date', display_order: 3 },
    { id: 'p2', board_id: 'b2', type: 'people', display_order: 1 },
    { id: 'p3', board_id: 'b2', type: 'people', display_order: 2 },
    { id: 'pt', board_id: 'tpl', type: 'people', display_order: 1 },
  ];
  const me = { email: 'Ja@X.pl', name: 'Ja' };
  const items = [
    { id: 'a', board_id: 'b1', name: 'Kamera', cells: { p1: [me], s1: 'working', d1: '2026-10-20' } },
    { id: 'b', board_id: 'b1', name: 'Mikrofony', cells: { p1: [me], s1: 'done', d1: '2026-10-01' } },
    { id: 'c', board_id: 'b2', name: 'Farba', cells: { p3: [{ email: 'ja@x.pl' }] } },
    { id: 'd', board_id: 'b2', name: 'Cudze', cells: { p2: [{ email: 'inny@x.pl' }] } },
    { id: 'e', board_id: 'tpl', name: 'Wzór', cells: { pt: [me] } },
    { id: 'f', board_id: 'b1', name: 'Tekst', cells: { notes: [me] } },
  ];
  const modules = [{ key: 'media', path: '/media', label: 'MediaTeam' }];
  const rows = collectMyBoardTasks({ boards, columns, items, email: 'ja@x.pl', modules });

  it('tylko moje elementy (dowolna kolumna Osoby), bez szablonów i bez komórek spoza kolumn Osoby', () => {
    expect(rows.map((r) => r.id)).toEqual(['b', 'a', 'c']);
  });
  it('status, gotowe, termin, nazwa modułu i link', () => {
    const a = rows.find((r) => r.id === 'a');
    expect(a.status.title).toBe('W trakcie');
    expect(a.done).toBe(false);
    expect(a.due).toBe('2026-10-20');
    expect(a.boardName).toBe('MediaTeam');
    expect(a.link).toBe('/media?item=a');
    expect(a.statusColId).toBe('s1');
    expect(a.doneLabelId).toBe('done');
    expect(rows.find((r) => r.id === 'b').done).toBe(true);
    const c = rows.find((r) => r.id === 'c');
    expect(c.boardName).toBe('Remont');
    expect(c.status).toBeNull();
    expect(c.doneLabelId).toBeNull();
    expect(c.link).toBe('/projekty?board=b2&item=c');
  });
  it('link z jednej reguły (@avenit/shared): tablica Kalendarza → /wydarzenia?item=', () => {
    const cal = collectMyBoardTasks({
      boards: [{ id: 'bc', name: 'Zadania', source_kind: 'tasks', module_key: 'calendar' }],
      columns: [{ id: 'pc', board_id: 'bc', type: 'people' }],
      items: [{ id: 'z1', board_id: 'bc', name: 'Klucze', cells: { pc: [me] } }],
      email: 'ja@x.pl',
    });
    expect(cal[0].link).toBe('/wydarzenia?item=z1');
  });
  it('„gotowe” z jawnej flagi etykiety ma pierwszeństwo przed nazwą', () => {
    const flagged = [{ id: 'x', title: 'Odhaczone', done: true }, { id: 'y', title: 'Gotowe (nie)', done: false }];
    const rowsF = collectMyBoardTasks({
      boards: [{ id: 'bf', name: 'F' }],
      columns: [{ id: 'pf', board_id: 'bf', type: 'people' }, { id: 'sf', board_id: 'bf', type: 'status', settings: { labels: flagged } }],
      items: [
        { id: 'f1', board_id: 'bf', name: 'A', cells: { pf: [me], sf: 'x' } },
        { id: 'f2', board_id: 'bf', name: 'B', cells: { pf: [me], sf: 'y' } },
      ],
      email: 'ja@x.pl',
    });
    expect(rowsF.find((r) => r.id === 'f1').done).toBe(true);
    expect(rowsF.find((r) => r.id === 'f2').done).toBe(false);
    expect(rowsF[0].doneLabelId).toBe('x');
  });
  it('kilka kont tej samej osoby (lista e-maili) i osoby z kolumn „Osoby”', () => {
    const r2 = collectMyBoardTasks({ boards, columns, items, email: ['inny@x.pl', 'nikt@x.pl'], modules });
    expect(r2.map((r) => r.id)).toEqual(['d']);
    expect(r2[0].people).toEqual([{ email: 'inny@x.pl' }]);
  });
  it('boardTaskRows bez filtra — wszystkie elementy (np. zadania wydarzenia)', () => {
    const all = boardTaskRows({ boards, columns, items, modules });
    expect(all.map((r) => r.id).sort()).toEqual(['a', 'b', 'c', 'd', 'f']);
  });
  it('bez e-maila — pusto', () => {
    expect(collectMyBoardTasks({ boards, columns, items, email: '' })).toEqual([]);
  });
});
