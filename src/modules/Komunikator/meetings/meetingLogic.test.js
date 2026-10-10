import { describe, it, expect } from 'vitest';
import {
  toStartsAt, defaultSlot, formFromMeeting, parseGuestInput, meetingPayload, validateForm, meetingPhase, responseCounts,
} from './meetingLogic';

describe('spotkania — logika klienta', () => {
  it('data i godzina z formularza (czas lokalny) → ISO; niepełne → null', () => {
    const iso = toStartsAt('2026-10-12', '18:30');
    const d = new Date(iso);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 9, 12, 18, 30]);
    expect(toStartsAt('2026-10-12', '')).toBeNull();
    expect(toStartsAt('', '18:00')).toBeNull();
  });

  it('domyślny termin: najbliższe pełne pół godziny, co najmniej 30 min naprzód', () => {
    expect(defaultSlot(new Date(2026, 9, 10, 10, 5))).toEqual({ date: '2026-10-10', time: '11:00' });
    expect(defaultSlot(new Date(2026, 9, 10, 10, 50))).toEqual({ date: '2026-10-10', time: '11:30' });
    expect(defaultSlot(new Date(2026, 9, 10, 23, 40))).toEqual({ date: '2026-10-11', time: '00:30' });
  });

  it('spotkanie → formularz edycji', () => {
    const starts = new Date(2026, 9, 12, 18, 0).toISOString();
    const ends = new Date(2026, 9, 12, 19, 30).toISOString();
    expect(formFromMeeting({ title: 'Rada', description: null, starts_at: starts, ends_at: ends, kind: 'audio', guests_auto_admit: true }))
      .toEqual({ title: 'Rada', description: '', date: '2026-10-12', time: '18:00', duration: 90, kind: 'audio', guestsAutoAdmit: true });
  });

  it('wklejone adresy gości: przecinki, średniki, „Imię <adres>”, bez powtórzeń; błędne osobno', () => {
    expect(parseGuestInput('Anna@Mail.pl, jan@w.pl; Jan Nowak <jan@w.pl>  x@y')).toEqual({ emails: ['anna@mail.pl', 'jan@w.pl'], invalid: ['x@y'] });
    expect(parseGuestInput('')).toEqual({ emails: [], invalid: [] });
  });

  it('ciało zapytania i walidacja formularza', () => {
    const form = { title: ' Rada ', description: '', date: '2026-10-12', time: '18:00', duration: 45, kind: 'video', guestsAutoAdmit: false };
    const body = meetingPayload(form, { members: [{ email: 'ola@x.pl' }], guests: [{ email: 'g@y.pl', name: null }] });
    expect(body).toMatchObject({ title: 'Rada', duration_min: 45, kind: 'video', guests_auto_admit: false, members: ['ola@x.pl'], guests: [{ email: 'g@y.pl' }] });
    expect(body.starts_at).toBe(toStartsAt('2026-10-12', '18:00'));
    const now = new Date(2026, 9, 10, 12, 0).getTime();
    expect(validateForm(form, { now })).toBeNull();
    expect(validateForm({ ...form, title: ' ' }, { now })).toBe('Podaj nazwę spotkania');
    expect(validateForm({ ...form, time: '' }, { now })).toBe('Podaj datę i godzinę spotkania');
    expect(validateForm({ ...form, date: '2026-10-01' }, { now })).toBe('Termin spotkania już minął');
    // Edycja minionego spotkania bez zmiany terminu — dozwolona.
    const past = { ...form, date: '2026-10-01' };
    expect(validateForm(past, { now, editing: true, originalStart: toStartsAt('2026-10-01', '18:00') })).toBeNull();
  });

  it('stan spotkania względem zegara i odpowiedzi', () => {
    const s = Date.parse('2026-10-12T16:00:00Z');
    const m = { status: 'scheduled', starts_at: new Date(s).toISOString(), ends_at: new Date(s + 3_600_000).toISOString() };
    expect(meetingPhase(m, { now: s - 3_600_000 })).toBe('upcoming');
    expect(meetingPhase(m, { now: s - 10 * 60_000 })).toBe('soon');
    expect(meetingPhase(m, { now: s + 60_000 })).toBe('now');
    expect(meetingPhase(m, { now: s + 60_000, callLive: true })).toBe('live');
    expect(meetingPhase(m, { now: s + 2 * 3_600_000 })).toBe('ended');
    expect(meetingPhase({ ...m, status: 'cancelled' }, { callLive: true })).toBe('cancelled');
    expect(responseCounts({ members: [{ response: 'accepted' }, { response: 'pending' }], guests: [{ response: 'declined' }, { response: 'x' }] }))
      .toEqual({ accepted: 1, tentative: 0, declined: 1, pending: 2 });
  });
});
