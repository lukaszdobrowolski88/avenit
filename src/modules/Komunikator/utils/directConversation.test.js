import { describe, it, expect, vi, beforeEach } from 'vitest';

// Fałszywy klient bazy: łańcuch .from().select().eq()… zapisuje zapytanie, a odpowiedź
// wybiera handler (tabela + operacja + filtry). Bez sieci.
const calls = [];
let handler = () => ({ data: [], error: null });
const makeBuilder = (table) => {
  const q = { table, op: 'select', filters: [], values: null };
  const b = {
    select() { return b; },
    insert(v) { q.op = 'insert'; q.values = v; return b; },
    update(v) { q.op = 'update'; q.values = v; return b; },
    delete() { q.op = 'delete'; return b; },
    eq(c, v) { q.filters.push(['eq', c, v]); return b; },
    ilike(c, v) { q.filters.push(['ilike', c, v]); return b; },
    in(c, v) { q.filters.push(['in', c, v]); return b; },
    is(c, v) { q.filters.push(['is', c, v]); return b; },
    order() { return b; },
    limit() { return b; },
    single() { q.single = true; return b; },
    silent() { return b; },
    then(res, rej) {
      calls.push(q);
      return Promise.resolve(handler(q)).then(res, rej);
    },
  };
  return b;
};
vi.mock('../../../lib/supabase', () => ({ supabase: { from: (t) => makeBuilder(t) } }));

const { openOrCreateDirect, findExistingDirect } = await import('./directConversation');

const filter = (q, type, col) => q.filters.find(f => f[0] === type && f[1] === col)?.[2];

beforeEach(() => { calls.length = 0; });

describe('Rozmowa 1:1 — bez duplikatów', () => {
  it('otwiera istniejącą (także z archiwum) zamiast zakładać nową; przy duplikatach — najświeższą', async () => {
    handler = (q) => {
      if (q.table === 'conversation_participants' && q.op === 'select') {
        return filter(q, 'ilike', 'user_email') === 'ja@x.pl'
          ? { data: [{ conversation_id: 'g1' }, { conversation_id: 'd-old' }, { conversation_id: 'd-live' }], error: null }
          : { data: [{ conversation_id: 'g1' }, { conversation_id: 'd-old' }, { conversation_id: 'd-live' }], error: null };
      }
      if (q.table === 'conversations' && q.op === 'select') {
        return { data: [{ id: 'd-old', type: 'direct', created_at: '2026-01-01' }, { id: 'd-live', type: 'direct', created_at: '2026-02-01' }], error: null };
      }
      if (q.table === 'messages') {
        return { data: filter(q, 'eq', 'conversation_id') === 'd-live' ? [{ created_at: '2026-10-01' }] : [], error: null };
      }
      return { data: [{ conversation_id: 'x' }], error: null };
    };
    const res = await openOrCreateDirect('ja@x.pl', 'ola@x.pl');
    expect(res).toEqual({ id: 'd-live', created: false });
    // mój wiersz wraca z archiwum, nic nowego nie powstaje
    const unarchive = calls.find(q => q.table === 'conversation_participants' && q.op === 'update');
    expect(unarchive.values).toEqual({ archived: false });
    expect(filter(unarchive, 'eq', 'conversation_id')).toBe('d-live');
    expect(calls.some(q => q.op === 'insert')).toBe(false);
  });

  it('nowa rozmowa, gdy nie ma wspólnej; obie osoby administratorami', async () => {
    handler = (q) => {
      if (q.table === 'conversation_participants' && q.op === 'select') return { data: [], error: null };
      if (q.table === 'conversations' && q.op === 'insert') return { data: { id: 'new' }, error: null };
      if (q.table === 'conversation_participants' && q.op === 'insert') return { data: q.values, error: null };
      return { data: [], error: null };
    };
    const res = await openOrCreateDirect('ja@x.pl', 'ola@x.pl');
    expect(res).toEqual({ id: 'new', created: true });
    const parts = calls.find(q => q.table === 'conversation_participants' && q.op === 'insert');
    expect(parts.values.map(r => r.role)).toEqual(['admin', 'admin']);
  });

  it('serwer odrzuca duplikat (409 DIRECT_EXISTS) — otwieramy istniejącą', async () => {
    let lookups = 0;
    handler = (q) => {
      if (q.table === 'conversation_participants' && q.op === 'select') {
        lookups += 1;
        // pierwsze szukanie (przed zapisem) nic nie widzi — wyścig z drugim urządzeniem
        return lookups <= 1 ? { data: [], error: null } : { data: [{ conversation_id: 'd1' }], error: null };
      }
      if (q.table === 'conversations' && q.op === 'insert') return { data: { id: 'tmp' }, error: null };
      if (q.table === 'conversation_participants' && q.op === 'insert') {
        return { data: null, error: { message: 'Rozmowa z tą osobą już istnieje', code: 'DIRECT_EXISTS' } };
      }
      if (q.table === 'conversations' && q.op === 'select') return { data: [{ id: 'd1', type: 'direct' }], error: null };
      return { data: [{ conversation_id: 'd1' }], error: null };
    };
    const res = await openOrCreateDirect('ja@x.pl', 'ola@x.pl');
    expect(res).toEqual({ id: 'd1', created: false });
  });

  it('inny błąd zapisu — przekazany dalej (komunikat pokaże okno)', async () => {
    handler = (q) => {
      if (q.table === 'conversation_participants' && q.op === 'select') return { data: [], error: null };
      if (q.table === 'conversations' && q.op === 'insert') return { data: null, error: { message: 'Brak uprawnienia', code: '403' } };
      return { data: [], error: null };
    };
    await expect(openOrCreateDirect('ja@x.pl', 'ola@x.pl')).rejects.toMatchObject({ code: '403' });
  });

  it('brak wspólnych rozmów — null', async () => {
    handler = () => ({ data: [], error: null });
    expect(await findExistingDirect('ja@x.pl', 'ola@x.pl')).toBeNull();
  });
});
