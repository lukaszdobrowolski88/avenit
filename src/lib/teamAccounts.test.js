// Oznaczenie osób ze składu Tłumaczeń bez konta w aplikacji (shared/lib/teamAccounts.js) i link
// „Zaproś do aplikacji” → Ustawienia → Użytkownicy z wypełnionym formularzem (settingsLogic).
import { describe, it, expect } from 'vitest';
import { accountsById, accountBadge, canInvite, ACCOUNT_BADGES } from '@avenit/shared/src/lib/teamAccounts.js';
import { inviteUserPath, invitePrefill } from '../modules/Settings/components/settingsLogic';
import { TRANSLATIONS as translations } from '../i18n/translations';

describe('konta składu Tłumaczeń', () => {
  it('mapa z odpowiedzi fn: tylko znane stany, niedostępne = pusto', () => {
    const m = accountsById({ available: true, members: [{ id: 1, account: 'none' }, { id: '2', account: 'active' }, { id: 3, account: 'cokolwiek' }, { account: 'none' }] });
    expect([...m]).toEqual([['1', 'none'], ['2', 'active']]);
    expect(accountsById({ available: false, members: [{ id: 1, account: 'none' }] }).size).toBe(0);
    expect(accountsById(null).size).toBe(0);
  });

  it('oznaczenie: brak konta / konto nieaktywne; bez oznaczenia dla aktywnych kont, nieznanych i nieaktywnych w zespole', () => {
    expect(accountBadge('none')).toMatchObject({ kind: 'none', label: 'Brak konta w aplikacji' });
    expect(accountBadge('inactive')).toMatchObject({ kind: 'inactive', label: 'Konto nieaktywne' });
    expect(accountBadge('none').hint).toMatch(/nie może tłumaczyć na żywo/);
    expect(accountBadge('active')).toBeNull();
    expect(accountBadge(undefined)).toBeNull();
    expect(accountBadge('none', { active: false })).toBeNull();
  });

  it('„Zaproś do aplikacji”: tylko brak konta, poprawny e-mail i prawo zakładania kont', () => {
    const none = accountBadge('none');
    expect(canInvite(none, 'ola@x.pl', true)).toBe(true);
    expect(canInvite(none, 'ola@x.pl', false)).toBe(false);
    expect(canInvite(none, '', true)).toBe(false);
    expect(canInvite(none, 'bez-malpy', true)).toBe(false);
    expect(canInvite(accountBadge('inactive'), 'ola@x.pl', true)).toBe(false);
  });

  it('link do Ustawień i odczyt formularza (służba tylko z dozwolonych)', () => {
    const path = inviteUserPath({ name: ' Ola Nowak ', email: 'ola@x.pl', team: 'tlumaczenia' });
    expect(path.startsWith('/settings?')).toBe(true);
    const params = new URLSearchParams(path.split('?')[1]);
    expect(params.get('tab')).toBe('users');
    expect(invitePrefill(params, ['tlumaczenia'])).toEqual({ full_name: 'Ola Nowak', email: 'ola@x.pl', team: 'tlumaczenia' });
    expect(invitePrefill(params, ['media']).team).toBeNull();
    expect(invitePrefill(new URLSearchParams('tab=users'), ['tlumaczenia'])).toBeNull();
  });

  it('teksty mają tłumaczenia EN i UK', () => {
    for (const b of Object.values(ACCOUNT_BADGES)) {
      for (const lang of ['en', 'uk']) {
        expect(translations[lang][b.label]).toBeTruthy();
        expect(translations[lang][b.hint]).toBeTruthy();
      }
    }
    expect(translations.en['Zaproś do aplikacji']).toBeTruthy();
    expect(translations.uk['Zaproś do aplikacji']).toBeTruthy();
  });
});
