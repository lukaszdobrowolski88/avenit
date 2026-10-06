import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: { from: () => ({}) } }));

const { validateNewEvent } = await import('./EventsModule');
const { sortEvents, eventTypeLabel, plural } = await import('./EventsListView');

// UXA-12 / FUNC-09: wydarzenie musi mieć tytuł i datę, a koniec musi być po początku.
describe('validateNewEvent', () => {
  it('wymaga tytułu i daty', () => {
    const e = validateNewEvent({ title: '  ', date: '' });
    expect(Object.keys(e).sort()).toEqual(['date', 'title']);
  });
  it('odrzuca koniec przed początkiem („test 03:00–01:00”)', () => {
    expect(validateNewEvent({ title: 'Test', date: '2026-10-11', time: '03:00', end_time: '01:00' }).end_time).toBeTruthy();
  });
  it('poprawne wydarzenie nie ma błędów', () => {
    expect(validateNewEvent({ title: 'Nabożeństwo', date: '2026-10-11', time: '10:00', end_time: '12:00' })).toEqual({});
  });
});

describe('sortEvents', () => {
  const list = [
    { id: 1, date: '2026-10-18' },
    { id: 2, date: null },
    { id: 3, date: '2026-10-11', time: '18:00' },
    { id: 4, date: '2026-10-11', time: '10:00' },
  ];
  it('aktualne: rosnąco, wydarzenia bez daty na końcu (nie na górze)', () => {
    expect(sortEvents(list, 'current').map((e) => e.id)).toEqual([4, 3, 1, 2]);
  });
  it('archiwum: malejąco, bez daty dalej na końcu', () => {
    expect(sortEvents(list, 'archive').map((e) => e.id)).toEqual([1, 4, 3, 2]);
  });
});

// UXA-11: na kartach etykieta typu, nie surowa wartość z bazy.
describe('eventTypeLabel', () => {
  it('etykieta z konfiguracji, potem domyślna, potem wielka litera', () => {
    expect(eventTypeLabel('x1', [{ value: 'x1', label: 'Próba zespołu' }])).toBe('Próba zespołu');
    expect(eventTypeLabel('inne')).toBe('Inne');
    expect(eventTypeLabel('wydarzenie')).toBe('Wydarzenie');
    expect(eventTypeLabel('warsztat')).toBe('Warsztat');
    expect(eventTypeLabel('')).toBe('');
  });
});

describe('plural', () => {
  it('1 wydarzenie, 3 wydarzenia, 5 wydarzeń', () => {
    expect([1, 3, 5, 13, 23].map((n) => plural(n, 'a', 'b', 'c'))).toEqual(['a', 'b', 'c', 'c', 'b']);
  });
});
