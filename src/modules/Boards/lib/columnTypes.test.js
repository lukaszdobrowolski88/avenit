import { describe, it, expect } from 'vitest';
import { cellToText, formatDuration, isOverdue, isItemDone, localDateKey, dueDateOf } from './columnTypes';

const status = { type: 'status', settings: { labels: [{ id: 'done', title: 'Gotowe', color: '#0c8' }] } };
const people = { type: 'people' };
const timeline = { type: 'timeline' };
const link = { type: 'link' };
const rating = { type: 'rating' };

describe('cellToText', () => {
  it('zwraca pusty string dla null/undefined (każdy typ)', () => {
    for (const col of [status, people, timeline, link, rating, { type: 'number' }, { type: 'date' }]) {
      expect(cellToText(col, null)).toBe('');
      expect(cellToText(col, undefined)).toBe('');
    }
  });

  it('status → tytuł etykiety', () => {
    expect(cellToText(status, 'done')).toBe('Gotowe');
    expect(cellToText(status, 'nieznane')).toBe('');
  });

  it('people → nazwy po przecinku', () => {
    expect(cellToText(people, [{ name: 'Jan' }, { email: 'a@b.pl' }])).toBe('Jan, a@b.pl');
  });

  it('timeline/link nie crashują i formatują poprawnie', () => {
    expect(cellToText(timeline, { start: '2026-01-01', end: '2026-01-05' })).toBe('01.01 – 05.01.2026');
    expect(cellToText(link, { text: 'Avenit', url: 'https://x' })).toBe('Avenit');
  });

  it('rating NIE crashuje na wartości ujemnej/zepsutej (regresja: .repeat(-1))', () => {
    expect(() => cellToText(rating, -3)).not.toThrow();
    expect(() => cellToText(rating, 1e9)).not.toThrow();
    expect(cellToText(rating, 3)).toBe('★★★');
    expect(cellToText(rating, 0)).toBe('');
  });

  it('formatDuration', () => {
    expect(formatDuration(0)).toBe('0:00:00');
    expect(formatDuration(3661)).toBe('1:01:01');
    expect(formatDuration(-5)).toBe('0:00:00');
  });
});

describe('zakończenie i termin (isItemDone / isOverdue)', () => {
  const st = { id: 's', type: 'status', settings: { labels: [
    { id: 'todo', title: 'Do zrobienia' },
    { id: 'ok', title: 'Zamknięte', done: true },      // jawna flaga z edytora etykiet
    { id: 'gotowe', title: 'Gotowe', done: false },     // nazwa „gotowe”, ale jawnie NIE zakończenie
    { id: 'done', title: 'Gotowe' },                    // stara tablica — po nazwie
  ] } };
  const cols = [st, { id: 'd', type: 'date' }];
  const item = (s) => ({ id: 'x', cells: { s } });

  it('flaga done ma pierwszeństwo przed nazwą', () => {
    expect(isItemDone(item('ok'), cols)).toBe(true);
    expect(isItemDone(item('gotowe'), cols)).toBe(false);
    expect(isItemDone(item('done'), cols)).toBe(true);
    expect(isItemDone(item('todo'), cols)).toBe(false);
  });

  it('po terminie: przed dziś (lokalnie) i nie zakończone', () => {
    const today = '2026-10-09';
    expect(isOverdue('2026-10-08', item('todo'), cols, today)).toBe(true);
    expect(isOverdue('2026-10-09', item('todo'), cols, today)).toBe(false);
    expect(isOverdue('2026-10-08', item('ok'), cols, today)).toBe(false);
    expect(isOverdue(null, item('todo'), cols, today)).toBe(false);
    // Oś czasu — liczy się koniec.
    expect(isOverdue({ start: '2026-10-01', end: '2026-10-10' }, item('todo'), cols, today)).toBe(false);
    expect(isOverdue({ start: '2026-10-01', end: '2026-10-05' }, item('todo'), cols, today)).toBe(true);
  });

  it('localDateKey to data lokalna, nie UTC', () => {
    expect(localDateKey(new Date(2026, 0, 2, 0, 30))).toBe('2026-01-02');
    expect(dueDateOf('2026-10-08T12:00:00Z')).toBe('2026-10-08');
  });
});
