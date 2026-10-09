// Zakładka „Zadania” wydarzenia: lista elementów tablic z event_id, „Dodaj z szablonu” tworzy
// wszystkie pozycje szablonu tablicy modułu (termin = data wydarzenia + przesunięcie, event_id).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const h = vi.hoisted(() => ({ DB: {}, writes: [], toasts: [] }));

function chain(table) {
  const state = { op: 'select', filters: [] };
  const result = () => {
    if (state.op !== 'select') {
      h.writes.push({ table, op: state.op, payload: state.payload, filters: state.filters });
      const rows = Array.isArray(state.payload) ? state.payload.map((r, i) => ({ id: `new-${i}`, ...r })) : [{ id: 'new-0', ...state.payload }];
      return { data: state.single ? rows[0] : rows, error: null };
    }
    let rows = h.DB[table] ?? [];
    for (const [kind, c, v] of state.filters) {
      rows = rows.filter((r) => (kind === 'in' ? v.map(String).includes(String(r[c])) : String(r[c]) === String(v)));
    }
    if (state.limit) rows = rows.slice(0, state.limit);
    return { data: state.single ? rows[0] ?? null : rows, error: null };
  };
  const proxy = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') return (res, rej) => Promise.resolve(result()).then(res, rej);
      return (...args) => {
        if (['insert', 'update', 'upsert', 'delete'].includes(prop)) { state.op = prop; state.payload = args[0]; }
        if (prop === 'eq' || prop === 'in') state.filters.push([prop, ...args]);
        if (prop === 'limit' && state.op === 'select') state.limit = args[0];
        if (prop === 'maybeSingle' || prop === 'single') { state.single = true; return Promise.resolve(result()); }
        return proxy;
      };
    },
  });
  return proxy;
}

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (t) => chain(t),
    auth: { getUser: async () => ({ data: { user: { email: 'lider@test.pl' } } }) },
    functions: { invoke: async () => ({ data: null, error: null }) },
  },
  getCachedUser: async () => ({ email: 'lider@test.pl' }),
}));
vi.mock('../../lib/toast', () => ({
  toast: { success: (m) => h.toasts.push(['success', m]), error: (m) => h.toasts.push(['error', m]), info: () => {} },
}));
vi.mock('../../components/Can', () => ({ useCan: () => true }));
vi.mock('../../hooks/useAppModules', () => ({ useAppModules: () => ({ modules: [{ key: 'media', path: '/media', label: 'MediaTeam' }] }) }));

import EventTasksTab from './EventTasksTab';
import { addDaysYmd, eventTasksSource, templateRows, newTaskCells } from './eventTasks';

const labels = [{ id: 'todo', title: 'Do zrobienia', color: '#c4c4c4' }, { id: 'done', title: 'Gotowe', color: '#00c875' }];
const me = { email: 'lider@test.pl', name: 'Lider' };

beforeEach(() => {
  h.writes = [];
  h.toasts = [];
  h.DB = {
    boards: [{
      id: 'b-media', name: 'Zadania Media Team', module_key: 'media', source_kind: 'media_tasks',
      settings: { event_task_templates: [{ name: 'Sprawdzić kamery', offset_days: -2 }, { name: 'Zgrać nagranie', offset_days: 1, people: [me] }] },
    }],
    board_columns: [
      { id: 'st', board_id: 'b-media', type: 'status', name: 'Status', settings: { labels }, display_order: 1 },
      { id: 'pp', board_id: 'b-media', type: 'people', name: 'Osoby', settings: {}, display_order: 2 },
      { id: 'du', board_id: 'b-media', type: 'date', name: 'Termin', settings: {}, display_order: 3 },
    ],
    board_groups: [{ id: 'g1', board_id: 'b-media', display_order: 0 }],
    // Kolejność jak z .order('display_order', desc) — mock nie sortuje.
    board_items: [
      { id: 'i2', board_id: 'b-media', name: 'Inne wydarzenie', cells: {}, event_id: 'e2', display_order: 5 },
      { id: 'i1', board_id: 'b-media', name: 'Ustawić światła', cells: { st: 'todo', pp: [me], du: '2026-11-01' }, event_id: 'e1', display_order: 4 },
    ],
    app_users: [{ email: 'lider@test.pl', full_name: 'Lider', is_active: true }],
  };
});

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname}{loc.search}</div>;
}
const renderTab = () => render(
  <MemoryRouter initialEntries={['/wydarzenie/e1']}>
    <Routes><Route path="*" element={<><EventTasksTab event={{ id: 'e1', module_key: 'media', date: '2026-11-01' }} /><Where /></>} /></Routes>
  </MemoryRouter>,
);

describe('EventTasksTab', () => {
  it('pokazuje tylko zadania tego wydarzenia; klik → zadanie w module (taskItemLink)', async () => {
    renderTab();
    await screen.findByText('Ustawić światła');
    expect(screen.queryByText('Inne wydarzenie')).toBeNull();
    expect(screen.getByText('Do zrobienia')).toBeTruthy();
    fireEvent.click(screen.getByText('Ustawić światła'));
    expect(screen.getByTestId('where').textContent).toBe('/media?item=i1');
  });

  it('„Dodaj z szablonu” tworzy wszystkie pozycje z terminem od daty wydarzenia i event_id', async () => {
    renderTab();
    await screen.findByText('Ustawić światła');
    fireEvent.click(await screen.findByText('Dodaj z szablonu'));
    await waitFor(() => expect(h.writes.some((w) => w.table === 'board_items' && w.op === 'insert')).toBe(true));
    const ins = h.writes.find((w) => w.table === 'board_items' && w.op === 'insert').payload;
    expect(ins).toHaveLength(2);
    expect(ins[0]).toMatchObject({ board_id: 'b-media', group_id: 'g1', name: 'Sprawdzić kamery', event_id: 'e1', cells: { du: '2026-10-30', st: 'todo' } });
    expect(ins[1]).toMatchObject({ name: 'Zgrać nagranie', event_id: 'e1', cells: { du: '2026-11-02', pp: [me], st: 'todo' } });
    expect(ins[0].display_order).toBe(6);
  });

  it('pomocnicze: źródło tablicy, daty, komórki', () => {
    expect(eventTasksSource('media')).toBe('media_tasks');
    expect(eventTasksSource('')).toBe('tasks');
    expect(eventTasksSource('worship')).toBe('tasks'); // moduł bez zakładki Zadania → Kalendarz
    expect(eventTasksSource('chor')).toBe('custom_chor_tasks');
    expect(addDaysYmd('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysYmd(null, 3)).toBeNull();
    expect(templateRows([{ name: ' ', offset_days: 1 }, { name: 'A', offset_days: '2' }], '2026-01-30')).toEqual([{ name: 'A', due: '2026-02-01', people: [] }]);
    expect(newTaskCells(h.DB.board_columns, { due: null })).toEqual({ st: 'todo' });
  });
});
