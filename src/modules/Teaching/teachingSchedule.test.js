import { describe, it, expect } from 'vitest';
import { isTeachingEvent, buildTeachingRows, teachingOps, seriesSermons, plural, pickTeaching } from './teachingSchedule';

// UXE-06 / UXB-10 / UXB-06: grafik kazań nad wydarzeniami + serie połączone z kazaniami.
describe('isTeachingEvent', () => {
  it('nabożeństwo z kalendarza ogólnego (tytuł / typ) jest wierszem grafiku', () => {
    expect(isTeachingEvent({ title: 'Nabożeństwo niedzielne', date: '2026-10-18' })).toBe(true);
    expect(isTeachingEvent({ title: '🎵 Nabożeństwo', date: '2026-10-04' })).toBe(true);
    expect(isTeachingEvent({ title: 'Niedziela', event_type: 'nabożeństwo' })).toBe(true);
  });
  it('zwykłe spotkanie i próba „przed nabożeństwem” nie są wierszem', () => {
    expect(isTeachingEvent({ title: 'Spotkanie liderów', event_type: 'spotkanie' })).toBe(false);
    expect(isTeachingEvent({ title: 'Próba przed nabożeństwem', module_key: 'worship', event_type: 'proba' })).toBe(false);
  });
  it('podpięty program, reguła typu lub team_types z „teaching” włączają wydarzenie', () => {
    expect(isTeachingEvent({ title: 'Niedziela', program_id: 5 })).toBe(true);
    expect(isTeachingEvent({ title: 'X', module_key: null, event_type: 'msza' }, [{ module_key: '', event_type: 'msza', teams: ['worship', 'teaching'] }])).toBe(true);
    expect(isTeachingEvent({ title: 'X', team_types: 'media, teaching' })).toBe(true);
  });
  it('wydarzenie z już wpisanym kazaniem zawsze zostaje (nie gubimy danych)', () => {
    expect(isTeachingEvent({ title: 'Inne', assignments: { teaching: { title: 'Łaska' } } })).toBe(true);
    expect(isTeachingEvent({ title: 'Inne', assignments: { teaching: { title: '  ' } } })).toBe(false);
  });
});

describe('buildTeachingRows', () => {
  const events = [
    { id: 2, title: 'Nabożeństwo', date: '2026-10-18T00:00:00.000Z', time: '10:00:00', assignments: { teaching: { title: 'Nowe', speaker_id: 's1' }, worship: { lider: 'Ania' } } },
    { id: 1, title: 'Nabożeństwo', date: '2026-10-11', program_id: 77, assignments: {} },
    { id: 3, title: 'Spotkanie', date: '2026-10-12' },
    { id: 4, title: 'Nabożeństwo bez daty' },
  ];
  const programs = [{ id: 77, date: '2026-10-11', teaching: { title: 'Stary tytuł', series_id: 9 } }];
  const rows = buildTeachingRows(events, [], programs);

  it('tylko nabożeństwa z datą, posortowane rosnąco, data jako YYYY-MM-DD', () => {
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
    expect(rows[1].date).toBe('2026-10-18');
    expect(rows[1].time).toBe('10:00');
  });
  it('dane kazania z wydarzenia; w braku — z podpiętego programu (oznaczone jako stare)', () => {
    expect(rows[1].teaching).toEqual({ title: 'Nowe', speaker_id: 's1' });
    expect(rows[1].legacyFromProgram).toBe(false);
    expect(rows[0].teaching).toEqual({ title: 'Stary tytuł', series_id: 9 });
    expect(rows[0].legacyFromProgram).toBe(true);
  });
});

describe('teachingOps', () => {
  it('zwykły wiersz: jedna zmiana, pusta wartość = usunięcie pola', () => {
    expect(teachingOps({ teaching: {} }, 'title', 'Łaska')).toEqual([{ team: 'teaching', key: 'title', value: 'Łaska' }]);
    expect(teachingOps({ teaching: { title: 'x' } }, 'title', '')).toEqual([{ team: 'teaching', key: 'title', value: null }]);
  });
  it('wiersz z danymi starego programu: pierwsza edycja przenosi wszystkie pola na wydarzenie', () => {
    const ops = teachingOps({ legacyFromProgram: true, teaching: { title: 'Stary', series_id: 9 } }, 'title', 'Nowy');
    expect(ops).toEqual([
      { team: 'teaching', key: 'series_id', value: 9 },
      { team: 'teaching', key: 'title', value: 'Nowy' },
    ]);
  });
});

describe('seriesSermons', () => {
  const series = { id: 9, name: 'Fundamenty wiary' };
  const rows = [
    { id: 1, date: '2026-10-11', program_id: 77, teaching: { series_id: 9, title: 'Z grafiku', speaker_id: 's1' } },
    { id: 2, date: '2026-10-18', teaching: { series_id: 8, title: 'Inna seria' } },
  ];
  const programs = [
    { id: 77, date: '2026-10-11', teaching: { series_id: 9, title: 'Duplikat programu' } }, // podpięty — pomijany
    { id: 50, date: '2026-01-04', teaching: { series_id: '9', title: 'Stary program' } },
  ];
  const sermons = [
    { id: 'a', title: 'Z biblioteki', series: ' fundamenty WIARY ', sermon_date: '2026-10-25', is_published: true },
    { id: 'b', title: 'Nagranie z grafiku', series: 'Fundamenty wiary', sermon_date: '2026-10-11' },
    { id: 'c', title: 'Inna', series: 'Inna seria', sermon_date: '2026-10-25' },
  ];
  const speakers = [{ id: 's1', name: 'Jan Kowalski' }];
  const list = seriesSermons(series, { rows, programs, sermons, speakers });

  it('łączy grafik, stare programy i bibliotekę „Kazania” (po nazwie serii, bez wielkości liter)', () => {
    expect(list.map((x) => x.date)).toEqual(['2026-01-04', '2026-10-11', '2026-10-25']);
  });
  it('ten sam dzień = jedno kazanie (scalone źródła, mówca z listy mówców)', () => {
    const oct11 = list.find((x) => x.date === '2026-10-11');
    expect(oct11.title).toBe('Z grafiku');
    expect(oct11.speaker).toBe('Jan Kowalski');
    expect(oct11.sources.sort()).toEqual(['library', 'schedule']);
  });
  it('dodanie kazania do serii w „Kazaniach” zwiększa liczbę kazań serii', () => {
    const before = seriesSermons(series, { sermons: [] }).length;
    const after = seriesSermons(series, { sermons: [{ id: 'z', title: 'Nowe', series: 'Fundamenty wiary', sermon_date: '2026-11-01' }] }).length;
    expect(before).toBe(0);
    expect(after).toBe(1);
  });
});

describe('plural / pickTeaching', () => {
  it('poprawna odmiana: 0 kazań, 1 kazanie, 3 kazania, 12 kazań, 22 kazania', () => {
    const f = (n) => plural(n, 'kazanie', 'kazania', 'kazań');
    expect([0, 1, 3, 12, 22, 25].map(f)).toEqual(['kazań', 'kazanie', 'kazania', 'kazań', 'kazania', 'kazań']);
  });
  it('pickTeaching czyta też JSON jako tekst i pomija puste pola', () => {
    expect(pickTeaching('{"title":"A","notes":""}')).toEqual({ title: 'A' });
    expect(pickTeaching(null)).toEqual({});
  });
});
