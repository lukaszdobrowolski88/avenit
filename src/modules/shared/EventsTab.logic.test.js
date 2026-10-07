import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eventIncludesTeam } from '../../lib/scheduleBridge';

// Atrapa klienta API: zapisuje kolejność operacji i pozwala wymusić błąd na danej tabeli.
const h = vi.hoisted(() => ({ calls: [], failOn: null }));
vi.mock('../../lib/supabase', () => {
  const from = (table) => {
    const state = { table, op: 'select' };
    const b = {
      delete() { state.op = 'delete'; return b; },
      eq(col, val) { state.filter = [col, val]; return b; },
      then(res, rej) {
        h.calls.push(`${state.op}:${state.table}:${state.filter?.join('=')}`);
        const error = h.failOn === state.table ? { status: 403, message: 'forbidden' } : null;
        return Promise.resolve({ data: null, error }).then(res, rej);
      },
    };
    return b;
  };
  return { supabase: { from } };
});

const { splitModuleEvents, deleteEventWithCleanup } = await import('./EventsTab');

const rules = [{ module_key: '', event_type: 'nabożeństwo', teams: ['worship', 'media'] }];

// UXB-11: zakładka „Wydarzenia” modułu i Grafik używają tego samego predykatu.
describe('eventIncludesTeam (wspólny dla Grafiku i zakładki Wydarzenia)', () => {
  it('reguła typu z kalendarza ogólnego włącza nabożeństwo do służb z reguły', () => {
    const ev = { id: 1, module_key: null, event_type: 'nabożeństwo' };
    expect(eventIncludesTeam(ev, 'worship', rules)).toBe(true);
    expect(eventIncludesTeam(ev, 'kids', rules)).toBe(false);
  });
  it('override team_types ma pierwszeństwo przed regułą', () => {
    expect(eventIncludesTeam({ event_type: 'nabożeństwo', team_types: 'kids' }, 'worship', rules)).toBe(false);
    expect(eventIncludesTeam({ event_type: 'nabożeństwo', team_types: 'kids, worship' }, 'worship', rules)).toBe(true);
  });
  it('istniejące przypisania służby zawsze wiążą wydarzenie (także JSON jako tekst)', () => {
    expect(eventIncludesTeam({ team_types: 'kids', assignments: { media: { kamera: 'Ola' } } }, 'media', rules)).toBe(true);
    expect(eventIncludesTeam({ assignments: '{"media":{"notatki":"x"}}' }, 'media', [])).toBe(false);
    expect(eventIncludesTeam({ assignments: '{"media":{"kamera":"Ola"}}' }, 'media', [])).toBe(true);
  });
  it('bez reguły: służba = moduł wydarzenia', () => {
    expect(eventIncludesTeam({ module_key: 'media' }, 'media', [])).toBe(true);
    expect(eventIncludesTeam({ module_key: 'worship' }, 'media', [])).toBe(false);
  });
});

describe('splitModuleEvents', () => {
  it('własne wydarzenia modułu + „Służymy na” z innych kalendarzy, bez duplikatów', () => {
    const all = [
      { id: 1, module_key: 'worship', title: 'Próba' },
      { id: 2, module_key: null, event_type: 'nabożeństwo', title: 'Nabożeństwo niedzielne' },
      { id: 3, module_key: null, event_type: 'spotkanie', title: 'Rada' },
      { id: 4, module_key: 'media', title: 'Szkolenie mediów' },
    ];
    const { own, serving } = splitModuleEvents(all, 'worship', rules);
    expect(own.map((e) => e.id)).toEqual([1]);
    expect(serving.map((e) => e.id)).toEqual([2]);
  });
});

// FUNC-13: najpierw rekord (błąd = nic nie ruszamy), potem sprzątanie przydziałów i materiałów.
describe('deleteEventWithCleanup', () => {
  beforeEach(() => { h.calls.length = 0; h.failOn = null; });

  it('usuwa wydarzenie, a dopiero potem przydziały do służby i materiały', async () => {
    const r = await deleteEventWithCleanup(7);
    expect(r.error).toBeNull();
    expect(r.cleanupError).toBeNull();
    expect(h.calls[0]).toBe('delete:events:id=7');
    expect(h.calls.slice(1).sort()).toEqual(['delete:event_materials:event_id=7', 'delete:schedule_assignments:event_id=7']);
  });

  it('błąd usunięcia wydarzenia (403) — nie sprząta niczego', async () => {
    h.failOn = 'events';
    const r = await deleteEventWithCleanup(7);
    expect(r.error).toBeTruthy();
    expect(h.calls).toEqual(['delete:events:id=7']);
  });

  it('nieudane sprzątanie jest zgłaszane osobno (wydarzenie już usunięte)', async () => {
    h.failOn = 'schedule_assignments';
    const r = await deleteEventWithCleanup(7);
    expect(r.error).toBeNull();
    expect(r.cleanupError).toBeTruthy();
  });
});
