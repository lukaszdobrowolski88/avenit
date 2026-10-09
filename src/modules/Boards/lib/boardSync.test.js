import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  applyCellPatch, createPendingEdits, upsertRow, isFnMissing, patchBoardItem, reorderBoardItems,
  createUndoQueue, withDescendants, applyCommentEvent, resetFnCache, invokeFn,
} from './boardSync';

// Minimalny klient w stylu supabase-js: functions.invoke + from().select/update/eq/single.
function fakeClient({ fn, rows = {} } = {}) {
  const calls = { invoke: [], update: [], select: [] };
  const client = {
    calls,
    functions: { invoke: vi.fn(async (name, opts) => { calls.invoke.push({ name, body: opts.body, silent: opts.silent }); return fn(name, opts.body); }) },
    from(table) {
      const q = { table, op: 'select', filters: [], payload: null };
      const api = {
        select() { if (q.op !== 'update') q.op = 'select'; return api; },
        update(p) { q.op = 'update'; q.payload = p; return api; },
        eq(c, v) { q.filters.push([c, v]); return api; },
        single() { return api; },
        then(resolve, reject) {
          const id = q.filters.find(([c]) => c === 'id')?.[1];
          if (q.op === 'update') {
            calls.update.push({ table, id, payload: q.payload });
            rows[id] = { ...(rows[id] || { id }), ...q.payload };
            return Promise.resolve({ data: rows[id], error: null }).then(resolve, reject);
          }
          calls.select.push({ table, id });
          return Promise.resolve({ data: rows[id] || null, error: null }).then(resolve, reject);
        },
      };
      return api;
    },
  };
  return client;
}
const ROUTE_404 = { data: null, error: { message: 'Not Found', status: 404, context: { message: 'Route POST:/api/fn/x not found', error: 'Not Found', statusCode: 404 } } };

beforeEach(() => resetFnCache());

describe('applyCellPatch', () => {
  it('scala tylko podane klucze, null usuwa', () => {
    expect(applyCellPatch({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({ a: 1, b: 3, c: 4 });
    expect(applyCellPatch({ a: 1, b: 2 }, { a: null })).toEqual({ b: 2 });
    expect(applyCellPatch(null, { a: 1 })).toEqual({ a: 1 });
  });
});

describe('pendingEdits — wiersz z realtime nie cofa edycji w locie', () => {
  it('nakłada wartość w locie na świeży wiersz z serwera', () => {
    const p = createPendingEdits();
    const t = p.begin('i1', { cells: { status: 'done' } });
    // Ktoś inny zmienił kolumnę „prio” — przychodzi wiersz ze starym statusem.
    const server = { id: 'i1', cells: { status: 'todo', prio: 'high' } };
    expect(p.overlay(server).cells).toEqual({ status: 'done', prio: 'high' });
    p.end(t);
    expect(p.overlay(server)).toBe(server);
  });

  it('starszy zapis nie zdejmuje nowszej edycji tego samego klucza', () => {
    const p = createPendingEdits();
    const t1 = p.begin('i1', { cells: { a: 1 } });
    const t2 = p.begin('i1', { cells: { a: 2 } });
    p.end(t1);
    expect(p.overlay({ id: 'i1', cells: { a: 0 } }).cells.a).toBe(2);
    p.end(t2);
    expect(p.has('i1')).toBe(false);
  });

  it('pola (nazwa) i null w komórce', () => {
    const p = createPendingEdits();
    p.begin('i1', { fields: { name: 'Nowa' }, cells: { x: null } });
    expect(p.overlay({ id: 'i1', name: 'Stara', cells: { x: 5, y: 1 } })).toEqual({ id: 'i1', name: 'Nowa', cells: { y: 1 } });
  });
});

describe('upsertRow', () => {
  it('spóźnione echo (starszy updated_at) nie nadpisuje nowszego wiersza', () => {
    const list = [{ id: 1, name: 'B', updated_at: '2026-10-09T10:00:05Z' }];
    expect(upsertRow(list, { id: 1, name: 'A', updated_at: '2026-10-09T10:00:01Z' })).toBe(list);
    expect(upsertRow(list, { id: 1, name: 'C', updated_at: '2026-10-09T10:00:09Z' })[0].name).toBe('C');
    expect(upsertRow(list, { id: 2, name: 'N' })).toHaveLength(2);
  });
});

describe('patchBoardItem', () => {
  it('wysyła TYLKO zmienioną komórkę do board-item-patch', async () => {
    const client = fakeClient({ fn: async (_n, body) => ({ data: { item: { id: body.item_id, cells: { ...body.cells, other: 1 } } }, error: null }) });
    const r = await patchBoardItem(client, 'i1', { cells: { s: 'done' } });
    expect(r.ok).toBe(true);
    expect(client.calls.invoke[0]).toMatchObject({ name: 'board-item-patch', body: { item_id: 'i1', cells: { s: 'done' } }, silent: true });
    expect(r.item.cells).toEqual({ s: 'done', other: 1 });
    expect(client.calls.update).toHaveLength(0);
  });

  it('stary serwer (404 trasy): czyta świeże cells i scala tylko zmieniony klucz', async () => {
    const rows = { i1: { id: 'i1', cells: { a: 'cudza zmiana', s: 'todo' } } };
    const client = fakeClient({ fn: async () => ROUTE_404, rows });
    const r = await patchBoardItem(client, 'i1', { cells: { s: 'done' }, name: 'X' });
    expect(r.ok).toBe(true);
    expect(client.calls.update[0].payload).toEqual({ name: 'X', cells: { a: 'cudza zmiana', s: 'done' } });
    // Kolejne wywołanie nie pyta już o brakującą funkcję.
    await patchBoardItem(client, 'i1', { cells: { s: 'todo' } });
    expect(client.calls.invoke).toHaveLength(1);
  });

  it('inny błąd fn (np. 403) to błąd, nie fallback', async () => {
    const client = fakeClient({ fn: async () => ({ data: null, error: { message: 'Brak dostępu', status: 403, context: { error: 'Brak dostępu' } } }) });
    const r = await patchBoardItem(client, 'i1', { cells: { s: 'done' } });
    expect(r.ok).toBe(false);
    expect(client.calls.update).toHaveLength(0);
  });
});

describe('isFnMissing / invokeFn', () => {
  it('rozpoznaje 404 trasy Fastify, ale nie 404 z treścią funkcji', () => {
    expect(isFnMissing(ROUTE_404.error)).toBe(true);
    expect(isFnMissing({ status: 404, context: { error: 'Nie znaleziono zadania', code: 'not_found' } })).toBe(false);
    expect(isFnMissing({ status: 500 })).toBe(false);
  });
  it('wyjątek sieci → { error }', async () => {
    const client = { functions: { invoke: async () => { throw new TypeError('Failed to fetch'); } } };
    expect(await invokeFn(client, 'x', {})).toHaveProperty('error');
  });
});

describe('reorderBoardItems', () => {
  it('jedno wywołanie fn z kolejnością', async () => {
    const client = fakeClient({ fn: async () => ({ data: { ok: true }, error: null }) });
    const r = await reorderBoardItems(client, { boardId: 'b', groupId: 'g', orderedIds: ['x', 'y'] });
    expect(r.ok).toBe(true);
    expect(client.calls.invoke[0].body).toEqual({ board_id: 'b', group_id: 'g', ordered_ids: ['x', 'y'] });
  });
  it('stary serwer — zapis po kolei', async () => {
    const client = fakeClient({ fn: async () => ROUTE_404 });
    await reorderBoardItems(client, { boardId: 'b', groupId: 'g', orderedIds: ['x', 'y'] });
    expect(client.calls.update.map(u => [u.id, u.payload])).toEqual([['x', { display_order: 0, group_id: 'g' }], ['y', { display_order: 1, group_id: 'g' }]]);
  });
});

describe('createUndoQueue — usunięcie z „Cofnij”', () => {
  it('wykonuje po czasie; Cofnij przed czasem anuluje', async () => {
    vi.useFakeTimers();
    try {
      const q = createUndoQueue({ delayMs: 6000 });
      const a = vi.fn(); const b = vi.fn();
      q.schedule(a);
      const hb = q.schedule(b);
      expect(hb.undo()).toBe(true);
      await vi.advanceTimersByTimeAsync(5999);
      expect(a).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).not.toHaveBeenCalled();
      expect(hb.undo()).toBe(false);
    } finally { vi.useRealTimers(); }
  });

  it('flushAll wykonuje zaległe od razu (odmontowanie / zamknięcie karty); Cofnij potem = za późno', async () => {
    const q = createUndoQueue({ delayMs: 60000 });
    const run = vi.fn();
    const h = q.schedule(run);
    await q.flushAll();
    expect(run).toHaveBeenCalledTimes(1);
    expect(q.size()).toBe(0);
    expect(h.undo()).toBe(false);
    await h.commit();
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('withDescendants', () => {
  it('zadanie + podzadania (głęboko)', () => {
    const items = [{ id: 1 }, { id: 2, parent_item_id: 1 }, { id: 3, parent_item_id: 2 }, { id: 4 }];
    expect([...withDescendants([1], items)].sort()).toEqual([1, 2, 3]);
  });
});

describe('applyCommentEvent — licznik komentarzy', () => {
  it('INSERT tej tablicy dodaje, echo nie dubluje, inna tablica ignorowana, DELETE odejmuje', () => {
    let m = new Map();
    m = applyCommentEvent(m, { eventType: 'INSERT', new: { id: 'u1', item_id: 'i1', board_id: 'b1' } }, 'b1');
    m = applyCommentEvent(m, { eventType: 'INSERT', new: { id: 'u1', item_id: 'i1', board_id: 'b1' } }, 'b1');
    m = applyCommentEvent(m, { eventType: 'INSERT', new: { id: 'u9', item_id: 'i9', board_id: 'other' } }, 'b1');
    expect(m.get('i1').size).toBe(1);
    expect(m.has('i9')).toBe(false);
    m = applyCommentEvent(m, { eventType: 'DELETE', old: { id: 'u1' } }, 'b1');
    expect(m.get('i1').size).toBe(0);
  });
});
