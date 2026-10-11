import { describe, it, expect } from 'vitest';
import { eventEnd, isEventOver, localYmd } from './eventTime';

const at = (s) => new Date(s); // czas lokalny

describe('isEventOver', () => {
  it('nabożeństwo 11:00 bez godziny końca: trwa do 13:00, wieczorem już przeszłe', () => {
    const ev = { date: '2026-10-11', time: '11:00' };
    expect(isEventOver(ev, at('2026-10-11T10:00'))).toBe(false);
    expect(isEventOver(ev, at('2026-10-11T12:30'))).toBe(false);
    expect(isEventOver(ev, at('2026-10-11T20:00'))).toBe(true);
  });
  it('godzina końca wygrywa; data z API w formacie ISO też działa', () => {
    const ev = { date: '2026-10-11T00:00:00.000Z', time: '18:00', end_time: '21:30' };
    expect(isEventOver(ev, at('2026-10-11T21:00'))).toBe(false);
    expect(isEventOver(ev, at('2026-10-11T21:31'))).toBe(true);
  });
  it('całodniowe i wielodniowe — do końca ostatniego dnia', () => {
    expect(isEventOver({ date: '2026-10-11' }, at('2026-10-11T23:00'))).toBe(false);
    expect(isEventOver({ date: '2026-10-11' }, at('2026-10-12T00:01'))).toBe(true);
    const trip = { date: '2026-10-17', time: '09:00', end_date: '2026-10-18' };
    expect(isEventOver(trip, at('2026-10-18T15:00'))).toBe(false);
    expect(eventEnd(trip).getDate()).toBe(18);
  });
  it('brak daty → nie przeszłe; localYmd lokalnie', () => {
    expect(isEventOver({}, new Date())).toBe(false);
    expect(localYmd(new Date(2026, 0, 5, 0, 30))).toBe('2026-01-05');
  });
});
