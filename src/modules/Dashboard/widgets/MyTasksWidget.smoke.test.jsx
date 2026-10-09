// Test dymny „Moje zadania” na Pulpicie: zadania z tablic (kolumna „Osoby”) + osobiste, sortowanie
// po terminie, zaległe, link do elementu i szybkie „gotowe” (fn board-item-patch scala komórkę
// statusu na serwerze — bez nadpisywania innych komórek).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const h = vi.hoisted(() => ({ DB: {}, writes: [], forbidden: new Set(), calls: [] }));

function chain(table) {
  const state = { op: 'select', filters: [] };
  const result = () => {
    if (state.op !== 'select') {
      h.writes.push({ table, op: state.op, payload: state.payload, filters: state.filters });
      return { data: null, error: null };
    }
    if (h.forbidden.has(table)) return { data: null, error: { message: 'Brak dostępu', code: '403' }, status: 403 };
    let rows = h.DB[table] ?? [];
    for (const [kind, c, v] of state.filters) {
      rows = rows.filter((r) => (kind === 'in' ? v.map(String).includes(String(r[c])) : String(r[c]) === String(v)));
    }
    if (state.single) return { data: rows[0] ?? null, error: null };
    return { data: rows, error: null };
  };
  const proxy = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') return (res, rej) => Promise.resolve(result()).then(res, rej);
      return (...args) => {
        if (['insert', 'update', 'upsert', 'delete'].includes(prop)) { state.op = prop; state.payload = args[0]; }
        if (prop === 'eq') state.filters.push(['eq', ...args]);
        if (prop === 'in') state.filters.push(['in', ...args]);
        if (prop === 'maybeSingle' || prop === 'single') { state.single = true; return Promise.resolve(result()); }
        return proxy;
      };
    },
  });
  return proxy;
}

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: (t) => chain(t),
    functions: {
      invoke: async (name, { body } = {}) => {
        h.calls.push({ name, body });
        if (name !== 'board-item-patch') return { data: null, error: null };
        const it = h.DB.board_items.find((x) => x.id === body.item_id);
        it.cells = { ...(it.cells || {}), ...body.cells };
        return { data: { item: it }, error: null };
      },
    },
  },
}));
vi.mock('../../../lib/toast', () => ({ toast: { success: () => {}, error: () => {}, info: () => {} } }));
vi.mock('../../../lib/dialog', () => ({ confirmDialog: async () => true }));
vi.mock('../../../hooks/useAppModules', () => ({ useAppModules: () => ({ modules: [{ key: 'media', path: '/media', label: 'MediaTeam' }] }) }));

import MyTasksWidget from './MyTasksWidget';

const labels = [
  { id: 'todo', title: 'Do zrobienia', color: '#c4c4c4' },
  { id: 'done', title: 'Gotowe', color: '#00c875' },
];
const me = { email: 'ja@test.pl', name: 'Ja' };

function seed() {
  h.writes = [];
  h.calls = [];
  h.forbidden = new Set();
  h.DB = {
    boards: [
      { id: 'b1', name: 'Zadania Media Team', module_key: 'media', source_kind: 'media_tasks', is_archived: false },
      { id: 'b2', name: 'Remont sali', module_key: null, source_kind: null, is_archived: false },
    ],
    board_columns: [
      { id: 'p1', board_id: 'b1', type: 'people', display_order: 1 },
      { id: 's1', board_id: 'b1', type: 'status', settings: { labels }, display_order: 2 },
      { id: 'd1', board_id: 'b1', type: 'date', display_order: 3 },
      { id: 'p2', board_id: 'b2', type: 'people', display_order: 1 },
    ],
    board_items: [
      { id: 'i1', board_id: 'b1', name: 'Nagłośnienie', cells: { p1: [me], s1: 'todo', d1: '2020-01-05', note: 'x' } },
      { id: 'i2', board_id: 'b2', name: 'Malowanie', cells: { p2: [me] } },
      { id: 'i3', board_id: 'b1', name: 'Gotowe już', cells: { p1: [me], s1: 'done' } },
      { id: 'i4', board_id: 'b2', name: 'Nie moje', cells: { p2: [{ email: 'inny@test.pl' }] } },
    ],
    board_item_activity: [],
  };
}

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname}{loc.search}</div>;
}

function renderWidget(tasks = []) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="*" element={<><MyTasksWidget tasks={tasks} userEmail="ja@test.pl" userName="Ja" onRefresh={() => {}} /><Where /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MyTasksWidget', () => {
  beforeEach(seed);

  it('pokazuje moje zadania z tablic i osobiste, sortuje po terminie, ukrywa gotowe', async () => {
    renderWidget([{ id: 'u1', source: 'personal', title: 'Zadzwonić', status: 'todo', due_date: '2099-01-01' }]);
    await screen.findByText('Nagłośnienie');
    const names = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(names[0]).toContain('Nagłośnienie'); // najwcześniejszy termin
    expect(names[1]).toContain('Zadzwonić');
    expect(names[2]).toContain('Malowanie');    // bez terminu na końcu
    expect(screen.queryByText('Nie moje')).toBeNull();
    expect(screen.queryByText('Gotowe już')).toBeNull();
    expect(screen.getByText('MediaTeam')).toBeTruthy();
    expect(screen.getByText(/Zaległe/)).toBeTruthy();
    // Malowanie: tablica bez kolumny statusu — bez szybkiego odhaczania
    expect(screen.queryByLabelText(/Malowanie$/)).toBeNull();
  });

  it('bez dostępu do tablic (403) — zadania osobiste i brak komunikatu o błędzie', async () => {
    h.forbidden = new Set(['boards', 'board_columns']);
    renderWidget([{ id: 'u1', source: 'personal', title: 'Zadzwonić', status: 'todo', due_date: null }]);
    await screen.findByText('Zadzwonić');
    expect(screen.queryByText('Nagłośnienie')).toBeNull();
    expect(screen.queryByText(/Nie udało się wczytać/)).toBeNull();
  });

  it('klik w zadanie z tablicy otwiera je w module (?item=)', async () => {
    renderWidget();
    fireEvent.click(await screen.findByText('Nagłośnienie'));
    expect(screen.getByTestId('where').textContent).toBe('/media?item=i1');
  });

  it('„gotowe” wysyła tylko komórkę statusu (board-item-patch) i chowa zadanie', async () => {
    renderWidget();
    await screen.findByText('Nagłośnienie');
    // Ktoś w międzyczasie zmienił inną komórkę — serwer scala, więc nie zginie.
    h.DB.board_items[0].cells = { ...h.DB.board_items[0].cells, note: 'nowe' };
    fireEvent.click(screen.getByLabelText(/Nagłośnienie$/));
    await waitFor(() => expect(h.calls.some((c) => c.name === 'board-item-patch')).toBe(true));
    const call = h.calls.find((c) => c.name === 'board-item-patch');
    expect(call.body).toEqual({ item_id: 'i1', cells: { s1: 'done' } });
    expect(h.DB.board_items[0].cells).toMatchObject({ s1: 'done', note: 'nowe', d1: '2020-01-05' });
    expect(h.writes.some((w) => w.table === 'board_items')).toBe(false);
    await waitFor(() => expect(screen.queryByText('Nagłośnienie')).toBeNull());
    await waitFor(() => expect(h.writes.some((w) => w.table === 'board_item_activity' && w.payload.action === 'status_changed')).toBe(true));
  });

  it('zadanie osobiste przypisane przez kogoś pokazuje, kto je przypisał', async () => {
    renderWidget([{ id: 'u2', source: 'personal', title: 'Oddzwonić', status: 'todo', user_email: 'szef@test.pl', assigned_to_email: 'ja@test.pl', assigned_by: 'Pastor Jan' }]);
    await screen.findByText('Oddzwonić');
    expect(screen.getByText('Od: Pastor Jan')).toBeTruthy();
  });

  it('podany z Pulpitu wynik useMyBoardTasks — widżet nie czyta tablic drugi raz', async () => {
    const shared = { tasks: [{ id: 'x1', kind: 'board', name: 'Z Pulpitu', boardName: 'Tablica', due: null, status: null, done: false, link: '/projekty?board=b&item=x1' }], loading: false, error: null, reload: () => {}, markDone: async () => true };
    let boardReads = 0;
    const orig = h.DB;
    h.DB = new Proxy(orig, { get(t, k) { if (k === 'boards') boardReads += 1; return t[k]; } });
    render(
      <MemoryRouter initialEntries={['/']}>
        <MyTasksWidget tasks={[]} boardTasks={shared} userEmail="ja@test.pl" userName="Ja" onRefresh={() => {}} />
      </MemoryRouter>,
    );
    await screen.findByText('Z Pulpitu');
    expect(boardReads).toBe(0);
  });
});
