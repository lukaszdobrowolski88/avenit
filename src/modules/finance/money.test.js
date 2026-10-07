import { describe, it, expect } from 'vitest';
import {
  num, sumBy, isCountedExpense, matchesBudgetItem, realizationFor, withNumbers,
  missingFields, planBudgetCopy, nextPeriodStart, localDateStr, humanSaveError, fmtDate,
} from './money';
import { buildReportModel } from './reportExport';

const tr = (k, v) => (v ? Object.entries(v).reduce((s, [a, b]) => s.replace(`{${a}}`, b), k) : k);

describe('kwoty z API jako tekst', () => {
  it('num zamienia tekst/null na liczbę', () => {
    expect(num('2000.00')).toBe(2000);
    expect(num(null)).toBe(0);
    expect(num('abc')).toBe(0);
  });
  it('suma tekstowych kwot nie skleja napisów', () => {
    expect(sumBy([{ amount: '100.00' }, { amount: '50.50' }, { amount: null }])).toBeCloseTo(150.5);
  });
  it('withNumbers normalizuje wskazane pola', () => {
    expect(withNumbers([{ amount: '12.30', x: '1' }])[0]).toEqual({ amount: 12.3, x: '1' });
  });
});

describe('statusy wydatków w sumach', () => {
  it('liczy tylko zatwierdzone, opłacone i stare bez statusu', () => {
    expect(isCountedExpense({ status: 'approved' })).toBe(true);
    expect(isCountedExpense({ status: 'paid' })).toBe(true);
    expect(isCountedExpense({})).toBe(true);
    expect(isCountedExpense({ status: 'rejected' })).toBe(false);
    expect(isCountedExpense({ status: 'submitted' })).toBe(false);
    expect(isCountedExpense({ status: 'draft' })).toBe(false);
  });
  it('realizacja pozycji pomija odrzucone i dopasowuje opis bez względu na wielkość liter/spacje', () => {
    const item = { category: 'MediaTeam', description: 'Nowy mikrofon' };
    const exps = [
      { category: 'MediaTeam', description: 'nowy  mikrofon ', amount: '100.00', status: 'approved' },
      { category: 'MediaTeam', description: 'Nowy mikrofon', amount: '50', status: 'rejected' },
      { category: 'MediaTeam', description: 'Nowy mikrofon', amount: '25', status: 'paid' },
      { category: 'Inne', description: 'Nowy mikrofon', amount: '999' },
    ];
    expect(matchesBudgetItem(exps[0], item)).toBe(true);
    expect(realizationFor(item, exps)).toBe(125);
  });
});

describe('raport', () => {
  it('bilans i realizacja nie obejmują odrzuconych; plan przychodów nie udaje służby', () => {
    const model = buildReportModel({
      range: { from: '2026-01-01', to: '2026-12-31', year: 2026, mode: 'year' },
      income: [{ date: '2026-02-01', amount: '300.00' }],
      expense: [
        { payment_date: '2026-02-02', amount: '100.00', status: 'approved', category: 'A', description: 'x' },
        { payment_date: '2026-02-03', amount: '1000', status: 'rejected', category: 'A', description: 'x' },
      ],
      budget: [
        { kind: 'expense', category: 'A', description: 'x', planned_amount: '200.00' },
        { kind: 'income', category: 'Kolekta', description: '', planned_amount: '5000' },
      ],
    });
    expect(model.totals.expense).toBe(100);
    expect(model.totals.balance).toBe(200);
    expect(model.budgetExecution.map((b) => b.category)).toEqual(['A']);
    expect(model.budgetExecution[0].realized).toBe(100);
    expect(model.expenseStatus.find((s) => s.status === 'rejected').amount).toBe(1000);
  });
});

describe('formularze i kopiowanie', () => {
  it('missingFields podaje etykiety pustych pól', () => {
    expect(missingFields({ a: '', b: 'x', c: null }, [['a', 'Data'], ['b', 'Kwota'], ['c', 'Opis']])).toEqual(['Data', 'Opis']);
  });
  it('planBudgetCopy pomija pozycje już istniejące w roku docelowym', () => {
    const prev = [
      { kind: 'expense', category: 'A', description: 'Czynsz', planned_amount: '100' },
      { kind: 'expense', category: 'B', description: 'Sprzęt', planned_amount: '50' },
    ];
    const r = planBudgetCopy(prev, [{ kind: 'expense', category: 'a', description: 'czynsz' }]);
    expect(r.toCopy).toHaveLength(1);
    expect(r.skipped).toBe(1);
    expect(r.total).toBe(50);
  });
});

describe('daty lokalne', () => {
  it('nextPeriodStart = 1. dzień następnego okresu (bez przesunięcia UTC)', () => {
    const now = new Date(2026, 9, 6, 1, 0); // 6.10.2026 01:00 lokalnie
    expect(nextPeriodStart('monthly', now)).toBe('2026-11-01');
    expect(nextPeriodStart('quarterly', now)).toBe('2027-01-01');
    expect(nextPeriodStart('yearly', now)).toBe('2027-01-01');
    expect(localDateStr(now)).toBe('2026-10-06');
  });
  it('fmtDate nie przesuwa dnia', () => {
    expect(fmtDate('2026-10-15')).toBe(new Date(2026, 9, 15).toLocaleDateString('pl-PL'));
  });
});

describe('komunikaty błędów', () => {
  it('403 przy zatwierdzaniu mówi po ludzku', () => {
    const m = humanSaveError({ code: '403', message: 'Zatwierdzanie i opłacanie wydatków wymaga uprawnienia do zatwierdzania finansów' }, tr);
    expect(m).toMatch(/wniosek do akceptacji/);
  });
});
