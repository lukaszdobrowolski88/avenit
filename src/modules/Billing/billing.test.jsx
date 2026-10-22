// Rozliczenia kościoła (limit planu = aktywne konta użytkowników): komunikaty stanów, ceny, ekran Subskrypcja
// i dyskretny komunikat tylko dla osób z dostępem do rozliczeń.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { usageLabel, usageMessage, noticeFor, noticeDismissKey, planPriceLines, formatPLN, bufferLabel, pendingLabel } from './billingView';

const h = vi.hoisted(() => ({ data: null, requests: [], perms: { ready: true, can: () => true }, confirm: true }));

vi.mock('../../lib/subscriptions', () => ({
  PLAN_USAGE_CHANGED: 'avenit:plan-usage-changed',
  getPlanUsage: async () => h.data,
  requestPlanChange: async (b) => { h.requests.push(b); return { ok: true }; },
}));
vi.mock('../../contexts/PermissionsContext', () => ({ usePermissions: () => h.perms }));
vi.mock('../../lib/dialog', () => ({ confirmDialog: async () => h.confirm }));
vi.mock('../../lib/toast', () => ({ toast: { success: () => {}, error: () => {}, info: () => {} } }));

const PLANS = [
  { key: 'start', name: 'Start', description: 'Dla małej wspólnoty, która chce uporządkować niedzielę i ludzi.', priceMonthly: 7900, priceYearly: 79000, maxAccounts: 50, isCustom: false },
  { key: 'wspolnota', name: 'Wspólnota', description: 'Dla kościoła z kilkoma służbami, grupami domowymi i szkółką.', priceMonthly: 15900, priceYearly: 159000, maxAccounts: 150, isCustom: false },
  { key: 'kosciol', name: 'Kościół', description: 'x', priceMonthly: 29900, priceYearly: 299000, maxAccounts: 400, isCustom: false },
  { key: 'kosciol_plus', name: 'Kościół+', description: 'x', priceMonthly: 49900, priceYearly: 499000, maxAccounts: 1000, isCustom: false },
  { key: 'siec', name: 'Sieć', description: 'Wycena indywidualna', priceMonthly: 89900, priceYearly: null, maxAccounts: -1, isCustom: true },
];
const payload = (usage, over = {}) => ({
  tenant: { status: 'active' },
  plan: { key: 'start', name: 'Start', priceMonthly: 7900, priceYearly: 79000, retired: false },
  subscription: { status: 'active', billingCycle: 'monthly', currentPeriodEnd: '2026-11-01', price: { amount: 7900, cycle: 'monthly' } },
  usage, suggestedPlan: { key: 'wspolnota', name: 'Wspólnota' }, plans: PLANS, ...over,
});

beforeEach(() => {
  h.requests = [];
  h.perms = { ready: true, can: () => true };
  h.confirm = true;
  try { localStorage.clear(); } catch { /* brak */ }
});

describe('billingView', () => {
  it('licznik i komunikaty stanów', () => {
    expect(usageLabel({ accounts: 42, limit: 50, state: 'ok' })).toBe('Konta: 42 z 50');
    expect(usageLabel({ accounts: 1200, limit: -1, state: 'unlimited' })).toBe('Konta: 1200');
    expect(bufferLabel({ accounts: 42, limit: 50, bufferLimit: 55, state: 'ok' })).toBe('Limit 50 kont, z 10% zapasem 55.');
    expect(bufferLabel({ accounts: 1200, limit: -1, bufferLimit: null, state: 'unlimited' })).toBeNull();
    expect(pendingLabel({ accounts: 4, pending: 3 })).toMatch(/Oczekujące konta: 3/);
    expect(pendingLabel({ accounts: 4, pending: 0 })).toBeNull();
    expect(usageMessage({ state: 'ok' })).toBeNull();
    expect(usageMessage({ state: 'near' }).tone).toBe('neutral');
    expect(usageMessage({ state: 'over' }).text).toMatch(/kolejnego okresu/);
    expect(usageMessage({ state: 'over_buffer' }).text).toMatch(/Wybierzcie większy plan/);
  });
  it('komunikat w aplikacji tylko dla over/over_buffer; klucz odrzucenia per stan i miesiąc', () => {
    expect(noticeFor(payload({ accounts: 45, limit: 50, state: 'near' }))).toBeNull();
    const n = noticeFor(payload({ accounts: 53, limit: 50, state: 'over' }));
    expect(n.state).toBe('over');
    expect(n.text).toMatch(/53 z 50/);
    expect(n.text).toMatch(/Kont użytkowników/);
    expect(noticeDismissKey(n, new Date(2026, 9, 9))).toBe('avenit_plan_notice:over:2026-10');
  });
  it('ceny: miesięcznie, rocznie z kwotą na miesiąc, Sieć „od”', () => {
    const m = planPriceLines(PLANS[0], 'monthly');
    expect(m.main.replace(/\s/g, ' ')).toMatch(/79/);
    const y = planPriceLines(PLANS[0], 'yearly');
    expect(y.main.replace(/\s/g, '')).toMatch(/790/);
    expect(y.sub).toMatch(/65,83/);
    expect(planPriceLines(PLANS[4], 'yearly').main).toMatch(/^od /);
    expect(formatPLN(null)).toBe('—');
  });
});

describe('ekran Subskrypcja (BillingOverview)', () => {
  it('pokazuje plan, cenę, „Konta: N z L”, zapas, oczekujące, stan ponad limitem i 5 planów; wybór wysyła prośbę', async () => {
    const { default: BillingOverview } = await import('./BillingOverview');
    h.data = payload({ accounts: 53, pending: 2, limit: 50, bufferLimit: 55, pct: 106, state: 'over' });
    render(<MemoryRouter><BillingOverview /></MemoryRouter>);
    expect(await screen.findByText('Konta: 53 z 50')).toBeTruthy();
    expect(screen.getByText('Limit 50 kont, z 10% zapasem 55.')).toBeTruthy();
    expect(screen.getByText(/Oczekujące konta: 2/)).toBeTruthy();
    expect(screen.getAllByText('do 50 kont użytkowników').length).toBe(1);
    expect(screen.getByText(/mieścicie się w 10% zapasie/)).toBeTruthy();
    expect(screen.getByRole('meter')).toBeTruthy();
    for (const p of PLANS) expect(screen.getAllByText(p.name).length).toBeGreaterThan(0);
    expect(screen.getByText('Porozmawiajmy')).toBeTruthy();
    expect(screen.getByText('Pasuje do Was')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Rocznie/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Wybierz Wspólnota' }));
    await waitFor(() => expect(h.requests).toEqual([{ planKey: 'wspolnota', billingCycle: 'yearly' }]));
    fireEvent.click(screen.getByText('Porozmawiajmy'));
    await waitFor(() => expect(h.requests[1]).toEqual({ planKey: 'siec', billingCycle: 'monthly' }));
  });
  it('bez dostępu do rozliczeń (403 → null) — tylko informacja', async () => {
    const { default: BillingOverview } = await import('./BillingOverview');
    h.data = null;
    render(<MemoryRouter><BillingOverview /></MemoryRouter>);
    expect(await screen.findByText(/administrator Waszej organizacji/)).toBeTruthy();
  });
});

describe('PlanUsageNotice', () => {
  it('admin widzi komunikat przy przekroczeniu i może go zamknąć (nie wraca w tym miesiącu)', async () => {
    const { default: PlanUsageNotice } = await import('./PlanUsageNotice');
    h.data = payload({ accounts: 70, limit: 50, bufferLimit: 55, pct: 140, state: 'over_buffer' });
    const { unmount } = render(<MemoryRouter><PlanUsageNotice /></MemoryRouter>);
    expect(await screen.findByText(/Wybierzcie większy plan/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Zamknij' }));
    expect(screen.queryByText(/Wybierzcie większy plan/)).toBeNull();
    unmount();
    render(<MemoryRouter><PlanUsageNotice /></MemoryRouter>);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/Wybierzcie większy plan/)).toBeNull();
  });
  it('odświeża się po zmianie liczby kont (PLAN_USAGE_CHANGED) — bez przeładowania', async () => {
    const { default: PlanUsageNotice } = await import('./PlanUsageNotice');
    h.data = payload({ accounts: 50, limit: 50, bufferLimit: 55, state: 'near' });
    render(<MemoryRouter><PlanUsageNotice /></MemoryRouter>);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/Wybierzcie większy plan/)).toBeNull();
    h.data = payload({ accounts: 57, limit: 50, bufferLimit: 55, state: 'over_buffer' });
    window.dispatchEvent(new Event('avenit:plan-usage-changed'));
    expect(await screen.findByText(/Kont użytkowników jest wyraźnie więcej/)).toBeTruthy();
  });
  it('członek bez dostępu do Ustawień nic nie widzi; stan near też nie', async () => {
    const { default: PlanUsageNotice } = await import('./PlanUsageNotice');
    h.perms = { ready: true, can: () => false };
    h.data = payload({ accounts: 70, limit: 50, state: 'over_buffer' });
    const a = render(<MemoryRouter><PlanUsageNotice /></MemoryRouter>);
    await new Promise((r) => setTimeout(r, 20));
    expect(a.container.textContent).toBe('');
    a.unmount();
    h.perms = { ready: true, can: () => true };
    h.data = payload({ accounts: 46, limit: 50, state: 'near' });
    const b = render(<MemoryRouter><PlanUsageNotice /></MemoryRouter>);
    await new Promise((r) => setTimeout(r, 20));
    expect(b.container.textContent).toBe('');
  });
});
