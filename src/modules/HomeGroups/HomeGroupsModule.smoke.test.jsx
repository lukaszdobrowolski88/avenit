// Test dymny Grup domowych (UXB-08/UXB-20, UXE-03): grupa z liderem w jednym kroku (lider
// zostaje członkiem z rolą „leader”), dzień spotkania z listy, ?group=<id> otwiera grupę.
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ DB: {}, writes: [], toasts: [], seq: 0 }));

function chain(table) {
  const state = { table, op: 'select', filters: [] };
  const result = () => {
    if (state.op !== 'select') {
      h.writes.push({ table, op: state.op, payload: state.payload, filters: state.filters });
      if (state.op === 'insert' && state.single) return { data: { id: `${table}-${++h.seq}` }, error: null };
      return { data: null, error: null };
    }
    let rows = h.DB[table] ?? [];
    if (Array.isArray(rows)) state.filters.forEach(([c, v]) => { rows = rows.filter((r) => String(r[c]) === String(v)); });
    if (state.single) return { data: Array.isArray(rows) ? (rows[0] ?? null) : rows, error: null };
    return { data: rows, error: null };
  };
  const proxy = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') return (res, rej) => Promise.resolve(result()).then(res, rej);
      return (...args) => {
        if (['insert', 'update', 'upsert', 'delete'].includes(prop)) { state.op = prop; state.payload = args[0]; }
        if (prop === 'eq') state.filters.push(args);
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
    auth: { getUser: async () => ({ data: { user: { email: 'koord@test.pl' } } }) },
    functions: { invoke: async () => ({ data: null, error: null }) },
    storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
  },
  getCachedUser: async () => ({ email: 'koord@test.pl' }),
}));
vi.mock('../../lib/toast', () => ({
  toast: {
    success: (m) => h.toasts.push(['success', m]),
    error: (m) => h.toasts.push(['error', typeof m === 'string' ? m : (m?.message || 'err')]),
    info: (m) => h.toasts.push(['info', m]),
  },
}));
vi.mock('../../lib/dialog', () => ({ confirmDialog: async () => true }));
vi.mock('../../hooks/useCampusQuery', () => ({ useCampusQuery: () => ({ withCampusFilter: (q) => q, selectedCampusId: null, campusIdForInsert: null }) }));
vi.mock('../../hooks/useUserRole', () => ({ useUserRole: () => ({ userRole: 'superadmin', loading: false }) }));
vi.mock('../../components/Can', () => ({ useTabAccess: () => () => true, useCan: () => true, default: ({ children }) => children }));
vi.mock('../../components/PageHeader', () => ({ default: ({ title }) => <h1>{title}</h1> }));
vi.mock('../../components/ResponsiveTabs', () => ({ default: () => null }));
vi.mock('../Boards/ModuleBoard', () => ({ default: () => null, hasItemDeepLink: () => false }));
vi.mock('../shared/FinanceTab', () => ({ default: () => null }));
vi.mock('../shared/EventsTab', () => ({ default: () => null }));
vi.mock('../shared/MaterialsTab', () => ({ default: () => null }));
vi.mock('../shared/EquipmentTab', () => ({ default: () => null }));
vi.mock('./HomeGroupsMap', () => ({ default: () => null }));
vi.mock('../../components/pickers', () => ({ DateInput: (p) => <input {...p} />, TimeField: (p) => <input {...p} /> }));

import HomeGroupsModule from './HomeGroupsModule';

// jsdom nie ma layoutu — lista CustomSelect renderuje się dopiero, gdy pole ma szerokość.
const origRect = Element.prototype.getBoundingClientRect;
beforeAll(() => {
  Element.prototype.getBoundingClientRect = function () {
    return { top: 10, bottom: 40, left: 10, right: 210, width: 200, height: 30, x: 10, y: 10, toJSON() {} };
  };
});
afterAll(() => { Element.prototype.getBoundingClientRect = origRect; });

beforeEach(() => {
  h.writes.length = 0;
  h.toasts.length = 0;
  h.DB = {
    home_groups: [{ id: 'g1', name: 'Grupa Zachód', meeting_day: 'piątek', leader_id: 'L1' }],
    home_group_leaders: [{ id: 'L1', full_name: 'Grzegorz Suchy', email: 'g@x.pl', role: 'leader', group_id: null }],
    home_group_members: [],
    members: [{ id: 'm1', first_name: 'Anna', last_name: 'Lis', email: 'anna@x.pl', phone: '500' }],
    materials_files: [],
  };
});

const renderAt = (url = '/home-groups') => render(<MemoryRouter initialEntries={[url]}><HomeGroupsModule /></MemoryRouter>);

const pick = async (label, optionText) => {
  fireEvent.click(screen.getByRole('combobox', { name: new RegExp(label) }));
  fireEvent.click(await screen.findByRole('option', { name: new RegExp(optionText) }));
};

describe('Grupy domowe', () => {
  it('karta: lider bez członkostwa jest sygnalizowany, dzień spotkania po polsku z dużej', async () => {
    renderAt();
    expect(await screen.findByText('Grzegorz Suchy')).toBeTruthy();
    expect(screen.getByText(/Lider nie jest członkiem grupy/)).toBeTruthy();
    expect(screen.getByText(/Piątek/)).toBeTruthy(); // wolny tekst „piątek” pokazany jako dzień tygodnia
  });

  it('nowa grupa z liderem z bazy osób: lider = członek z rolą „leader” + katalog liderów', async () => {
    renderAt();
    fireEvent.click(await screen.findByText('Dodaj grupę'));
    fireEvent.change(screen.getByLabelText('Nazwa grupy *'), { target: { value: 'Grupa Wschód' } });
    await pick('Lider grupy', 'Anna Lis');
    await pick('Dzień spotkania', 'Środa');
    fireEvent.click(screen.getByText('Zapisz'));
    await waitFor(() => expect(h.toasts).toContainEqual(['success', 'Dodano grupę „Grupa Wschód”']));
    const grp = h.writes.find((w) => w.table === 'home_groups' && w.op === 'insert');
    expect(grp.payload[0]).toMatchObject({ name: 'Grupa Wschód', meeting_day: 'Środa' });
    const member = h.writes.find((w) => w.table === 'home_group_members' && w.op === 'insert');
    expect(member.payload[0]).toMatchObject({ full_name: 'Anna Lis', email: 'anna@x.pl', role: 'leader', is_leader: true });
    expect(h.writes.find((w) => w.table === 'home_group_leaders' && w.op === 'insert')).toBeTruthy();
    expect(h.writes.find((w) => w.table === 'home_groups' && w.op === 'update' && w.payload.leader_id)).toBeTruthy();
  });

  it('duplikat nazwy: ostrzeżenie przy polu', async () => {
    renderAt();
    fireEvent.click(await screen.findByText('Dodaj grupę'));
    fireEvent.change(screen.getByLabelText('Nazwa grupy *'), { target: { value: 'grupa zachód' } });
    expect(screen.getByText(/Grupa o tej nazwie już istnieje/)).toBeTruthy();
  });

  it('?group=<id> otwiera członków grupy', async () => {
    renderAt('/home-groups?group=g1');
    const dialog = await screen.findByRole('dialog', { name: 'Członkowie: Grupa Zachód' });
    expect(within(dialog).getByText('Brak członków w tej grupie')).toBeTruthy();
  });
});
