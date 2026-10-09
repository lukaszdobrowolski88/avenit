// Test dymny listy Projektów i „Mojej pracy”: archiwum jako filtr, menu ⋯ (udostępnianie tylko dla
// właściciela), „Moja praca” z board_items.assignee_emails i linkiem przez taskItemLink.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ DB: {}, queries: [] }));

function chain(table) {
  const state = { op: 'select', filters: [] };
  const result = () => {
    h.queries.push({ table, ...state });
    if (state.op !== 'select') return { data: null, error: null };
    let rows = h.DB[table] ?? [];
    for (const [kind, c, v] of state.filters) {
      if (kind === 'eq') rows = rows.filter((r) => String(r[c] ?? false) === String(v));
      if (kind === 'in') rows = rows.filter((r) => v.map(String).includes(String(r[c])));
      if (kind === 'is') rows = rows.filter((r) => (r[c] ?? null) === v);
      if (kind === 'contains') rows = rows.filter((r) => v.every((x) => (r[c] || []).includes(x)));
    }
    return state.single ? { data: rows[0] ?? null, error: null } : { data: rows, error: null };
  };
  const proxy = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') return (res, rej) => Promise.resolve(result()).then(res, rej);
      return (...args) => {
        if (['insert', 'update', 'upsert', 'delete'].includes(prop)) { state.op = prop; state.payload = args[0]; }
        if (['eq', 'in', 'is', 'contains'].includes(prop)) state.filters.push([prop, ...args]);
        if (prop === 'maybeSingle' || prop === 'single') { state.single = true; return Promise.resolve(result()); }
        return proxy;
      };
    },
  });
  return proxy;
}

vi.mock('../../lib/supabase', () => ({ supabase: { from: (t) => chain(t), functions: { invoke: async () => ({ data: { items: [] }, error: null }) } } }));
vi.mock('../../lib/toast', () => ({ toast: { success: () => {}, error: () => {}, info: () => {} } }));
vi.mock('../../components/Can', () => ({ useCan: () => true }));
vi.mock('../../contexts/PermissionsContext', () => ({ usePermissions: () => ({ subject: { isAdmin: false } }) }));
vi.mock('../../hooks/useAppModules', () => ({
  useAppModules: () => ({ modules: [{ key: 'media', path: '/media' }] }),
  getAppModulesSnapshot: () => ({ modules: [] }),
}));

import BoardsList from './BoardsList';
import MyWork from './MyWork';

beforeEach(() => {
  h.queries = [];
  h.DB = {
    boards: [
      { id: 'b1', name: 'Remont sali', module_key: null, is_template: false, is_archived: false, owner_email: 'Ja@x.pl', visibility: 'workspace' },
      { id: 'b2', name: 'Cudza tablica', module_key: null, is_template: false, is_archived: false, owner_email: 'inny@x.pl', visibility: 'workspace' },
      { id: 'b3', name: 'Stary projekt', module_key: null, is_template: false, is_archived: true, owner_email: 'ja@x.pl' },
      { id: 'tpl', name: 'Mój szablon', module_key: null, is_template: true, is_archived: false, owner_email: 'ja@x.pl' },
      { id: 'm1', name: 'Media Team', module_key: 'media', source_kind: 'media_tasks', is_template: false, is_archived: false },
    ],
    board_items: [
      { id: 'i1', board_id: 'b1', name: 'Kupić farbę', parent_item_id: null, assignee_emails: ['ja@x.pl'], cells: { pp: [{ email: 'ja@x.pl' }] } },
      { id: 'i2', board_id: 'm1', name: 'Nagrać kazanie', parent_item_id: null, assignee_emails: ['ja@x.pl'], cells: { mp: [{ email: 'JA@x.pl' }] } },
      { id: 'i3', board_id: 'b3', name: 'W archiwum', parent_item_id: null, assignee_emails: ['ja@x.pl'], cells: { ap: [{ email: 'ja@x.pl' }] } },
    ],
    board_columns: [
      { id: 'pp', board_id: 'b1', type: 'people' },
      { id: 'mp', board_id: 'm1', type: 'people' },
      { id: 'ap', board_id: 'b3', type: 'people' },
    ],
  };
});

describe('BoardsList', () => {
  it('aktywne tablice jako przyciski, archiwum jako filtr (bez szablonów)', async () => {
    render(<MemoryRouter><BoardsList userEmail="ja@x.pl" onOpenBoard={() => {}} /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: /^Remont sali/ })).toBeTruthy();
    expect(screen.queryByText('Stary projekt')).toBeNull();
    expect(screen.queryByText('Mój szablon')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Archiwum/ }));
    expect(await screen.findByRole('button', { name: /^Stary projekt/ })).toBeTruthy();
    expect(screen.queryByText('Remont sali')).toBeNull();
  });

  it('udostępnianie w menu ⋯ tylko dla właściciela', async () => {
    render(<MemoryRouter><BoardsList userEmail="ja@x.pl" onOpenBoard={() => {}} /></MemoryRouter>);
    await screen.findByRole('button', { name: /^Remont sali/ });
    fireEvent.click(screen.getByRole('button', { name: 'Działania: Remont sali' }));
    let menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /Ustaw jako prywatną/ })).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: /Archiwizuj/ })).toBeTruthy();
    fireEvent.keyDown(menu, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Działania: Cudza tablica' }));
    menu = await screen.findByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: /Ustaw jako prywatną/ })).toBeNull();
    expect(within(menu).getByRole('menuitem', { name: /Duplikuj/ })).toBeTruthy();
  });
});

describe('MyWork', () => {
  it('elementy z assignee_emails, bez archiwum; linki przez taskItemLink', async () => {
    render(<MemoryRouter><MyWork userEmail="Ja@x.pl" userName="Ja" onOpenBoard={() => {}} /></MemoryRouter>);
    const a = await screen.findByRole('link', { name: /Kupić farbę/ });
    expect(a.getAttribute('href')).toBe('/projekty?board=b1&item=i1');
    expect(screen.getByRole('link', { name: /Nagrać kazanie/ }).getAttribute('href')).toBe('/media?item=i2');
    expect(screen.queryByText('W archiwum')).toBeNull();
    const q = h.queries.find((x) => x.table === 'board_items');
    expect(q.filters).toContainEqual(['contains', 'assignee_emails', ['ja@x.pl']]);
  });
});
