import { describe, it, expect } from 'vitest';
import { presenceState, lastSeenLabel, presenceByEmail } from '@avenit/shared/src/lib/presence.js';

const now = Date.parse('2026-10-20T12:00:00Z');
const ago = (ms) => new Date(now - ms).toISOString();

describe('presenceState', () => {
  it('świeży sygnał online', () => {
    expect(presenceState({ status: 'online', last_seen: ago(30_000) }, now)).toBe('online');
  });
  it('online bez sygnału > 2 min → zaraz wracam', () => {
    expect(presenceState({ status: 'online', last_seen: ago(5 * 60_000) }, now)).toBe('away');
  });
  it('aplikacja w tle (away) do 15 min', () => {
    expect(presenceState({ status: 'away', last_seen: ago(10 * 60_000) }, now)).toBe('away');
  });
  it('do godziny — ostatnio aktywni (także po wylogowaniu)', () => {
    expect(presenceState({ status: 'away', last_seen: ago(40 * 60_000) }, now)).toBe('recent');
    expect(presenceState({ status: 'offline', last_seen: ago(3 * 60_000) }, now)).toBe('recent');
  });
  it('dawniej albo brak danych — offline', () => {
    expect(presenceState({ status: 'online', last_seen: ago(2 * 3600_000) }, now)).toBe('offline');
    expect(presenceState(null, now)).toBe('offline');
    expect(presenceState({ status: 'online', last_seen: 'zle' }, now)).toBe('offline');
  });
});

describe('lastSeenLabel / presenceByEmail', () => {
  it('etykiety czasu', () => {
    expect(lastSeenLabel(ago(20_000), now)).toBe('przed chwilą');
    expect(lastSeenLabel(ago(12 * 60_000), now)).toBe('12 min temu');
    expect(lastSeenLabel(ago(3 * 3600_000), now)).toBe('3 godz. temu');
  });
  it('dopasowanie e-maili bez względu na wielkość liter', () => {
    const m = presenceByEmail([{ user_email: 'Jan@X.pl', status: 'online' }]);
    expect(m.get('jan@x.pl')?.status).toBe('online');
  });
});
