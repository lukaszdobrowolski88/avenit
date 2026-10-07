import { describe, it, expect } from 'vitest';
import {
  computeNextRun, nextRunAfterEdit, raisedForCampaign, donationTotals,
  splitForStatement, defaultStatementYear, methodLabel,
} from './givingApi';
import { buildStatementHtml } from './pitStatement';

describe('plany cykliczne', () => {
  it('computeNextRun liczy w dniach lokalnych', () => {
    expect(computeNextRun('monthly', '2026-10-10')).toBe('2026-11-10');
    expect(computeNextRun('weekly', '2026-12-28')).toBe('2027-01-04');
    expect(computeNextRun('monthly', '2026-10-10', 31)).toBe('2026-11-28');
  });
  it('edycja bez zmiany harmonogramu nie rusza następnej należności', () => {
    const plan = { frequency: 'monthly', day_of_month: 10, start_date: '2026-01-10', next_run_date: '2026-11-10' };
    const form = { frequency: 'monthly', day_of_month: 10, start_date: '2026-01-10' };
    expect(nextRunAfterEdit(plan, form, '2026-10-06')).toBe('2026-11-10');
  });
  it('zmiana harmonogramu nigdy nie cofa terminu w przeszłość', () => {
    const plan = { frequency: 'monthly', start_date: '2026-01-10', next_run_date: '2026-11-10' };
    const form = { frequency: 'weekly', day_of_month: '', start_date: '2026-01-10' };
    const next = nextRunAfterEdit(plan, form, '2026-10-06');
    expect(next >= '2026-10-06').toBe(true);
  });
});

describe('zbiórki i sumy', () => {
  const camp = { id: 'c1', fund_id: 'f1', start_date: '2026-03-01', end_date: '2026-06-30' };
  it('zebrano = zaksięgowane przypisane do zbiórki lub na fundusz w oknie dat', () => {
    const d = [
      { campaign_id: 'c1', amount: '10', status: 'completed' },
      { campaign_id: 'c2', fund_id: 'f1', amount: '99', status: 'completed', donation_date: '2026-04-01' },
      { fund_id: 'f1', amount: '20', status: 'completed', donation_date: '2026-04-01' },
      { fund_id: 'f1', amount: '30', status: 'completed', donation_date: '2026-08-01' },
      { fund_id: 'f1', amount: '40', status: 'pending', donation_date: '2026-04-01' },
    ];
    expect(raisedForCampaign(camp, d)).toBe(30);
  });
  it('suma darowizn liczy tylko zaksięgowane, oczekujące osobno', () => {
    const t = donationTotals([
      { amount: '100', status: 'completed' }, { amount: '60', status: 'pending' },
      { amount: '5', status: 'failed' }, { amount: '7', status: 'refunded' },
    ]);
    expect(t).toEqual({ completed: 100, pending: 60, pendingCount: 1, completedCount: 1 });
  });
});

describe('zestawienie PIT', () => {
  const funds = { f2: { id: 'f2', name: 'Remont', is_tax_deductible: false } };
  it('gotówka osobno, nieodliczalny fundusz pominięty', () => {
    const r = splitForStatement([
      { amount: '100', method: 'transfer', status: 'completed' },
      { amount: '50', method: 'cash', status: 'completed' },
      { amount: '70', method: 'transfer', status: 'completed', fund_id: 'f2' },
      { amount: '30', method: 'blik', status: 'pending' },
    ], funds);
    expect(r.deductibleTotal).toBe(100);
    expect(r.cashTotal).toBe(50);
  });
  it('domyślny rok zestawienia: styczeń–kwiecień = poprzedni', () => {
    expect(defaultStatementYear(new Date(2027, 1, 10))).toBe(2026);
    expect(defaultStatementYear(new Date(2026, 9, 6))).toBe(2026);
  });
  it('wydruk: kody metod po polsku, dane escapowane', () => {
    const { html } = buildStatementHtml({
      orgName: 'Kościół', year: 2026,
      donor: { name: '<img src=x onerror=alert(1)>' },
      items: [{ amount: 10, method: 'transfer', status: 'completed', donation_date: '2026-01-02' }, { amount: 5, method: 'cash', status: 'completed', donation_date: '2026-01-03' }],
    });
    expect(html).toContain(methodLabel('transfer'));
    expect(html).not.toContain('TRANSFER');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('nie podlegają odliczeniu');
  });
});

describe('wybór darczyńcy', async () => {
  const { filterMembers } = await import('../components/MemberPicker');
  const members = [
    { id: 1, first_name: 'Łukasz', last_name: 'Dobrowolski', email: 'l@x.pl' },
    { id: 2, first_name: 'Anna', last_name: 'Nowak', email: 'anna@x.pl' },
  ];
  it('szuka bez polskich znaków, po imieniu i nazwisku', () => {
    expect(filterMembers(members, 'lukasz dob').map((m) => m.id)).toEqual([1]);
    expect(filterMembers(members, 'anna@').map((m) => m.id)).toEqual([2]);
    expect(filterMembers(members, '')).toHaveLength(2);
  });
});
