// Test dymny Członków (UXA-07/09/10, UXE-03): lista kart na telefonie, grupy z obu źródeł,
// walidacja przy polu, osoba bez e-maila w kilku grupach, ?member=<id> otwiera profil.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ DB: {}, writes: [], toasts: [] }));

function chain(table) {
  const state = { table, op: 'select', filters: [] };
  const result = () => {
    if (state.op !== 'select') {
      h.writes.push({ table, op: state.op, payload: state.payload, filters: state.filters });
      if (state.op === 'insert' && state.single) return { data: { id: 'new-1' }, error: null };
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

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (t) => chain(t),
    auth: { getUser: async () => ({ data: { user: { email: 'admin@test.pl' } } }) },
    functions: { invoke: async () => ({ data: null, error: null }) },
    storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
  },
  getCachedUser: async () => ({ email: 'admin@test.pl' }),
}));
vi.mock('../lib/toast', () => ({
  toast: {
    success: (m) => h.toasts.push(['success', m]),
    error: (m) => h.toasts.push(['error', typeof m === 'string' ? m : (m?.message || 'err')]),
    info: (m) => h.toasts.push(['info', m]),
  },
}));
vi.mock('../hooks/useCampusQuery', () => ({ useCampusQuery: () => ({ withCampusFilter: (q) => q, selectedCampusId: null, campusIdForInsert: null }) }));
vi.mock('../contexts/CampusContext', () => ({ useCampus: () => ({ campuses: [] }) }));
vi.mock('../hooks/useModuleLabel', () => ({ useModuleLabel: (_k, fb) => fb }));
vi.mock('../hooks/useModules', () => ({ useModules: () => ({ modules: [] }) }));
vi.mock('../components/Can', () => ({ useCan: () => false, useTabAccess: () => () => true, default: ({ children }) => children }));
vi.mock('../components/PageHeader', () => ({ default: ({ title }) => <h1>{title}</h1> }));
vi.mock('../components/ResponsiveTabs', () => ({ default: () => null }));
vi.mock('./Care/CareModule', () => ({ default: () => null }));
vi.mock('./AttendanceTab', () => ({ default: () => null }));
vi.mock('./shared/MaterialsTab', () => ({ default: () => null }));
vi.mock('./Kids/components/HouseholdManager', () => ({ default: () => null }));
vi.mock('../components/CustomDatePicker', () => ({ default: ({ label }) => <div>{label}</div> }));
vi.mock('../lib/dialog', () => ({ confirmDialog: async () => true }));

import Members from './Members';

beforeEach(() => {
  h.writes.length = 0;
  h.toasts.length = 0;
  h.DB = {
    members: [
      { id: 'm1', first_name: 'Ola', last_name: 'Nowak', email: 'ola@x.pl', phone: '600 100 200', status: 'Członek', home_group_id: null, ministries: [], tags: [] },
      { id: 'm2', first_name: 'Zosia', last_name: 'Mała', email: null, phone: null, status: 'Gość', home_group_id: null, ministries: [], tags: [] },
    ],
    home_groups: [{ id: 'g1', name: 'Grupa Zachód' }, { id: 'g2', name: 'Leśnica' }],
    households: [],
    // Ola dopisana w module Grupy domowe (tylko home_group_members) — lista członków ma ją pokazać.
    home_group_members: [{ id: 'r1', group_id: 'g2', email: 'OLA@x.pl', full_name: 'Ola Nowak', role: 'leader' }],
    attendance: [],
    app_settings: null,
    app_roles: [],
  };
});

const renderAt = (url = '/members') => render(<MemoryRouter initialEntries={[url]}><Members /></MemoryRouter>);

describe('Członkowie', () => {
  it('grupa z home_group_members widoczna na liście (z rolą lidera) i telefon jako link', async () => {
    renderAt();
    const cards = await screen.findByRole('list', { name: 'Lista osób' });
    expect(within(cards).getByText(/Leśnica · lider/)).toBeTruthy();
    expect(within(cards).getByText('600 100 200').closest('a').getAttribute('href')).toBe('tel:600100200');
  });

  it('pusty formularz: błędy przy polach, bez zapisu', async () => {
    renderAt();
    fireEvent.click((await screen.findAllByText('Dodaj osobę'))[0]);
    fireEvent.click(screen.getByText('Zapisz'));
    expect(await screen.findByText('Podaj imię.')).toBeTruthy();
    expect(screen.getByText('Podaj nazwisko.')).toBeTruthy();
    expect(h.writes.filter((w) => w.table === 'members')).toHaveLength(0);
  });

  it('osoba bez e-maila zapisuje się do kilku grup + komunikat sukcesu', async () => {
    renderAt();
    fireEvent.click((await screen.findAllByText('Dodaj osobę'))[0]);
    fireEvent.change(screen.getByLabelText('Imię *'), { target: { value: 'Jan' } });
    fireEvent.change(screen.getByLabelText('Nazwisko *'), { target: { value: 'Kowalski' } });
    const groups = screen.getByRole('group', { name: 'Grupy domowe' });
    fireEvent.click(within(groups).getByText('Grupa Zachód'));
    fireEvent.click(within(groups).getByText('Leśnica'));
    fireEvent.click(screen.getByText('Zapisz'));
    await waitFor(() => expect(h.toasts).toContainEqual(['success', 'Dodano: Jan Kowalski']));
    const inserts = h.writes.filter((w) => w.table === 'home_group_members' && w.op === 'insert');
    expect(inserts.map((w) => w.payload[0].group_id)).toEqual(['g1', 'g2']);
    expect(inserts[0].payload[0]).toMatchObject({ full_name: 'Jan Kowalski', email: null });
  });

  it('?member=<id> otwiera profil osoby', async () => {
    renderAt('/members?member=m1');
    const dialog = await screen.findByRole('dialog', { name: 'Ola Nowak' });
    expect(within(dialog).getByText(/Leśnica \(lider\)/)).toBeTruthy();
  });
});
