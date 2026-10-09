// Opieka: zadanie „na potem” z wpisu kontaktu (osobiste, prywatne, z linkiem do profilu) oraz
// zakładka „Zadania” osoby (zadania z tablic + zlecone jej zadania osobiste).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ DB: {}, ors: [] }));

function chain(table) {
  const state = { filters: [] };
  const result = () => {
    let rows = h.DB[table] ?? [];
    for (const [kind, c, v] of state.filters) {
      rows = rows.filter((r) => (kind === 'in' ? v.map(String).includes(String(r[c])) : String(r[c]) === String(v)));
    }
    return { data: rows, error: null };
  };
  const proxy = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') return (res, rej) => Promise.resolve(result()).then(res, rej);
      return (...args) => {
        if (prop === 'eq' || prop === 'in') state.filters.push([prop, ...args]);
        if (prop === 'or') h.ors.push([table, args[0]]);
        return proxy;
      };
    },
  });
  return proxy;
}

vi.mock('../../lib/supabase', () => ({
  supabase: { from: (t) => chain(t), functions: { invoke: async () => ({ data: null, error: null }) } },
  getCachedUser: async () => ({ email: 'pastor@test.pl' }),
}));
vi.mock('../../lib/toast', () => ({ toast: { success: () => {}, error: () => {}, info: () => {} } }));
vi.mock('../../hooks/useAppModules', () => ({ useAppModules: () => ({ modules: [] }) }));

import { followUpTask, memberProfileUrl } from './tabs/CareLogTab';
import PersonTasksTab from './tabs/PersonTasksTab';

const anna = { email: 'anna@test.pl', name: 'Anna' };

beforeEach(() => {
  h.ors = [];
  h.DB = {
    boards: [{ id: 'b1', name: 'Remont', module_key: null, source_kind: null, is_template: false, is_archived: false }],
    board_columns: [{ id: 'p', board_id: 'b1', type: 'people', display_order: 1 }],
    board_items: [
      { id: 'x1', board_id: 'b1', name: 'Pomalować salę', cells: { p: [anna] } },
      { id: 'x2', board_id: 'b1', name: 'Cudze', cells: { p: [{ email: 'jan@test.pl' }] } },
    ],
    app_users: [{ email: 'anna.konto@test.pl', member_id: 12 }],
    user_tasks: [{ id: 'u1', title: 'Oddzwonić do Anny', status: 'todo', due_date: '2099-01-01', assigned_to_email: 'anna@test.pl', user_email: 'pastor@test.pl' }],
  };
});

describe('Opieka — zadania', () => {
  it('zadanie po kontakcie: osobiste, prywatne, z linkiem do profilu', () => {
    const t = followUpTask({
      member: { id: 12, first_name: 'Anna' }, entry: { care_type: 'telefon', care_date: '2026-10-09', note: 'Prosi o modlitwę' },
      title: ' Odezwij się: Anna ', due: '2026-10-16', userEmail: 'pastor@test.pl',
    });
    expect(t).toMatchObject({ title: 'Odezwij się: Anna', due_date: '2026-10-16', status: 'todo', is_private: true, user_email: 'pastor@test.pl' });
    expect(t.description).toContain('Prosi o modlitwę');
    expect(t.description).toContain(memberProfileUrl(12));
    expect(memberProfileUrl(12)).toBe(`${window.location.origin}/members?member=12`);
  });

  it('zakładka „Zadania”: zadania z tablic osoby i zlecone jej zadania osobiste (wszystkie konta osoby)', async () => {
    render(<MemoryRouter><PersonTasksTab member={{ id: 12, email: 'anna@test.pl' }} /></MemoryRouter>);
    await screen.findByText('Pomalować salę');
    expect(await screen.findByText('Oddzwonić do Anny')).toBeTruthy();
    expect(screen.queryByText('Cudze')).toBeNull();
    const last = h.ors.filter(([t]) => t === 'user_tasks').pop();
    expect(last[1]).toContain('assigned_to_email.ilike.anna@test.pl');
    expect(last[1]).toContain('assigned_to_email.ilike.anna.konto@test.pl');
  });
});
