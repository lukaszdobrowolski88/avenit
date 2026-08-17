import { describe, it, expect } from 'vitest';
import { cellToText, formatDuration } from './columnTypes';

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
    expect(cellToText(timeline, { start: '2026-01-01', end: '2026-01-05' })).toBe('2026-01-01 → 2026-01-05');
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
