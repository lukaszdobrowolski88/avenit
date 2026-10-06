import { describe, it, expect } from 'vitest';
import {
  rowMatchesPerson, memberGroupIds, memberGroupLinks, planMembershipSync, groupLeaders,
  leaderMissingFromGroup, personCandidates, findDuplicateGroup, normalizeWeekday, inPoland,
  nominatimSearchUrl, isOutlier, medianPoint, viewboxAround, plural,
} from './homeGroupUtils';

const groups = [{ id: 'g1', name: 'Grupa Zachód' }, { id: 'g2', name: 'Grupa u Grzegorza' }, { id: 'g3', name: 'Leśnica' }];

describe('rozpoznawanie osoby w home_group_members', () => {
  it('wiersz z e-mailem pasuje tylko po e-mailu (bez wielkości liter)', () => {
    expect(rowMatchesPerson({ email: 'Ania@x.pl', full_name: 'Inna' }, { email: 'ania@X.pl', first_name: 'Anna', last_name: 'K' })).toBe(true);
    expect(rowMatchesPerson({ email: 'ania@x.pl', full_name: 'Anna K' }, { email: '', first_name: 'Anna', last_name: 'K' })).toBe(false);
  });
  it('wiersz bez e-maila pasuje po imieniu i nazwisku', () => {
    expect(rowMatchesPerson({ email: null, full_name: ' Jan  Kowalski ' }, { first_name: 'jan', last_name: 'kowalski' })).toBe(true);
    expect(rowMatchesPerson({ email: null, full_name: 'Jan Nowak' }, { first_name: 'Jan', last_name: 'Kowalski' })).toBe(false);
  });
});

describe('grupy osoby — oba źródła', () => {
  const rows = [
    { id: 'r1', group_id: 'g2', email: 'ola@x.pl', full_name: 'Ola', role: 'leader' },
    { id: 'r2', group_id: 'g3', email: null, full_name: 'Ola Nowak', role: 'member' },
    { id: 'r3', group_id: 'g1', email: 'ktos@x.pl', full_name: 'Ktoś' },
  ];
  it('łączy home_group_id z członkostwami (e-mail i imię), bez duplikatów', () => {
    const m = { first_name: 'Ola', last_name: 'Nowak', email: 'ola@x.pl', home_group_id: 'g2' };
    expect(memberGroupIds(m, rows)).toEqual(['g2', 'g3']);
  });
  it('osoba dopisana tylko w module Grupy domowe też ma grupę na liście członków', () => {
    const m = { first_name: 'Ktoś', last_name: '', email: 'KTOS@x.pl', home_group_id: null };
    expect(memberGroupIds(m, rows)).toEqual(['g1']);
  });
  it('linki z rolą lidera', () => {
    const m = { first_name: 'Ola', last_name: 'Nowak', email: 'ola@x.pl' };
    expect(memberGroupLinks(m, rows, groups)).toEqual([
      { id: 'g2', name: 'Grupa u Grzegorza', role: 'leader' },
      { id: 'g3', name: 'Leśnica', role: 'member' },
    ]);
  });
});

describe('planMembershipSync', () => {
  it('osoba bez e-maila może należeć do kilku grup (nic nie ginie po cichu)', () => {
    const plan = planMembershipSync({ rows: [], person: { first_name: 'Zosia', last_name: 'Mała', email: null }, wantIds: ['g1', 'g2'] });
    expect(plan.inserts).toEqual(['g1', 'g2']);
    expect(plan.deletes).toEqual([]);
  });
  it('odznaczenie grupy usuwa tylko ten wiersz, zmiana e-maila aktualizuje pozostałe', () => {
    const rows = [
      { id: 'a', group_id: 'g1', email: 'stary@x.pl', full_name: 'Jan K' },
      { id: 'b', group_id: 'g2', email: 'stary@x.pl', full_name: 'Jan K' },
      { id: 'c', group_id: 'g1', email: 'inny@x.pl', full_name: 'Inny' },
    ];
    const plan = planMembershipSync({
      rows,
      person: { first_name: 'Jan', last_name: 'K', email: 'nowy@x.pl' },
      prev: { first_name: 'Jan', last_name: 'K', email: 'stary@x.pl' },
      wantIds: ['g2', 'g3'],
    });
    expect(plan.deletes).toEqual(['a']);
    expect(plan.updates).toEqual([{ id: 'b', patch: { email: 'nowy@x.pl' } }]);
    expect(plan.inserts).toEqual(['g3']);
  });
  it('duplikaty wierszy tej samej grupy są sprzątane', () => {
    const rows = [
      { id: 'a', group_id: 'g1', email: null, full_name: 'Ala Kot' },
      { id: 'b', group_id: 'g1', email: null, full_name: 'ala kot' },
    ];
    const plan = planMembershipSync({ rows, person: { full_name: 'Ala Kot' }, wantIds: ['g1'] });
    expect(plan.deletes).toEqual(['b']);
  });
});

describe('lider grupy', () => {
  const leaders = [{ id: 'L1', full_name: 'Grzegorz Suchy', email: 'g@x.pl' }];
  const g = { id: 'g2', name: 'Grupa u Grzegorza', leader_id: 'L1' };
  it('bez wiersza lidera w grupie bierze katalog liderów i zgłasza brak członkostwa', () => {
    expect(groupLeaders(g, [], leaders)).toEqual([leaders[0]]);
    expect(leaderMissingFromGroup(g, [], leaders)).toEqual(leaders[0]);
  });
  it('lider jako członek z rolą leader', () => {
    const rows = [{ id: 'r', group_id: 'g2', email: 'G@x.pl', full_name: 'Grzegorz Suchy', role: 'leader' }];
    expect(groupLeaders(g, rows, leaders)).toEqual(rows);
    expect(leaderMissingFromGroup(g, rows, leaders)).toBeNull();
  });
});

it('kandydaci bez duplikatów, posortowani', () => {
  const list = personCandidates({
    people: [{ first_name: 'Ola', last_name: 'Nowak', email: 'ola@x.pl' }],
    rows: [{ full_name: 'Ola', email: 'OLA@x.pl', phone: '123' }, { full_name: 'Bartek', email: null }],
    leaders: [{ full_name: 'Bartek', email: null }],
  });
  expect(list.map((p) => p.full_name)).toEqual(['Bartek', 'Ola Nowak']);
  expect(list[1].phone).toBe('123');
});

it('duplikat nazwy grupy', () => {
  expect(findDuplicateGroup('  grupa  zachód', groups)?.id).toBe('g1');
  expect(findDuplicateGroup('Grupa Zachód', groups, 'g1')).toBeNull();
  expect(findDuplicateGroup('', groups)).toBeNull();
});

it('dzień spotkania z wolnego tekstu', () => {
  expect(normalizeWeekday('piątek')).toBe('Piątek');
  expect(normalizeWeekday('Pt.')).toBe('Piątek');
  expect(normalizeWeekday('co środę')).toBe('Środa');
  expect(normalizeWeekday('Sroda')).toBe('Środa');
  expect(normalizeWeekday('niedziela')).toBe('Niedziela');
  expect(normalizeWeekday('co dwa tygodnie')).toBeNull();
});

describe('geokodowanie', () => {
  it('zawęża do Polski i podpowiada okolicę', () => {
    const url = nominatimSearchUrl('Leśnica', { viewbox: viewboxAround({ lat: 51.1, lon: 17.03 }) });
    expect(url).toContain('countrycodes=pl');
    expect(url).toContain('viewbox=');
    expect(url).toContain('q=Le%C5%9Bnica');
  });
  it('odrzuca punkty spoza Polski i odstające', () => {
    expect(inPoland(51.1, 17.0)).toBe(true);
    expect(inPoland(36.7, -119.4)).toBe(false); // Kalifornia
    const wro = [{ lat: 51.11, lon: 17.03 }, { lat: 51.14, lon: 16.9 }, { lat: 51.08, lon: 17.1 }];
    expect(isOutlier({ lat: 54.35, lon: 18.65 }, wro)).toBe(true); // Gdańsk
    expect(isOutlier({ lat: 51.12, lon: 17.0 }, wro)).toBe(false);
    expect(medianPoint(wro)).toEqual({ lat: 51.11, lon: 17.03 });
  });
});

it('odmiana liczebników', () => {
  const f = (n) => plural(n, 'grupa', 'grupy', 'grup');
  expect([0, 1, 2, 4, 5, 12, 22, 25].map(f)).toEqual(['grup', 'grupa', 'grupy', 'grupy', 'grup', 'grup', 'grupy', 'grup']);
});
