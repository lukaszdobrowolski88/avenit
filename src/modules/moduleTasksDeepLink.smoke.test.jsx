// Test dymny linków do zadań (?item=<id>, taskItemLink): strona modułu otwiera zakładkę „Zadania”
// (ModuleBoard otwiera samo zadanie) — Media Team, Młodzieżówka i moduł własny z kreatora.
// Wcześniej każdy moduł miał też martwy kod starych zadań (media_tasks…) — usunięty.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const h = vi.hoisted(() => ({ DB: {} }));

function chain(table) {
  const state = { filters: [] };
  const result = () => {
    let rows = h.DB[table] ?? [];
    state.filters.forEach(([c, v]) => { rows = rows.filter((r) => String(r[c]) === String(v)); });
    if (state.single) return { data: rows[0] ?? null, error: rows[0] ? null : { message: 'not found' } };
    return { data: rows, error: null };
  };
  const proxy = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') return (res, rej) => Promise.resolve(result()).then(res, rej);
      return (...args) => {
        if (prop === 'eq') state.filters.push(args);
        if (prop === 'maybeSingle' || prop === 'single') { state.single = true; return Promise.resolve(result()); }
        return proxy;
      };
    },
  });
  return proxy;
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (t) => chain(t),
    auth: { getUser: async () => ({ data: { user: { email: 'ja@test.pl' } } }) },
    functions: { invoke: async () => ({ data: null, error: null }) },
  },
  getCachedUser: async () => ({ email: 'ja@test.pl' }),
}));
vi.mock('../lib/toast', () => ({ toast: { success: () => {}, error: () => {}, info: () => {} } }));
vi.mock('../hooks/useCampusQuery', () => ({ useCampusQuery: () => ({ withCampusFilter: (q) => q, selectedCampusId: null, campusIdForInsert: null }) }));
vi.mock('../components/Can', () => ({ useTabAccess: () => () => true, useCan: () => true, default: ({ children }) => children }));
vi.mock('../components/PageHeader', () => ({ default: ({ title }) => <h1>{title}</h1> }));
vi.mock('../components/ResponsiveTabs', () => ({ default: ({ activeTab }) => <div data-testid="active-tab">{activeTab}</div> }));
// Tablica zadań: zaślepka z source_kind; hasItemDeepLink — prawdziwa reguła (adres strony).
vi.mock('./Boards/ModuleBoard', () => ({
  default: ({ sourceKind }) => <div data-testid="module-board">{sourceKind}</div>,
  hasItemDeepLink: () => new URLSearchParams(window.location.search).has('item'),
}));
vi.mock('./shared/FinanceTab', () => ({ default: () => null }));
vi.mock('./shared/EventsTab', () => ({ default: () => null }));
vi.mock('./shared/ScheduleTab', () => ({ default: () => null }));
vi.mock('./shared/MaterialsTab', () => ({ default: () => null }));
vi.mock('./shared/EquipmentTab', () => ({ default: () => null }));
vi.mock('../components/RolesTab', () => ({ default: () => null }));
vi.mock('./Boards/BoardsModule', () => ({ default: () => null }));
vi.mock('./CustomModule/components/LayoutRenderer', () => ({ default: () => null }));

import MediaTeamModule from './MediaTeamModule';
import MlodziezowkaModule from './MlodziezowkaModule';
import CustomModule from './CustomModule/CustomModule';

const at = (url) => window.history.replaceState(null, '', url);

beforeEach(() => {
  h.DB = {
    media_team: [], team_roles: [], team_member_roles: [], mlodziezowka_members: [], mlodziezowka_leaders: [],
    app_modules: [{ id: 7, key: 'chor', label: 'Chór', path: '/chor', icon: 'Music' }],
    app_module_tabs: [
      { id: 1, module_id: 7, key: 'info', label: 'Informacje', component_type: 'empty', display_order: 1 },
      { id: 2, module_id: 7, key: 'zad', label: 'Zadania', component_type: 'tasks', display_order: 2 },
    ],
  };
});
afterEach(() => at('/'));

describe('?item= otwiera zakładkę „Zadania” modułu', () => {
  it('Media Team', async () => {
    at('/media?item=i-1');
    render(<MemoryRouter initialEntries={['/media?item=i-1']}><MediaTeamModule /></MemoryRouter>);
    expect((await screen.findByTestId('module-board')).textContent).toBe('media_tasks');
    expect(screen.getByTestId('active-tab').textContent).toBe('tasks');
  });

  it('Media Team bez ?item= — domyślna zakładka (Grafik)', async () => {
    at('/media');
    render(<MemoryRouter initialEntries={['/media']}><MediaTeamModule /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('active-tab').textContent).toBe('schedule'));
    expect(screen.queryByTestId('module-board')).toBeNull();
  });

  it('Młodzieżówka', async () => {
    at('/mlodziezowka?item=i-2');
    render(<MemoryRouter initialEntries={['/mlodziezowka?item=i-2']}><MlodziezowkaModule /></MemoryRouter>);
    expect((await screen.findByTestId('module-board')).textContent).toBe('mlodziezowka_tasks');
    expect(screen.getByTestId('active-tab').textContent).toBe('tasks');
  });

  it('moduł własny (kreator) — zakładka typu „tasks”', async () => {
    at('/module/chor?item=i-3');
    render(
      <MemoryRouter initialEntries={['/module/chor?item=i-3']}>
        <Routes><Route path="/module/:moduleKey" element={<CustomModule />} /></Routes>
      </MemoryRouter>,
    );
    expect((await screen.findByTestId('module-board')).textContent).toBe('custom_chor_tasks');
    expect(screen.getByTestId('active-tab').textContent).toBe('zad');
  });
});
