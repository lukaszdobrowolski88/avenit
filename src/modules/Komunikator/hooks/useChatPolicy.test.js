import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../lib/supabase', () => ({ supabase: { functions: { invoke: vi.fn() } } }));

const { normalizeChatPolicy, DEFAULT_CHAT_POLICY } = await import('./useChatPolicy');

describe('Komunikator — polityka rozmów prywatnych (K9)', () => {
  it('brak odpowiedzi serwera → wszystko dozwolone', () => {
    expect(normalizeChatPolicy(null)).toEqual({ ...DEFAULT_CHAT_POLICY });
    expect(normalizeChatPolicy({ dm: 'cokolwiek' }).dm).toBe('all');
  });

  it('kształt serwera: canStartDirect + canStartDirectWith (zakres)', () => {
    expect(normalizeChatPolicy({ dm: 'leaders', protectMinors: true, canStartDirect: true, canStartDirectWith: 'leaders' }))
      .toMatchObject({ dm: 'leaders', canStartDirect: true, scope: 'leaders', protectMinors: true });
    expect(normalizeChatPolicy({ dm: 'off', protectMinors: false, canStartDirect: false, canStartDirectWith: null }))
      .toMatchObject({ dm: 'off', canStartDirect: false, scope: null, protectMinors: false });
    expect(normalizeChatPolicy({ dm: 'all', canStartDirect: true, canStartDirectWith: 'minors', isMinor: true }))
      .toMatchObject({ scope: 'minors', isMinor: true });
  });

  it('starsze/uproszczone odpowiedzi: lista e-maili albo samo dm', () => {
    expect(normalizeChatPolicy({ dm: 'leaders', canStartDirectWith: ['a@x.pl'] }))
      .toMatchObject({ canStartDirect: true, scope: 'list', allowedEmails: ['a@x.pl'] });
    expect(normalizeChatPolicy({ dm: 'off' })).toMatchObject({ canStartDirect: false, scope: null });
    expect(normalizeChatPolicy({ dm: 'leaders' })).toMatchObject({ canStartDirect: true, scope: 'all' });
  });
});
