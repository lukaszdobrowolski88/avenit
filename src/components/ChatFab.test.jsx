import { describe, it, expect } from 'vitest';
import { unreadMessageCount } from './ChatFab';

describe('ChatFab — licznik nieprzeczytanych wiadomości', () => {
  it('liczy tylko nieprzeczytane wiadomości i wzmianki', () => {
    expect(unreadMessageCount([
      { type: 'message', read: false },
      { type: 'mention', read: false },
      { type: 'message', read: true },
      { type: 'task', read: false },
      { type: 'system', read: false },
    ])).toBe(2);
    expect(unreadMessageCount(null)).toBe(0);
  });
});
