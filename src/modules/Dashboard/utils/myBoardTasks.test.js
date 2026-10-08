import { describe, it, expect } from 'vitest';
import {
  taskBoardModuleKey, taskLink, isDoneLabel, doneLabelOf, dueOf, isOverdueYmd, collectMyBoardTasks,
} from './myBoardTasks';

const labels = [
  { id: 'todo', title: 'Do zrobienia', color: '#6b7280' },
  { id: 'working', title: 'W trakcie', color: '#d97706' },
  { id: 'done', title: 'Gotowe', color: '#16a34a' },
];

describe('linki do zadania', () => {
  const modules = [{ key: 'media', path: '/media', label: 'MediaTeam' }, { key: 'chor', path: '/chor', label: 'Chór' }];
  it('zakładka Zadania modułu → ścieżka modułu + ?item=', () => {
    expect(taskLink({ id: 'b', source_kind: 'media_tasks', module_key: 'media' }, 'i1', modules)).toBe('/media?item=i1');
    expect(taskLink({ id: 'b', source_kind: 'home_group_tasks' }, 'i1', [])).toBe('/home-groups?item=i1');
    expect(taskLink({ id: 'b', source_kind: 'custom_chor_tasks', module_key: 'chor' }, 'i1', modules)).toBe('/chor?item=i1');
    expect(taskLink({ id: 'b', source_kind: 'custom_x_tasks' }, 'i1', [])).toBe('/module/x?item=i1');
  });
  it('Projekty i tablice z zakładki „Tablica” → /projekty', () => {
    expect(taskLink({ id: 'b1' }, 'i1')).toBe('/projekty?board=b1&item=i1');
    expect(taskLink({ id: 'b1', module_key: 'chor' }, 'i1', modules)).toBe('/projekty?board=b1&item=i1');
    expect(taskBoardModuleKey({ module_key: 'chor' })).toBeNull();
  });
});

describe('etykieta „gotowe”', () => {
  it('rozpoznaje typowe nazwy, także bez polskich znaków', () => {
    expect(isDoneLabel({ id: 'done', title: 'X' })).toBe(true);
    expect(isDoneLabel({ id: 's1', title: 'Ukończone' })).toBe(true);
    expect(isDoneLabel({ id: 'zamkniete', title: 'Zamknięte' })).toBe(true);
    expect(isDoneLabel({ id: 's2', title: 'Niegotowe' })).toBe(false);
    expect(isDoneLabel({ id: 'working', title: 'W trakcie' })).toBe(false);
    expect(isDoneLabel(null)).toBe(false);
  });
  it('kolumna bez etykiety „gotowe” — brak szybkiego odhaczania', () => {
    expect(doneLabelOf({ settings: { labels } }).id).toBe('done');
    expect(doneLabelOf({ settings: { labels: [{ id: 'a', title: 'Nowe' }] } })).toBeNull();
    expect(doneLabelOf(null)).toBeNull();
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
  it('bez e-maila — pusto', () => {
    expect(collectMyBoardTasks({ boards, columns, items, email: '' })).toEqual([]);
  });
});
