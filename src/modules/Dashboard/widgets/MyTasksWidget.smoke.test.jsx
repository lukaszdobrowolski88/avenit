// Test dymny „Moje zadania” na Pulpicie: zadania z tablic (kolumna „Osoby”) + osobiste, sortowanie
// po terminie, zaległe, link do elementu i szybkie „gotowe” (świeże komórki + etykieta „gotowe”).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const h = vi.hoisted(() => ({ DB: {}, writes: [], forbidden: new Set() }));

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

vi.mock('../../../lib/supabase', () => ({ supabase: { from: (t) => chain(t) } }));
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

  it('„gotowe” zapisuje świeże komórki z etykietą „gotowe” i chowa zadanie', async () => {
    renderWidget();
    await screen.findByText('Nagłośnienie');
    // Ktoś w międzyczasie zmienił inną komórkę — nie może zginąć.
    h.DB.board_items[0].cells = { ...h.DB.board_items[0].cells, note: 'nowe' };
    fireEvent.click(screen.getByLabelText(/Nagłośnienie$/));
    await waitFor(() => expect(h.writes.some((w) => w.table === 'board_items' && w.op === 'update')).toBe(true));
    const upd = h.writes.find((w) => w.table === 'board_items' && w.op === 'update');
    expect(upd.payload.cells).toMatchObject({ s1: 'done', note: 'nowe', d1: '2020-01-05' });
    expect(upd.filters).toEqual([['eq', 'id', 'i1']]);
    await waitFor(() => expect(screen.queryByText('Nagłośnienie')).toBeNull());
    await waitFor(() => expect(h.writes.some((w) => w.table === 'board_item_activity' && w.payload.action === 'status_changed')).toBe(true));
  });
});
