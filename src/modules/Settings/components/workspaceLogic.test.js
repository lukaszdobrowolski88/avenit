import { describe, it, expect } from 'vitest';
import { connectionState, callbackMessage, runSummary, providerLabel, domainsToText } from './workspaceLogic';

describe('karta Google Workspace / Microsoft 365', () => {
  it('stan połączenia', () => {
    expect(connectionState({ connection: null }).tone).toBe('none');
    expect(connectionState({ connection: { status: 'active', account_email: 'it@schwro.pl' } })).toEqual({ tone: 'ok', label: 'Połączone jako it@schwro.pl' });
    expect(connectionState({ connection: { status: 'revoked' } }).tone).toBe('error');
    expect(connectionState({ connection: { status: 'error' } }).label).toBe('Błąd połączenia');
  });

  it('komunikat po powrocie z ekranu zgody', () => {
    expect(callbackMessage('google', 'connected')).toEqual({ ok: true, text: 'Połączono z Google Workspace.' });
    const err = callbackMessage('microsoft', 'error', 'not_admin');
    expect(err.ok).toBe(false);
    expect(err.text).toMatch(/Microsoft 365/);
    expect(err.text).toMatch(/administrator/);
    expect(callbackMessage('microsoft', 'error', 'cokolwiek').text).toMatch(/błąd po stronie dostawcy/);
  });

  it('podsumowanie przebiegu', () => {
    expect(runSummary({ dry_run: true, counts: { create: 3, link: 2, block: 0 } })).toBe('3 nowych, 2 do powiązania, 0 do zablokowania');
    expect(runSummary({ dry_run: false, counts: { applied: { created: 1, linked: 4, blocked: 1 } } })).toBe('1 utworzonych, 4 powiązanych, 1 zablokowanych');
    expect(runSummary({ dry_run: false, counts: {} })).toBe('0 utworzonych, 0 powiązanych, 0 zablokowanych');
    expect(providerLabel('google')).toBe('Google Workspace');
    expect(domainsToText(['a.pl', 'b.pl'])).toBe('a.pl, b.pl');
  });
});
