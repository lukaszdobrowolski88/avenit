import { describe, it, expect } from 'vitest';
import { lineupOf, teamHistory, previousLineup, fillEmptyRoles, serviceStats, typicalCount, proposeLineups } from './lineup';

const ev = (id, date, worship, title = 'Nabożeństwo') => ({ id, date, title, assignments: { worship } });
const ROLES = ['lider', 'piano', 'wokale', 'cajon'];

describe('lineupOf / teamHistory', () => {
  it('bierze tylko role (bez notatek i nieobecności) i pomija puste', () => {
    expect(lineupOf({ lider: 'Ala', piano: '', notatki: 'x', absencja: 'Ola', wokale: 'Ewa, Jan' }, ROLES))
      .toEqual({ lider: ['Ala'], wokale: ['Ewa', 'Jan'] });
  });
  it('historia rosnąco, bez wydarzeń bez składu; data z ISO przycięta', () => {
    const h = teamHistory([
      ev('b', '2026-10-11T00:00:00.000Z', { lider: 'Ala' }),
      ev('a', '2026-10-04', { piano: 'Ola' }),
      ev('c', '2026-10-18', { notatki: 'tylko notatka' }),
    ], 'worship', ROLES);
    expect(h.map((x) => [x.eventId, x.date])).toEqual([['a', '2026-10-04'], ['b', '2026-10-11']]);
  });
});

describe('previousLineup', () => {
  const history = teamHistory([
    ev('1', '2026-09-27', { lider: 'Ala' }, 'Nabożeństwo niedzielne'),
    ev('2', '2026-10-01', { lider: 'Ola' }, 'Próba'),
    ev('3', '2026-10-25', { lider: 'Ewa' }, 'Nabożeństwo niedzielne'),
  ], 'worship', ROLES);
  it('preferuje najbliższe wcześniejsze o tym samym tytule', () => {
    expect(previousLineup(history, { id: 'x', date: '2026-10-18', title: 'Nabożeństwo niedzielne' }).eventId).toBe('1');
  });
  it('bez dopasowania tytułu — najbliższe wcześniejsze; nic z przyszłości', () => {
    expect(previousLineup(history, { id: 'x', date: '2026-10-18', title: 'Koncert' }).eventId).toBe('2');
    expect(previousLineup(history, { id: 'x', date: '2026-09-01', title: 'Koncert' })).toBeNull();
  });
});

describe('fillEmptyRoles', () => {
  it('wypełnia tylko puste role, pomija nieobecnych, spoza roli i spoza zespołu', () => {
    const { changes, skipped } = fillEmptyRoles(
      { lider: ['Ala'] },
      { lider: ['Ewa'], piano: ['Ola'], wokale: ['Jan', 'Ewa', 'Ewa'], cajon: ['Bartek'] },
      {
        blocked: new Map([['Jan', 'nieobecność']]),
        allowedFor: (k) => (k === 'piano' ? new Set(['Kasia']) : null),
        teamNames: new Set(['Ala', 'Ewa', 'Ola', 'Jan']),
      },
    );
    expect(changes).toEqual({ wokale: ['Ewa'] });
    expect(skipped).toEqual([
      { name: 'Ola', roleKey: 'piano', reason: 'role' },
      { name: 'Jan', roleKey: 'wokale', reason: 'absent' },
      { name: 'Bartek', roleKey: 'cajon', reason: 'gone' },
    ]);
  });
});

describe('serviceStats / typicalCount', () => {
  const history = teamHistory([
    ev('1', '2026-10-04', { lider: 'Ala', wokale: 'Ala, Ewa' }),
    ev('2', '2026-10-11', { lider: 'Ola', wokale: 'Ewa, Jan' }),
    ev('3', '2026-11-01', { lider: 'Ala', wokale: 'Ewa' }),
  ], 'worship', ROLES);
  const s = serviceStats(history);
  it('liczy wydarzenia w miesiącu (dwie role tego dnia = jedna służba)', () => {
    expect(s.monthCount('Ala', '2026-10')).toBe(1);
    expect(s.monthCount('Ewa', '2026-10')).toBe(2);
    expect(s.monthCount('Ewa', '2026-11')).toBe(1);
  });
  it('ostatnia służba przed datą i liczba w roli', () => {
    expect(s.lastBefore('Ala', '2026-10-31')).toBe('2026-10-04');
    expect(s.lastBefore('Ala', '2026-10-04')).toBe('');
    expect(s.roleCount('Ala', 'lider')).toBe(2);
  });
  it('typowa liczba osób w roli', () => {
    expect(typicalCount(history, 'wokale')).toBe(2);
    expect(typicalCount(history, 'cajon')).toBe(1);
  });
});

describe('proposeLineups', () => {
  const history = teamHistory([
    ev('1', '2026-09-06', { lider: 'Ala', cajon: 'Bartek' }),
    ev('2', '2026-09-13', { lider: 'Ola', cajon: 'Bartek' }),
    ev('3', '2026-09-20', { lider: 'Ala', cajon: 'Kuba' }),
  ], 'worship', ROLES);

  it('rotacja: kto dawno nie służył; rola bez przypisań → tylko osoby z historii tej roli', () => {
    const [p] = proposeLineups({
      targets: [{ id: 'x', date: '2026-10-04', lineup: {}, blocked: new Map() }],
      roles: [{ key: 'lider', candidates: null }, { key: 'cajon', candidates: null }, { key: 'piano', candidates: null }],
      history,
    });
    expect(p.picks.find((x) => x.roleKey === 'lider').names).toEqual(['Ola']); // Ala grała później (20.09)
    expect(p.picks.find((x) => x.roleKey === 'cajon').names).toEqual(['Bartek']); // Kuba ostatnio 20.09
    expect(p.missing).toEqual(['piano']); // nikt nigdy nie grał na pianinie — nie zgadujemy
  });

  it('pomija nieobecnych i osoby już obsadzone w tym wydarzeniu; nie rusza wypełnionych ról', () => {
    const [p] = proposeLineups({
      targets: [{ id: 'x', date: '2026-10-04', lineup: { cajon: ['Kuba'] }, blocked: new Map([['Ola', 'nieobecność']]) }],
      roles: [{ key: 'lider', candidates: ['Ala', 'Ola', 'Kuba'] }, { key: 'cajon', candidates: null }],
      history,
    });
    expect(p.picks).toHaveLength(1);
    expect(p.picks[0]).toMatchObject({ roleKey: 'lider', names: ['Ala'] });
  });

  it('cały miesiąc: obciążenie rozkłada się na kolejne niedziele', () => {
    const res = proposeLineups({
      targets: [
        { id: 'b', date: '2026-10-11', lineup: {}, blocked: new Map() },
        { id: 'a', date: '2026-10-04', lineup: {}, blocked: new Map() },
      ],
      roles: [{ key: 'lider', candidates: ['Ala', 'Ola'] }],
      history,
    });
    expect(res.map((r) => [r.eventId, r.picks[0].names[0]])).toEqual([['a', 'Ola'], ['b', 'Ala']]);
  });
});
