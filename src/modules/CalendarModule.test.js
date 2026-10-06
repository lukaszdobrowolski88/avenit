import { describe, it, expect, vi } from 'vitest';

// Moduł importuje klienta API i formularze — w testach czystych funkcji wystarczą atrapy.
vi.mock('../lib/supabase', () => ({ supabase: { from: () => ({}) } }));

const { localDateTime, readTaskWhen, taskDueDateValue, buildCalendarEntries, endNotAfterStart, localYmd } = await import('./CalendarModule');

// FUNC-10: godzina zadania z kolumny due_time (czas lokalny), nie z ciągu UTC.
describe('readTaskWhen', () => {
  it('bierze godzinę z due_time, a dzień lokalnie z TIMESTAMPTZ', () => {
    // 10:00 w Polsce latem = 08:00Z — dawniej pokazywało się 08:00.
    const local = new Date(2026, 9, 11, 10, 0);
    const w = readTaskWhen({ due_date: local.toISOString(), due_time: '10:00' });
    expect(w.ymd).toBe('2026-10-11');
    expect(w.time).toBe('10:00');
    expect(w.date.getHours()).toBe(10);
  });
  it('kolumna DATE: dzień bez przesunięcia, godzina z due_time', () => {
    const w = readTaskWhen({ due_date: '2026-10-11', due_time: '18:30:00' });
    expect(w.ymd).toBe('2026-10-11');
    expect(w.time).toBe('18:30');
  });
  it('bez due_time i z północą UTC nie wymyśla godziny', () => {
    const w = readTaskWhen({ due_date: '2026-10-11T00:00:00.000Z' });
    expect(w.time).toBe('');
  });
  it('brak daty → null', () => {
    expect(readTaskWhen({ due_date: null })).toBeNull();
  });
});

describe('taskDueDateValue', () => {
  it('zapis = lokalna data i godzina z jawnym przesunięciem strefy (bez dryfu przy edycji)', () => {
    const v = taskDueDateValue('2026-10-11', '10:00');
    expect(v.startsWith('2026-10-11T10:00:00')).toBe(true);
    expect(/[+-]\d{2}:\d{2}$/.test(v)).toBe(true);
    // Zapis → odczyt → zapis daje to samo (dawniej każde „Edytuj → Zapisz” przesuwało o 2 h).
    const back = readTaskWhen({ due_date: new Date(v).toISOString(), due_time: '10:00' });
    expect(taskDueDateValue(back.ymd, back.time)).toBe(v);
  });
});

describe('endNotAfterStart', () => {
  it('koniec przed lub równo z początkiem jest błędem; brak końca — nie', () => {
    expect(endNotAfterStart('03:00', '01:00')).toBe(true);
    expect(endNotAfterStart('10:00', '10:00')).toBe(true);
    expect(endNotAfterStart('10:00', '12:00')).toBe(false);
    expect(endNotAfterStart('10:00', '')).toBe(false);
  });
});

// UXA-02: klucze z prefiksem i program podpięty do wydarzenia nie jest osobnym wpisem.
describe('buildCalendarEntries', () => {
  const entries = buildCalendarEntries({
    events: [
      { id: 10, title: 'Nabożeństwo', date: '2026-10-11', time: '10:00:00', program_id: 10 },
      { id: 11, title: 'Próba', date: '2026-10-10', time: '18:00', module_key: 'worship' },
      { id: 12, title: 'Bez daty' },
    ],
    programs: [
      { id: 10, title: 'Plan 11.10', date: '2026-10-11' }, // podpięty do wydarzenia 10
      { id: 20, title: 'Stary program', date: '2026-08-30' },
    ],
    tasks: [{ id: 10, title: 'Zadanie', due_date: '2026-10-12', due_time: '09:00', team: 'media' }],
  });

  it('klucze nie kolidują mimo równych id w różnych tabelach', () => {
    const ids = entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(['ev_10', 'ev_11', 'prog_20', 'task_10']));
  });
  it('program podpięty do wydarzenia nie dubluje nabożeństwa', () => {
    expect(entries.find((e) => e.id === 'prog_10')).toBeUndefined();
    expect(entries.filter((e) => e.date && localYmd(e.date) === '2026-10-11')).toHaveLength(1);
  });
  it('wydarzenie: data i godzina lokalnie, typ „event” (klik → strona wydarzenia)', () => {
    const ev = entries.find((e) => e.id === 'ev_10');
    expect(ev.type).toBe('event');
    expect(ev.raw.id).toBe(10);
    expect(localYmd(ev.date)).toBe('2026-10-11');
    expect(ev.raw.due_time).toBe('10:00');
    expect(entries.find((e) => e.id === 'ev_11').team).toBe('worship');
  });
  it('wydarzenie bez daty nie trafia do kalendarza', () => {
    expect(entries.find((e) => e.id === 'ev_12')).toBeUndefined();
  });
  it('localDateTime nie przesuwa dnia przez UTC', () => {
    expect(localYmd(localDateTime('2026-10-11T00:00:00.000Z'))).toBe('2026-10-11');
  });
});
