// Test dymny kalendarza (UXA-02 / FUNC-09): klik w wydarzenie prowadzi na stronę wydarzenia,
// a wybór „Nabożeństwo” otwiera formularz — niczego nie zapisuje, zanim klikniesz „Utwórz”.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const h = vi.hoisted(() => ({ DB: {}, writes: [] }));

function chain(table) {
  const state = { table, op: 'select' };
  const proxy = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') {
        if (state.op !== 'select') h.writes.push({ table, op: state.op, payload: state.payload });
        const data = state.op === 'select' ? (h.DB[state.table] ?? []) : [];
        return (res, rej) => Promise.resolve({ data, error: null }).then(res, rej);
      }
      return (...args) => {
        if (['insert', 'update', 'upsert', 'delete'].includes(prop)) { state.op = prop; state.payload = args[0]; }
        if (prop === 'maybeSingle' || prop === 'single') return Promise.resolve({ data: null, error: null });
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
    functions: { invoke: async () => ({ data: null, error: null }) },
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
  h.DB = {
    events: [
      { id: 5, title: 'Nabożeństwo niedzielne', date: today, time: '10:00:00', program_id: 5 },
      { id: 6, title: 'Próba', date: today, time: '18:00', module_key: 'worship' },
    ],
    programs: [{ id: 5, title: 'Plan', date: today }],
    tasks: [],
  };
});

const renderCal = () => render(
  <MemoryRouter initialEntries={['/wydarzenia']}>
    <Routes>
      <Route path="/wydarzenia" element={<CalendarModule embedded />} />
      <Route path="/wydarzenie/:id" element={<div>STRONA WYDARZENIA</div>} />
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
});
