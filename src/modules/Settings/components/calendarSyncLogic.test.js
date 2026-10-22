import { describe, it, expect } from 'vitest';
import { calendarSyncState, calCallbackMessage, calProviderLabel, syncSummary, textToList, listToText, USER_PREF_OPTIONS } from './calendarSyncLogic';

describe('karta Kalendarz Google / Outlook', () => {
  it('stan połączenia i kalendarza', () => {
    expect(calendarSyncState({ connection: null }).tone).toBe('none');
    expect(calendarSyncState({ connection: { status: 'active', account_email: 'jan@gmail.com' }, target: { enabled: true, status: 'active' } }))
      .toEqual({ tone: 'ok', label: 'Połączone jako jan@gmail.com' });
    expect(calendarSyncState({ connection: { status: 'revoked' }, target: {} }).tone).toBe('error');
    expect(calendarSyncState({ connection: { status: 'active' }, target: { status: 'error', enabled: true } }).label).toBe('Błąd synchronizacji');
    expect(calendarSyncState({ connection: { status: 'active' }, target: { status: 'active', enabled: false } }).tone).toBe('warn');
  });

  it('komunikat po powrocie z ekranu zgody', () => {
    expect(calCallbackMessage('google', 'connected').ok).toBe(true);
    expect(calCallbackMessage('microsoft', 'error', 'scopes').text).toMatch(/Outlook \(Microsoft 365\).*dostępu do kalendarza/);
    expect(calCallbackMessage('google', 'error', 'xyz').text).toMatch(/błąd po stronie dostawcy/);
    expect(calProviderLabel('google')).toBe('Google Calendar');
  });

  it('podsumowanie i listy', () => {
    expect(syncSummary({ synced: 4, hidden: 1, last_push_at: null })).toBe('4 wydarzeń w kalendarzu · ukryte przez Ciebie: 1 · czeka na pierwszą synchronizację');
    expect(syncSummary(null)).toBe('');
    expect(textToList('service, conference; service\n')).toEqual(['service', 'conference']);
    expect(listToText(['a', 'b'])).toBe('a, b');
    expect(USER_PREF_OPTIONS().map((o) => o.key)).toEqual(['my_services', 'registered', 'my_groups', 'my_meetings', 'organized']);
  });
});
