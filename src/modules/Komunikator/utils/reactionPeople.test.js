import { describe, it, expect } from 'vitest';
import { reactionPeople, formatReactorNames, reactionTabs, fallbackName } from '@avenit/shared/src/lib/reactionPeople.js';

const NAMES = {
  'olaf@x.pl': 'Olaf Karel',
  'mateusz@x.pl': 'Mateusz Waciński',
  'ja@x.pl': 'Łukasz Dobrowolski',
};
const nameOf = (e) => NAMES[String(e).toLowerCase()] || null;

describe('reactionPeople', () => {
  it('stawia mnie na początku, usuwa powtórzenia i rozwiązuje imiona', () => {
    const out = reactionPeople(['olaf@x.pl', 'JA@x.pl', 'Olaf@X.pl', 'mateusz@x.pl'], { me: 'ja@x.pl', nameOf });
    expect(out.map((p) => [p.name, p.me])).toEqual([
      ['Łukasz Dobrowolski', true],
      ['Olaf Karel', false],
      ['Mateusz Waciński', false],
    ]);
  });

  it('bez imienia pokazuje tylko część adresu przed „@”, nigdy cały e-mail', () => {
    const out = reactionPeople(['anna.nowak@poczta.pl'], { nameOf: (e) => e });
    expect(out[0].name).toBe('anna.nowak');
    expect(fallbackName('')).toBe('?');
  });
});

describe('formatReactorNames', () => {
  const people = (n, me = false) => [
    ...(me ? [{ name: 'Ja', me: true }] : []),
    ...Array.from({ length: n }, (_, i) => ({ name: `Osoba ${i + 1}`, me: false })),
  ];

  it('jedna osoba / „Ty”', () => {
    expect(formatReactorNames([{ name: 'Ja', me: true }])).toBe('Ty');
    expect(formatReactorNames([{ name: 'Olaf Karel' }])).toBe('Olaf Karel');
    expect(formatReactorNames([])).toBe('');
  });

  it('łączy przecinkami i „i” przed ostatnim', () => {
    expect(formatReactorNames([{ name: 'Ja', me: true }, { name: 'Olaf Karel' }, { name: 'Mateusz Waciński' }]))
      .toBe('Ty, Olaf Karel i Mateusz Waciński');
    expect(formatReactorNames(people(2))).toBe('Osoba 1 i Osoba 2');
  });

  it('powyżej limitu: „i N innych”, ale nigdy „i 1 innych”', () => {
    expect(formatReactorNames(people(11))).toBe('Osoba 1, Osoba 2, Osoba 3, Osoba 4, Osoba 5, Osoba 6, Osoba 7, Osoba 8, Osoba 9, Osoba 10 i Osoba 11');
    expect(formatReactorNames(people(12))).toBe('Osoba 1, Osoba 2, Osoba 3, Osoba 4, Osoba 5, Osoba 6, Osoba 7, Osoba 8, Osoba 9, Osoba 10 i 2 innych');
    expect(formatReactorNames(people(5, true), { max: 2 })).toBe('Ty, Osoba 1 i 4 innych');
  });

  it('teksty z tłumaczenia', () => {
    expect(formatReactorNames(people(4, true), { max: 2, meLabel: 'You', and: 'and', others: (n) => `${n} others` }))
      .toBe('You, Osoba 1 and 3 others');
  });
});

describe('reactionTabs', () => {
  it('sortuje emoji po liczbie osób, liczy razem i pomija puste', () => {
    const { tabs, total } = reactionTabs([
      { emoji: '❤️', users: ['olaf@x.pl'] },
      { emoji: '👍', users: ['olaf@x.pl', 'ja@x.pl'] },
      { emoji: '😮', users: [] },
      { emoji: '🙏', users: ['mateusz@x.pl'] },
    ], { me: 'ja@x.pl', nameOf });
    expect(tabs.map((t) => t.emoji)).toEqual(['👍', '❤️', '🙏']);
    expect(tabs[0].people.map((p) => p.me)).toEqual([true, false]);
    expect(total).toBe(4);
  });
});
