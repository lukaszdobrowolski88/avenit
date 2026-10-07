// Test dymny Nauczania (UXE-06 / UXB-10 / UXB-06): grafik kazań czyta WYDARZENIA (ta sama
// niedziela co w grafikach zespołów), zapis idzie atomowo na events.assignments.teaching,
// a seria liczy kazania także z biblioteki „Kazania”.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  DB: {},
  patches: [],
  patchError: null,
  reads: [],
}));

function chain(table) {
  const state = { table, op: 'select' };
  const proxy = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') {
        if (state.op === 'select') h.reads.push(table);
        const data = state.op === 'select' ? (h.DB[state.table] ?? []) : [];
        return (res, rej) => Promise.resolve({ data, error: null }).then(res, rej);
      }
      return (...args) => {
        if (['insert', 'update', 'upsert', 'delete'].includes(prop)) { state.op = prop; state.payload = args[0]; }
        if (prop === 'maybeSingle' || prop === 'single') {
          return Promise.resolve({ data: Array.isArray(h.DB[state.table]) ? null : (h.DB[state.table] ?? null), error: null });
        }
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
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
  },
  getCachedUser: async () => ({ email: 'lider@test.pl' }),
}));
vi.mock('../../hooks/useScheduleAssignments', () => ({
  patchEventAssignments: async (eventId, ops) => {
    h.patches.push({ eventId, ops });
    if (h.patchError) return { assignments: null, event: null, error: h.patchError };
    const teaching = {};
    ops.forEach((o) => { if (o.value != null) teaching[o.key] = o.value; });
    return { assignments: { teaching }, event: null, error: null };
  },
  scheduleSaveErrorMessage: () => 'Nie masz uprawnień do edycji grafiku tego wydarzenia.',
}));
vi.mock('../../hooks/useCampusQuery', () => ({
  useCampusQuery: () => ({ withCampusFilter: (q) => q, selectedCampusId: null, campusIdForInsert: null }),
}));
vi.mock('../../components/Can', () => ({ useTabAccess: () => () => true, default: ({ children }) => children }));
vi.mock('../../components/PageHeader', () => ({ default: ({ title }) => <h1>{title}</h1> }));
vi.mock('../../components/ResponsiveTabs', () => ({
  default: ({ tabs, onChange }) => <div>{tabs.map((t) => <button key={t.id} onClick={() => onChange(t.id)}>{t.label}</button>)}</div>,
}));
vi.mock('../../components/CampusBadge', () => ({ CampusBadge: () => null, useCampusBadge: () => ({ getCampus: () => null }) }));
vi.mock('../shared/WallTab', () => ({ default: () => null }));
vi.mock('../shared/MaterialsTab', () => ({ default: () => null }));
vi.mock('../Sermons/SermonsModule', () => ({ default: ({ createPreset }) => <div data-testid="sermons">{createPreset?.series || ''}</div> }));

import TeachingModule from './TeachingModule';

const now = new Date();
const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

beforeEach(() => {
  h.patches.length = 0;
  h.reads.length = 0;
  h.patchError = null;
  h.DB = {
    teaching_speakers: [{ id: 's1', name: 'Jan Kowalski' }],
    teaching_series: [{ id: 9, name: 'Fundamenty', is_active: true }],
    events: [
      { id: 101, title: 'Nabożeństwo niedzielne', date: `${ym}-11`, time: '10:00', assignments: { worship: { lider: 'Ania' } } },
      { id: 102, title: 'Spotkanie liderów', date: `${ym}-12`, event_type: 'spotkanie' },
    ],
    programs: [{ id: 7, date: `${ym}-04`, title: 'Stary', teaching: { title: 'Bez wydarzenia' } }],
    sermons: [{ id: 'a', title: 'Z biblioteki', series: 'Fundamenty', sermon_date: `${ym}-18` }],
    app_settings: null,
    app_users: null,
  };
});

const renderModule = () => render(<MemoryRouter><TeachingModule /></MemoryRouter>);

describe('TeachingModule — grafik nad wydarzeniami', () => {
  it('wiersze grafiku to nabożeństwa z tabeli events (nie programy)', async () => {
    renderModule();
    fireEvent.click(await screen.findByText('Grafik'));
    await waitFor(() => expect(screen.getByText('Nabożeństwo niedzielne')).toBeTruthy());
    expect(screen.queryByText('Spotkanie liderów')).toBeNull();
    expect(h.reads).toContain('events');
  });

  it('zapis tytułu kazania idzie atomowo na events.assignments.teaching', async () => {
    renderModule();
    fireEvent.click(await screen.findByText('Grafik'));
    const input = await screen.findByLabelText(/Tytuł kazania/);
    fireEvent.change(input, { target: { value: 'Łaska' } });
    fireEvent.blur(input);
    await waitFor(() => expect(h.patches).toHaveLength(1));
    expect(h.patches[0]).toEqual({ eventId: 101, ops: [{ team: 'teaching', key: 'title', value: 'Łaska' }] });
  });

  it('błąd zapisu (403) nie kasuje wpisanego tekstu', async () => {
    h.patchError = { status: 403 };
    renderModule();
    fireEvent.click(await screen.findByText('Grafik'));
    const input = await screen.findByLabelText(/Tytuł kazania/);
    fireEvent.change(input, { target: { value: 'Nie zapisze się' } });
    fireEvent.blur(input);
    await waitFor(() => expect(h.patches).toHaveLength(1));
    expect(screen.getByLabelText(/Tytuł kazania/).value).toBe('Nie zapisze się');
  });

  it('seria liczy kazania z biblioteki i ma „Dodaj kazanie do serii”', async () => {
    renderModule();
    fireEvent.click(await screen.findByText('Serie'));
    await waitFor(() => expect(screen.getByText('1 kazanie')).toBeTruthy());
    fireEvent.click(screen.getByText('Fundamenty'));
    fireEvent.click(await screen.findByText('Dodaj kazanie do serii'));
    await waitFor(() => expect(screen.getByTestId('sermons').textContent).toBe('Fundamenty'));
  });
});
