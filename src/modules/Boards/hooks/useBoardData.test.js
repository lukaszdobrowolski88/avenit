// useBoardData: zapis tylko zmienionej komórki (board-item-patch), wiersz z realtime nie cofa edycji
// w locie, ciche odświeżenie po powrocie na kartę, usunięcie z „Cofnij” (i wykonanie przy odmontowaniu).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ DB: {}, handlers: [], invoke: null, deletes: [] }));

function query(table) {
  const q = { op: 'select', filters: [], single: false, payload: null };
  const run = () => {
    let rows = h.DB[table] || (h.DB[table] = []);
    const match = (r) => q.filters.every(([op, c, v]) => (op === 'eq' ? String(r[c]) === String(v) : v.map(String).includes(String(r[c]))));
    if (q.op === 'delete') {
      const gone = rows.filter(match);
      h.deletes.push({ table, ids: gone.map(r => r.id) });
      h.DB[table] = rows.filter(r => !match(r));
      return { data: null, error: null };
    }
    if (q.op === 'update') {
      h.DB[table] = rows.map(r => (match(r) ? { ...r, ...q.payload } : r));
      rows = h.DB[table].filter(match);
    } else if (q.op === 'insert') {
      const row = { id: `new${rows.length}`, ...q.payload };
      rows.push(row);
      rows = [row];
    } else rows = rows.filter(match);
    if (q.single) return { data: rows[0] || null, error: rows[0] ? null : { code: 'PGRST116', message: 'brak' } };
    return { data: rows, error: null };
  };
  const api = {
    select: () => api, order: () => api, limit: () => api,
    eq: (c, v) => { q.filters.push(['eq', c, v]); return api; },
    in: (c, v) => { q.filters.push(['in', c, v]); return api; },
    single: () => { q.single = true; return api; },
    maybeSingle: () => { q.single = true; return api; },
    insert: (p) => { q.op = 'insert'; q.payload = p; return api; },
    update: (p) => { q.op = 'update'; q.payload = p; return api; },
    delete: () => { q.op = 'delete'; return api; },
    then: (res, rej) => Promise.resolve(run()).then(res, rej),
  };
  return api;
}

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: (t) => query(t),
    functions: { invoke: (...args) => h.invoke(...args) },
    channel: () => {
      const ch = {
        on: (_type, filter, cb) => { h.handlers.push({ table: filter.table, cb }); return ch; },
        subscribe: (cb) => { cb?.('SUBSCRIBED'); return ch; },
      };
      return ch;
    },
    removeChannel: () => {},
  },
}));

const toasts = vi.hoisted(() => []);
vi.mock('../../../lib/toast', () => ({
  toast: {
    success: (m) => toasts.push({ type: 'success', ...(typeof m === 'string' ? { message: m } : m) }),
    error: (m) => toasts.push({ type: 'error', message: m }),
    info: (m) => toasts.push({ type: 'info', message: m }),
  },
}));

import { useBoardData } from './useBoardData';
import { resetFnCache } from '../lib/boardSync';

const emit = (table, payload) => h.handlers.filter(x => x.table === table).forEach(x => x.cb(payload));

beforeEach(() => {
  resetFnCache();
  h.handlers = [];
  h.deletes = [];
  toasts.length = 0;
  h.DB = {
    boards: [{ id: 'b1', name: 'Tablica' }],
    board_columns: [{ id: 'status', board_id: 'b1', type: 'status', settings: { labels: [] } }, { id: 'prio', board_id: 'b1', type: 'priority', settings: { labels: [] } }],
    board_groups: [{ id: 'g1', board_id: 'b1', name: 'Grupa', display_order: 0 }],
    board_items: [
      { id: 'i1', board_id: 'b1', group_id: 'g1', name: 'Jedno', cells: { status: 'todo', prio: 'low' }, display_order: 0 },
      { id: 's1', board_id: 'b1', group_id: 'g1', parent_item_id: 'i1', name: 'Pod', cells: {}, display_order: 0 },
      { id: 'i2', board_id: 'b1', group_id: 'g1', name: 'Dwa', cells: {}, display_order: 1 },
    ],
    board_views: [], app_users: [], board_item_activity: [],
  };
  h.invoke = async (name, { body }) => {
    if (name !== 'board-item-patch') return { data: { ok: true }, error: null };
    const row = h.DB.board_items.find(r => r.id === body.item_id);
    row.cells = { ...row.cells, ...body.cells };
    return { data: { item: { ...row } }, error: null };
  };
});

async function mount() {
  const hook = renderHook(() => useBoardData('b1', { userEmail: 'ja@x.pl', userName: 'Ja' }));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}
const item = (r, id) => r.current.items.find(i => i.id === id);

describe('useBoardData — bez gubienia zmian', () => {
  it('updateCell wysyła tylko zmienioną komórkę; realtime w trakcie zapisu nie cofa edycji', async () => {
    let release;
    const calls = [];
    h.invoke = (name, { body }) => {
      calls.push({ name, body });
      return new Promise((res) => { release = () => res({ data: { item: { id: 'i1', board_id: 'b1', group_id: 'g1', name: 'Jedno', cells: { status: 'done', prio: 'high' } } }, error: null }); });
    };
    const { result } = await mount();
    let p;
    act(() => { p = result.current.updateCell('i1', 'status', 'done'); });
    expect(calls[0]).toEqual({ name: 'board-item-patch', body: { item_id: 'i1', cells: { status: 'done' } } });
    expect(item(result, 'i1').cells.status).toBe('done');
    // Ktoś inny zmienił priorytet — echo realtime ma jeszcze stary status.
    act(() => emit('board_items', { eventType: 'UPDATE', new: { id: 'i1', board_id: 'b1', group_id: 'g1', name: 'Jedno', cells: { status: 'todo', prio: 'high' } } }));
    expect(item(result, 'i1').cells).toEqual({ status: 'done', prio: 'high' });
    await act(async () => { release(); await p; });
    expect(item(result, 'i1').cells).toEqual({ status: 'done', prio: 'high' });
  });

  it('wiersz innej tablicy z realtime jest ignorowany (filtr realtime nie działa)', async () => {
    const { result } = await mount();
    act(() => emit('board_items', { eventType: 'INSERT', new: { id: 'x9', board_id: 'inna', group_id: 'gx', cells: {} } }));
    expect(item(result, 'x9')).toBeUndefined();
  });

  it('powrót na kartę dociąga zmiany z serwera', async () => {
    const { result } = await mount();
    h.DB.board_items = h.DB.board_items.map(r => (r.id === 'i2' ? { ...r, name: 'Zmienione gdzie indziej' } : r));
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => expect(item(result, 'i2').name).toBe('Zmienione gdzie indziej'));
  });
});

describe('useBoardData — usunięcie z „Cofnij”', () => {
  it('zadanie (z podzadaniem) znika od razu, „Cofnij” przywraca, nic nie idzie do bazy', async () => {
    const { result, unmount } = await mount();
    act(() => { result.current.removeItems(['i1']); });
    expect(item(result, 'i1')).toBeUndefined();
    expect(item(result, 's1')).toBeUndefined();
    const t = toasts.find(x => x.action);
    expect(t.message).toContain('Jedno');
    expect(t.action.label).toBe('Cofnij');
    act(() => t.action.onClick());
    expect(item(result, 'i1')).toBeDefined();
    expect(item(result, 's1')).toBeDefined();
    unmount();
    await Promise.resolve();
    expect(h.deletes).toHaveLength(0);
  });

  it('bez „Cofnij” usunięcie wykonuje się najpóźniej przy odmontowaniu tablicy', async () => {
    const { result, unmount } = await mount();
    act(() => { result.current.removeItems(['i1', 'i2']); });
    expect(result.current.items.filter(i => !i.parent_item_id)).toHaveLength(0);
    expect(toasts.find(x => x.action).message).toContain('2');
    unmount();
    await waitFor(() => expect(h.deletes).toHaveLength(1));
    expect(h.deletes[0]).toEqual({ table: 'board_items', ids: ['i1', 'i2'] });
  });

  it('usunięcie grupy chowa jej zadania i daje „Cofnij”', async () => {
    const { result } = await mount();
    act(() => { result.current.removeGroup('g1'); });
    expect(result.current.groups).toHaveLength(0);
    expect(result.current.items).toHaveLength(0);
    act(() => toasts.find(x => x.action).action.onClick());
    expect(result.current.groups).toHaveLength(1);
    expect(result.current.items).toHaveLength(3);
  });
});
