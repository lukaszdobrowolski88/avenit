// Zadania Kalendarza na tablicy „Zadania”: element ↔ okno zadania bez gubienia innych komórek.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../lib/supabase', () => ({ supabase: { from: () => ({}), functions: { invoke: async () => ({ data: null, error: null }) } } }));

const { calendarColumns, boardItemToTask, taskToBoardItem, statusIdForTitle, isAccessError } = await import('./calendarTasks');

const cols = [
  { id: 'st', type: 'status', name: 'Status', settings: { labels: [{ id: 'todo', title: 'Do zrobienia' }, { id: 'done', title: 'Gotowe' }] } },
  { id: 'pp', type: 'people', name: 'Osoby', settings: {} },
  { id: 'du', type: 'date', name: 'Termin', settings: { role: 'due' } },
  { id: 'od', type: 'text', name: 'Od', settings: { role: 'start_time' } },
  { id: 'do', type: 'text', name: 'Do', settings: { role: 'end_time' } },
  { id: 'tm', type: 'dropdown', name: 'Kategoria', settings: { role: 'team', multi: false } },
  { id: 'lc', type: 'location', name: 'Miejsce', settings: { role: 'location' } },
  { id: 'xx', type: 'text', name: 'Notatka', settings: {} },
];

describe('calendarColumns', () => {
  it('po settings.role, a bez ról — po typie/nazwie', () => {
    const c = calendarColumns(cols);
    expect([c.due.id, c.start.id, c.end.id, c.team.id, c.location.id, c.people.id, c.status.id]).toEqual(['du', 'od', 'do', 'tm', 'lc', 'pp', 'st']);
    const plain = calendarColumns([{ id: 'a', type: 'date', name: 'Data' }, { id: 'b', type: 'text', name: 'Od' }, { id: 'c', type: 'dropdown', name: 'Kategoria' }]);
    expect([plain.due.id, plain.start.id, plain.team.id, plain.end]).toEqual(['a', 'b', 'c', null]);
  });
});

describe('boardItemToTask / taskToBoardItem', () => {
  const item = {
    id: 'i1', name: 'Próba', description: 'opis',
    cells: { du: '2026-10-12', od: '9:30', do: '11:00', tm: ['groups'], lc: 'Sala', st: 'done', pp: [{ email: 'a@x.pl', name: 'Ania' }], xx: 'zostaje' },
  };
  it('element → zadanie kalendarza', () => {
    const t = boardItemToTask(item, cols);
    expect(t).toMatchObject({ id: 'i1', title: 'Próba', description: 'opis', due_date: '2026-10-12', due_time: '09:30', end_time: '11:00', team: 'groups', location: 'Sala', status: 'Gotowe', assignee_email: 'a@x.pl' });
  });
  it('zapis z okna: pola kalendarza zmienione, inne komórki i status/osoby nietknięte', () => {
    const t = boardItemToTask(item, cols);
    const out = taskToBoardItem({ ...t, title: ' Próba 2 ', due_date: '2026-10-13T10:00:00+02:00', due_time: '10:00', end_time: '', location: '', team: 'media' }, cols, item.cells);
    expect(out.name).toBe('Próba 2');
    expect(out.cells).toEqual({ du: '2026-10-13', od: '10:00', tm: ['media'], st: 'done', pp: [{ email: 'a@x.pl', name: 'Ania' }], xx: 'zostaje' });
  });
  it('nowe zadanie dostaje status „Do zrobienia”; zmiana osoby tylko gdy wybrana', () => {
    const out = taskToBoardItem({ title: 'X', due_date: '2026-10-01', status: 'Do zrobienia', assignee_touched: true, assignee: { email: 'b@x.pl', name: 'B' } }, cols, {});
    expect(out.cells.st).toBe('todo');
    expect(out.cells.pp).toEqual([{ email: 'b@x.pl', name: 'B' }]);
    const cleared = taskToBoardItem({ title: 'X', due_date: '2026-10-01', assignee_touched: true, assignee: null }, cols, { pp: [{ email: 'b@x.pl' }] });
    expect(cleared.cells.pp).toBeUndefined();
  });
  it('statusIdForTitle i błędy dostępu', () => {
    expect(statusIdForTitle(cols[0], 'gotowe')).toBe('done');
    expect(statusIdForTitle(cols[0], 'nieznany')).toBe('todo');
    expect(isAccessError({ code: '403' })).toBe(true);
    expect(isAccessError({ status: 401 })).toBe(true);
    expect(isAccessError(new Error('x'))).toBe(false);
  });
});
