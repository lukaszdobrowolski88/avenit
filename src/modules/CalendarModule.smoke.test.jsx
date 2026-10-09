// Test dymny kalendarza (UXA-02 / FUNC-09): klik w wydarzenie prowadzi na stronę wydarzenia,
// a wybór „Nabożeństwo” otwiera formularz — niczego nie zapisuje, zanim klikniesz „Utwórz”.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const h = vi.hoisted(() => ({ DB: {}, writes: [], FN: {}, calls: [] }));

function chain(table) {
  const state = { table, op: 'select' };
  const proxy = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') {
        if (state.op !== 'select') h.writes.push({ table, op: state.op, payload: state.payload });
        const data = state.op === 'select'
          ? (h.DB[state.table] ?? []).filter((r) => (state.filters || []).every(([c, v]) => String(r[c]) === String(v)))
          : [];
        return (res, rej) => Promise.resolve({ data, error: null }).then(res, rej);
      }
      return (...args) => {
        if (['insert', 'update', 'upsert', 'delete'].includes(prop)) { state.op = prop; state.payload = args[0]; }
        if (prop === 'eq') { state.filters = [...(state.filters || []), args]; }
        if (prop === 'maybeSingle' || prop === 'single') {
          const rows = (h.DB[state.table] ?? []).filter((r) => (state.filters || []).every(([c, v]) => String(r[c]) === String(v)));
          return Promise.resolve({ data: state.op === 'select' ? rows[0] ?? null : null, error: null });
        }
        return proxy;
      };
    },
  });
  return proxy;
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (t) => chain(t),
    auth: { getUser: async () => ({ data: { user: { email: 'a@test.pl' } } }) },
    functions: { invoke: async (name, opts) => { h.calls.push({ name, body: opts?.body }); return { data: h.FN[name] ?? null, error: null }; } },
  },
  getCachedUser: async () => ({ email: 'a@test.pl' }),
}));
vi.mock('../hooks/useCampusQuery', () => ({
  useCampusQuery: () => ({ withCampusFilter: (q) => q, selectedCampusId: null, campusIdForInsert: null }),
}));
vi.mock('../hooks/useModules', () => ({
  useModules: () => ({ modules: [{ id: 1, key: 'worship', label: 'Grupa Uwielbienia', is_enabled: true }], tabs: {} }),
}));
vi.mock('../hooks/useModuleLabel', () => ({
  useModuleCalendars: () => ({}),
  useModuleLabel: (_k, fb) => fb,
}));
vi.mock('../components/PageHeader', () => ({ default: ({ title, actions }) => <div><h1>{title}</h1>{actions}</div> }));

import CalendarModule from './CalendarModule';

const pad = (n) => String(n).padStart(2, '0');
const d = new Date();
const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

beforeEach(() => {
  h.writes.length = 0;
  h.calls.length = 0;
  h.DB = {
    events: [
      { id: 5, title: 'Nabożeństwo niedzielne', date: today, time: '10:00:00', program_id: 5 },
      { id: 6, title: 'Próba', date: today, time: '18:00', module_key: 'worship' },
    ],
    programs: [{ id: 5, title: 'Plan', date: today }],
    // Zadania kalendarza = elementy tablicy „Zadania” (source_kind 'tasks').
    boards: [{ id: 'b-cal', source_kind: 'tasks', module_key: 'calendar', legacy_backfill_at: today }],
    board_columns: [
      { id: 'c-due', board_id: 'b-cal', type: 'date', name: 'Termin', settings: { role: 'due' } },
      { id: 'c-od', board_id: 'b-cal', type: 'text', name: 'Od', settings: { role: 'start_time' } },
      { id: 'c-st', board_id: 'b-cal', type: 'status', name: 'Status', settings: { labels: [{ id: 'todo', title: 'Do zrobienia' }] } },
    ],
    board_items: [{ id: 'i-1', board_id: 'b-cal', name: 'Kupić baterie', cells: { 'c-due': today, 'c-od': '09:30', 'c-st': 'todo' } }],
    board_groups: [{ id: 'g-1', board_id: 'b-cal' }],
  };
  h.FN = {
    'my-board-items': { items: [{ id: 'i-9', board_id: 'b-proj', board_name: 'Remont', module_key: null, name: 'Zamówić farbę', date: today, link: '/projekty?board=b-proj&item=i-9' }] },
  };
});

const renderCal = (url = '/wydarzenia') => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/wydarzenia" element={<CalendarModule embedded />} />
      <Route path="/wydarzenie/:id" element={<div>STRONA WYDARZENIA</div>} />
      <Route path="/projekty" element={<div>PROJEKTY</div>} />
      <Route path="/media" element={<div>MEDIA</div>} />
    </Routes>
  </MemoryRouter>
);

describe('CalendarModule (dymny)', () => {
  it('program podpięty do wydarzenia nie dubluje nabożeństwa; klik → strona wydarzenia', async () => {
    renderCal();
    const items = await screen.findAllByTitle(/Nabożeństwo niedzielne/);
    expect(screen.queryAllByTitle(/^Plan/)).toHaveLength(0);
    fireEvent.click(items[0]);
    await waitFor(() => expect(screen.getByText('STRONA WYDARZENIA')).toBeTruthy());
  });

  it('wydarzenie służby ma nazwę modułu z Ustawień', async () => {
    renderCal();
    await screen.findAllByTitle(/Próba/);
    expect(screen.getAllByText('Grupa Uwielbienia').length).toBeGreaterThan(0);
  });

  it('„Nabożeństwo” otwiera formularz „Nowe wydarzenie” i niczego nie zapisuje', async () => {
    renderCal();
    fireEvent.click((await screen.findAllByText('Dodaj')).find((b) => b.closest('[data-tour="cal-add"]')) || screen.getAllByText('Dodaj')[0]);
    fireEvent.click(await screen.findByText('Wydarzenie'));
    fireEvent.click(await screen.findByText('Nabożeństwo'));
    await screen.findByText('Utwórz i otwórz');
    expect(h.writes).toHaveLength(0);
    expect(screen.getByDisplayValue('Nabożeństwo')).toBeTruthy();
  });

  it('zadanie z tablicy „Zadania” otwiera okno zadania; zapis aktualizuje element tablicy', async () => {
    renderCal();
    const chips = await screen.findAllByTitle(/Kupić baterie/);
    fireEvent.click(chips[0]);
    expect(await screen.findByDisplayValue('Kupić baterie')).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue('Kupić baterie'), { target: { value: 'Kupić baterie AA' } });
    fireEvent.click(screen.getByText('Zapisz'));
    await waitFor(() => expect(h.calls.some((c) => c.name === 'board-item-patch')).toBe(true));
    const patch = h.calls.find((c) => c.name === 'board-item-patch').body;
    expect(patch.item_id).toBe('i-1');
    expect(patch.name).toBe('Kupić baterie AA');
    // Nic w komórkach kalendarza się nie zmieniło — łatka nie nadpisuje komórek tablicy.
    expect(patch.cells).toEqual({});
    expect(h.writes.some((w) => w.table === 'board_items' && w.op === 'update')).toBe(false);
    expect(h.writes.some((w) => w.table === 'tasks')).toBe(false);
  });

  it('przypisane mi zadanie z innej tablicy — klik prowadzi do elementu', async () => {
    renderCal();
    const chips = await screen.findAllByTitle(/Zamówić farbę/);
    fireEvent.click(chips[0]);
    await waitFor(() => expect(screen.getByText('PROJEKTY')).toBeTruthy());
  });

  it('?item=<id> zadania Kalendarza otwiera jego okno i czyści parametr', async () => {
    renderCal('/wydarzenia?item=i-1');
    expect(await screen.findByDisplayValue('Kupić baterie')).toBeTruthy();
  });

  it('?item=<id> zadania z tablicy służby prowadzi do modułu (taskItemLink)', async () => {
    h.DB.board_items.push({ id: 'm-7', board_id: 'b-media', name: 'Kable', cells: {} });
    h.DB.boards.push({ id: 'b-media', source_kind: 'media_tasks', module_key: 'media' });
    renderCal('/wydarzenia?item=m-7');
    await waitFor(() => expect(screen.getByText('MEDIA')).toBeTruthy());
  });
});
