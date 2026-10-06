// Test dymny modułu Finanse: render wszystkich zakładek + scenariusz z audytu (FUNC-16/UXC-01):
// „Edytuj” → „Anuluj” → „Dodaj …” musi otworzyć PUSTY formularz (nie UPDATE starego rekordu).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const DB = {
  budget_items: [{ id: 'b1', year: new Date().getFullYear(), kind: 'expense', category: 'MediaTeam', description: 'Mikrofon', planned_amount: '2000.00', period_type: 'year' }],
  income_transactions: [{ id: 'i1', date: `${new Date().getFullYear()}-02-01`, amount: '150.00', type: 'Kolekta', source: 'Niedziela', tags: [] }],
  expense_transactions: [
    { id: 'e1', payment_date: `${new Date().getFullYear()}-02-02`, amount: '100.00', category: 'MediaTeam', description: 'Mikrofon', contractor: null, responsible_person: null, status: 'approved', tags: [], documents: [] },
    { id: 'e2', payment_date: `${new Date().getFullYear()}-02-03`, amount: '50.00', category: 'MediaTeam', description: 'Mikrofon', contractor: 'Sklep', responsible_person: 'Jan', status: 'rejected', tags: [], documents: [] },
  ],
};
const writes = [];

function chain(table) {
  const state = { table, op: 'select' };
  const proxy = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') {
        if (state.op !== 'select') writes.push({ table: state.table, op: state.op, payload: state.payload });
        const data = state.op === 'select' ? (DB[state.table] || []) : [];
        return (res, rej) => Promise.resolve({ data, error: null }).then(res, rej);
      }
      return (...args) => {
        if (['insert', 'update', 'upsert', 'delete'].includes(prop)) { state.op = prop; state.payload = args[0]; }
        return proxy;
      };
    },
  });
  return proxy;
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (t) => chain(t),
    auth: { getUser: async () => ({ data: { user: { email: 'skarbnik@test.pl' } } }) },
    functions: { invoke: async () => ({ data: null, error: null }) },
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
  },
  getCachedUser: async () => ({ email: 'skarbnik@test.pl' }),
}));
vi.mock('../hooks/useCampusQuery', () => ({
  useCampusQuery: () => ({ withCampusFilter: (q) => q, selectedCampusId: null, campusIdForInsert: null }),
}));
let canApprove = true;
vi.mock('../contexts/PermissionsContext', () => ({
  usePermissions: () => ({ can: (c) => (c === 'action:finance:approve' ? canApprove : true), logoUrl: null }),
}));
vi.mock('../components/PageHeader', () => ({
  default: ({ title, actions }) => <div><h1>{title}</h1>{actions}</div>,
}));
vi.mock('../components/ResponsiveTabs', () => ({
  default: ({ tabs, onChange }) => <div>{tabs.map((t) => <button key={t.id} onClick={() => onChange(t.id)}>{t.label}</button>)}</div>,
}));
vi.mock('./shared/MaterialsTab', () => ({ default: () => null }));
vi.mock('./finance/ReportCharts', () => ({
  IncomeExpenseBarChart: () => null, CashFlowAreaChart: () => null, CategoryDonut: () => null, YoYBars: () => null,
}));

import FinanceModule from './FinanceModule';

const renderModule = () => render(<MemoryRouter><FinanceModule /></MemoryRouter>);
const clickTab = (name) => {
  const tabs = screen.getAllByText(name);
  fireEvent.click(tabs[0]);
};

describe('FinanceModule (dymny)', () => {
  beforeEach(() => { writes.length = 0; canApprove = true; });

  it('renderuje budżet z kwotami tekstowymi bez NaN i bez wliczania odrzuconych', async () => {
    renderModule();
    await waitFor(() => expect(screen.getAllByText('Mikrofon').length).toBeGreaterThan(0));
    const body = document.body.textContent;
    expect(body).not.toMatch(/NaN/);
    // plan 2000, wydano tylko zatwierdzone 100 → pozostało 1900
    expect(body).toMatch(/1\s?900,00 zł/);
  });

  it('Dodaj po anulowanej edycji otwiera pusty formularz (bez id)', async () => {
    renderModule();
    await waitFor(() => expect(screen.getAllByText('Mikrofon').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByRole('button', { name: /Edytuj pozycję/ })[0]);
    expect(await screen.findByText('Edytuj pozycję budżetową')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Anuluj' }));
    fireEvent.click(screen.getAllByText('Dodaj pozycję budżetową')[0]);
    expect(await screen.findByText('Nowa pozycja budżetowa')).toBeTruthy();
    const amount = document.getElementById('fin-budget-amount');
    expect(amount.value).toBe('');
  });

  it('filtry wydatków nie wywracają się na pustym kontrahencie; bez uprawnienia brak Zatwierdź', async () => {
    canApprove = false;
    renderModule();
    clickTab('Wydatki');
    await waitFor(() => expect(screen.getAllByText(/Mikrofon/).length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: /Zatwierdź wydatek/ })).toBeNull();
    expect(screen.getAllByText('Zgłoś wydatek').length).toBeGreaterThan(0);
  });

  it('zakładki Wpływy, Cykliczne i Raporty renderują się', async () => {
    renderModule();
    clickTab('Wpływy');
    await waitFor(() => expect(screen.getByText('Niedziela')).toBeTruthy());
    clickTab('Cykliczne');
    await waitFor(() => expect(screen.getByText('Transakcje cykliczne')).toBeTruthy());
    clickTab('Raporty');
    await waitFor(() => expect(screen.getByText('Raport finansowy')).toBeTruthy());
    expect(document.body.textContent).not.toMatch(/NaN/);
  });
});
