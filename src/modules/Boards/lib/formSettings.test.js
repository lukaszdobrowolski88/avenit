import { describe, it, expect } from 'vitest';
import { selectedFieldIds, toggleFormField, visibleFormColumns, NO_FIELDS } from './formSettings';
import { parseDecimal } from '../components/FormField';
import { buildCreatedItem } from './automations';
import { chartSummary } from '../dashboards/Charts';

const cols = [
  { id: 'a', type: 'text', display_order: 0 },
  { id: 'b', type: 'status', display_order: 1 },
  { id: 'p', type: 'people', display_order: 2 }, // osoby nie trafiają do formularza
];

describe('form_settings.fields', () => {
  it('brak listy = wszystkie pola formularza', () => {
    expect(selectedFieldIds(cols, {})).toEqual(['a', 'b']);
    expect(visibleFormColumns(cols, { fields: [] }).map((c) => c.id)).toEqual(['a', 'b']);
  });
  it('odznaczenie i ponowne zaznaczenie', () => {
    const f1 = toggleFormField(cols, {}, 'a');
    expect(f1).toEqual(['b']);
    expect(visibleFormColumns(cols, { fields: f1 }).map((c) => c.id)).toEqual(['b']);
    expect(toggleFormField(cols, { fields: f1 }, 'a')).toEqual([]); // wszystkie → pusta lista
  });
  it('odznaczenie wszystkich → [NO_FIELDS], formularz bez dodatkowych pól', () => {
    const f = toggleFormField(cols, { fields: ['b'] }, 'b');
    expect(f).toEqual([NO_FIELDS]);
    expect(visibleFormColumns(cols, { fields: f })).toEqual([]);
  });
});

describe('parseDecimal (pole liczby w formularzu)', () => {
  it('przecinek i kropka', () => {
    expect(parseDecimal('1,5')).toBe(1.5);
    expect(parseDecimal('2.25')).toBe(2.25);
    expect(parseDecimal('-3')).toBe(-3);
    expect(parseDecimal('1,')).toBe(1);
  });
  it('puste → null, śmieci → NaN', () => {
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('-')).toBeNull();
    expect(parseDecimal('1a')).toBeNaN();
    expect(parseDecimal('1,2,3')).toBeNaN();
  });
});

describe('buildCreatedItem (automatyzacja „Utwórz element”)', () => {
  const groups = [{ id: 'g2', display_order: 1 }, { id: 'g1', display_order: 0 }];
  const items = [{ id: 'x', group_id: 'g2', display_order: 4 }];
  const columns = [{ id: 's' }, { id: 'p' }, { id: 'd' }];
  const now = new Date(2026, 9, 9);

  it('grupa, komórki istniejących kolumn i termin „dziś + N”', () => {
    const row = buildCreatedItem({
      params: { name: 'Raport', groupId: 'g2', cells: { s: 'todo', p: [{ email: 'a@b.pl' }], gone: 1 }, dueColumnId: 'd', dueOffsetDays: 3 },
      boardId: 'B', groups, items, columns, userEmail: 'ja@x.pl', now,
    });
    expect(row).toEqual({ board_id: 'B', group_id: 'g2', name: 'Raport', cells: { s: 'todo', p: [{ email: 'a@b.pl' }], d: '2026-10-12' }, display_order: 5, created_by: 'ja@x.pl' });
  });
  it('usunięta grupa → pierwsza; brak grup → null', () => {
    expect(buildCreatedItem({ params: { groupId: 'old' }, boardId: 'B', groups, fallbackName: 'Nowe' })).toMatchObject({ group_id: 'g1', name: 'Nowe', display_order: 0 });
    expect(buildCreatedItem({ params: {}, boardId: 'B', groups: [] })).toBeNull();
  });
});

describe('chartSummary (dostępna nazwa wykresu)', () => {
  it('streszcza dane', () => {
    expect(chartSummary([{ label: 'A', value: 2 }, { label: 'B', value: 3 }], 'Statusy')).toBe('Statusy. A: 2, B: 3 — razem 5');
    expect(chartSummary([], '')).toBe('Brak danych');
  });
});
