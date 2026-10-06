import { describe, it, expect } from 'vitest';
import {
  resolveSettingsTab, ssoOpenToAnyone, groupDuplicateMembers, mergeFill, describeUserAgent,
} from './settingsLogic';

describe('resolveSettingsTab (?tab=)', () => {
  it('zwraca znane zakładki bez zmian', () => {
    for (const t of ['general', 'appearance', 'campuses', 'users', 'permissions', 'security', 'modules', 'dictionaries', 'integrations', 'subscription']) {
      expect(resolveSettingsTab(t)).toBe(t);
    }
  });
  it('mapuje stare/ukryte zakładki', () => {
    expect(resolveSettingsTab('module_manager')).toBe('modules');
    expect(resolveSettingsTab('localization')).toBe('general');
    expect(resolveSettingsTab('notifications')).toBe('general');
  });
  it('brak lub nieznana wartość → Organizacja', () => {
    expect(resolveSettingsTab(null)).toBe('general');
    expect(resolveSettingsTab('')).toBe('general');
    expect(resolveSettingsTab('cokolwiek')).toBe('general');
  });
});

describe('ssoOpenToAnyone', () => {
  const getter = (m) => (k) => m[k];
  it('ostrzega, gdy auto-zakładanie bez domen i bez zatwierdzania', () => {
    expect(ssoOpenToAnyone(getter({ sso_google_enabled: 'on', sso_auto_provision: 'on' }))).toBe(true);
  });
  it('nie ostrzega, gdy są domeny albo zatwierdzanie', () => {
    expect(ssoOpenToAnyone(getter({ sso_google_enabled: 'on', sso_auto_provision: 'on', sso_allowed_domains: 'schwro.pl' }))).toBe(false);
    expect(ssoOpenToAnyone(getter({ sso_google_enabled: 'on', sso_auto_provision: 'on', sso_provision_approval: 'on' }))).toBe(false);
  });
  it('nie ostrzega, gdy SSO wyłączone lub auto-zakładanie wyłączone', () => {
    expect(ssoOpenToAnyone(getter({ sso_auto_provision: 'on' }))).toBe(false);
    expect(ssoOpenToAnyone(getter({ sso_microsoft_enabled: 'on', sso_auto_provision: 'off' }))).toBe(false);
  });
});

describe('groupDuplicateMembers', () => {
  it('grupuje po imieniu i nazwisku (bez wielkości liter i spacji)', () => {
    const g = groupDuplicateMembers([
      { id: 1, full_name: 'Jan Kowalski', email: 'jan@x.pl' },
      { id: 2, full_name: ' jan  kowalski ', email: '' },
      { id: 3, full_name: 'Anna Nowak' },
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].members.map((m) => m.id)).toEqual([1, 2]);
    expect(g[0].primary.id).toBe(1);
    expect(g[0].duplicates.map((m) => m.id)).toEqual([2]);
    expect(g[0].conflict).toBe(false);
  });
  it('różne e-maile → konflikt (to mogą być dwie osoby)', () => {
    const [g] = groupDuplicateMembers([
      { id: 1, full_name: 'Jan Kowalski', email: 'jan1@x.pl' },
      { id: 2, full_name: 'Jan Kowalski', email: 'jan2@x.pl' },
    ]);
    expect(g.conflict).toBe(true);
  });
  it('różne telefony → konflikt; ten sam numer w innym zapisie → brak konfliktu', () => {
    expect(groupDuplicateMembers([
      { id: 1, full_name: 'A B', phone: '600 100 200' },
      { id: 2, full_name: 'A B', phone: '700100200' },
    ])[0].conflict).toBe(true);
    expect(groupDuplicateMembers([
      { id: 1, full_name: 'A B', phone: '+48 600 100 200' },
      { id: 2, full_name: 'A B', phone: '600-100-200' },
    ])[0].conflict).toBe(false);
  });
  it('różne grupy → konflikt', () => {
    expect(groupDuplicateMembers([
      { id: 1, full_name: 'A B', group_id: 1 },
      { id: 2, full_name: 'A B', group_id: 2 },
    ])[0].conflict).toBe(true);
  });
});

describe('mergeFill', () => {
  it('uzupełnia tylko puste pola rekordu głównego', () => {
    expect(mergeFill({ id: 1, email: 'a@x.pl', phone: '', status: 'Aktywny' }, [{ email: 'b@x.pl', phone: '123', status: 'Nieaktywny' }]))
      .toEqual({ phone: '123' });
  });
  it('domyślny status „Aktywny”, gdy nikt go nie ma', () => {
    expect(mergeFill({ id: 1 }, [{}])).toEqual({ status: 'Aktywny' });
  });
});

describe('describeUserAgent', () => {
  it('iPhone + Safari', () => {
    expect(describeUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'))
      .toEqual({ device: 'iPhone', browser: 'Safari', app: false });
  });
  it('Mac + Chrome', () => {
    expect(describeUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'))
      .toMatchObject({ device: 'Mac', browser: 'Chrome' });
  });
  it('aplikacja mobilna (CFNetwork)', () => {
    expect(describeUserAgent('Avenitdev/1 CFNetwork/3860.100.1 Darwin/25.0.0')).toMatchObject({ app: true, device: 'iPhone' });
  });
  it('pusty → null', () => {
    expect(describeUserAgent('')).toBeNull();
  });
});
