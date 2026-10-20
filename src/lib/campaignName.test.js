import { describe, it, expect } from 'vitest';
import {
  campaignFallbackName, campaignDateName, smsBodySnippet, buildUserNameMap, userLabel,
} from '@avenit/shared/src/lib/campaignName.js';

const now = new Date(2026, 9, 20, 9, 5);

describe('campaignFallbackName', () => {
  it('wpisana nazwa wygrywa (przycięta)', () => {
    expect(campaignFallbackName({ kind: 'push', name: '  Niedziela  ', title: 'Tytuł' }, now)).toBe('Niedziela');
  });

  it('push bez nazwy → tytuł', () => {
    expect(campaignFallbackName({ kind: 'push', name: '   ', title: '  Zbiórka o 18:00 ', body: 'x' }, now)).toBe('Zbiórka o 18:00');
  });

  it('SMS bez nazwy → początek treści w jednej linii', () => {
    expect(campaignFallbackName({ kind: 'sms', name: '', body: 'Przypomnienie:\n  jutro próba\tchóru' }, now)).toBe('Przypomnienie: jutro próba chóru');
  });

  it('SMS z długą treścią → ~40 znaków z wielokropkiem', () => {
    const name = campaignFallbackName({ kind: 'sms', body: 'a'.repeat(39) + ' ' + 'b'.repeat(30) }, now);
    expect(name).toBe('a'.repeat(39) + '…');
    expect(smsBodySnippet('x'.repeat(41))).toBe('x'.repeat(40) + '…');
  });

  it('bez nazwy, tytułu i treści → data', () => {
    expect(campaignFallbackName({ kind: 'push' }, now)).toBe('Kampania 20.10.2026 09:05');
    expect(campaignFallbackName({ kind: 'sms', body: '  \n ' }, now)).toBe('Kampania 20.10.2026 09:05');
    expect(campaignDateName(now)).toBe('Kampania 20.10.2026 09:05');
  });
});

describe('userLabel', () => {
  const map = buildUserNameMap([
    { email: 'Jan.Kowalski@Example.com', full_name: 'Jan Kowalski' },
    { email: 'ola@example.com', full_name: '', name: 'Ola' },
    { email: 'bez@example.com' },
  ]);

  it('dopasowanie bez względu na wielkość liter', () => {
    expect(userLabel('jan.kowalski@example.com', map)).toBe('Jan Kowalski');
    expect(userLabel('OLA@example.com', map)).toBe('Ola');
  });

  it('brak w mapie → część przed @, pusty → ""', () => {
    expect(userLabel('bez@example.com', map)).toBe('bez');
    expect(userLabel('nowy@example.com', {})).toBe('nowy');
    expect(userLabel(null, map)).toBe('');
  });
});
