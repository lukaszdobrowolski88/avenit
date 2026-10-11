// Test dymny modułu Finanse: render wszystkich zakładek + scenariusz z audytu (FUNC-16/UXC-01):
// „Edytuj” → „Anuluj” → „Dodaj …” musi otworzyć PUSTY formularz (nie UPDATE starego rekordu).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const DB = {
  budget_items: [
    { id: 'b1', year: new Date().getFullYear(), kind: 'expense', category: 'MediaTeam', description: 'Mikrofon', planned_amount: '2000.00', period_type: 'year' },
    { id: 'b3', year: new Date().getFullYear(), kind: 'income', category: 'Darowizny', team_type: 'Darowizny', description: 'Zbiórki', planned_amount: '1000.00', period_type: 'year' },
    { id: 'b2', year: new Date().getFullYear(), kind: 'expense', category: 'Administracja', description: 'Czynsz za salę', planned_amount: '12000.00', period_type: 'year', cost_category: 'Czynsz', project_id: 'p1', tags: ['budynek'] },
  ],
  income_transactions: [
    { id: 'i1', date: `${new Date().getFullYear()}-02-01`, amount: '150.00', type: 'Kolekta', source: 'Niedziela', tags: [] },
    { id: 'i2', date: `${new Date().getFullYear()}-02-05`, amount: '700.00', type: 'Darowizny', source: 'Zbiórka na dach', tags: ['budynek'], project_id: 'p1' },
  ],
  finance_areas: [{ id: 'a1', name: 'Administracja', is_active: true, color: '#8A6606' }],
  finance_projects: [{ id: 'p1', name: 'Remont dachu', status: 'active', budget_amount: '5000', color: '#1e40af' }],
  expense_categories: [{ id: 'c1', name: 'Czynsz', kind: 'expense', is_active: true, color: '#166534' }],
  finance_tags: [{ id: 't1', name: 'budynek', color: '#9a3412' }],
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
  IncomeExpenseBarChart: () => null, CashFlowAreaChart: () => null, CategoryDonut: () => null, YoYBars: () => null, BucketTable: () => null,
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

  it('budżet pokazuje własny obszar, kategorię, projekt i tag; grupowanie po projekcie', async () => {
    renderModule();
    await waitFor(() => expect(screen.getAllByText('Czynsz za salę').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Administracja').length).toBeGreaterThan(0);
    expect(screen.getAllByText('budynek').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Grupuj wydatki wg'), { target: { value: 'project' } });
    await waitFor(() => expect(screen.getAllByText(/Remont dachu/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/Bez projektu/).length).toBeGreaterThan(0);
  });

  it('zakładki Projekty i Kategorie i tagi renderują się z danymi', async () => {
    renderModule();
    clickTab('Projekty');
    await waitFor(() => expect(screen.getAllByText('Remont dachu').length).toBeGreaterThan(0));
    expect(document.body.textContent).not.toMatch(/NaN/);
    clickTab('Kategorie i tagi');
    await waitFor(() => expect(screen.getByText('Służby i obszary budżetu')).toBeTruthy());
    expect(screen.getAllByText('Administracja').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Czynsz').length).toBeGreaterThan(0);
  });

  it('raport: wyłączenie sekcji ukrywa ją z widoku', async () => {
    renderModule();
    clickTab('Raporty');
    await waitFor(() => expect(screen.getByText('Raport finansowy')).toBeTruthy());
    expect(screen.getAllByText('Największe wydatki').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTitle('Wybierz, co ma się znaleźć w raporcie'));
    fireEvent.click(screen.getByLabelText('Największe wydatki'));
    await waitFor(() => expect(screen.queryAllByRole('heading', { name: 'Największe wydatki' })).toHaveLength(0));
  });

  it('raport: odznaczenie projektu wyklucza go, „Uwzględnij wszystko” przywraca', async () => {
    renderModule();
    clickTab('Raporty');
    await waitFor(() => expect(screen.getByText('Raport finansowy')).toBeTruthy());
    fireEvent.click(screen.getByText('Projekty', { selector: 'span' }).parentElement.querySelector('button'));
    fireEvent.click(await screen.findByLabelText('Remont dachu'));
    await waitFor(() => expect(screen.getAllByText(/Wyłączone z raportu/).length).toBeGreaterThan(0));
    expect(document.body.textContent).toMatch(/Projekty: Remont dachu/);
    fireEvent.click(screen.getByText('Uwzględnij wszystko'));
    await waitFor(() => expect(screen.queryAllByText(/Wyłączone z raportu/)).toHaveLength(0));
  });

  it('okno „Pobierz / drukuj”: format, sekcje w grupach, bez sekcji nie da się pobrać', async () => {
    renderModule();
    clickTab('Raporty');
    await waitFor(() => expect(screen.getByText('Raport finansowy')).toBeTruthy());
    fireEvent.click(screen.getByText('Pobierz / drukuj'));
    expect(await screen.findByText('Pobierz / drukuj raport')).toBeTruthy();
    expect(screen.getByText('Orientacja strony')).toBeTruthy();
    expect(screen.getByText('Listy transakcji')).toBeTruthy();
    // Bez dopisku o wykluczeniach w oknie.
    expect(document.body.textContent).not.toMatch(/Wyłączone z raportu: Projekty/);
    fireEvent.click(screen.getByRole('radio', { name: 'Excel' }));
    expect(screen.queryByText('Orientacja strony')).toBeNull();
    fireEvent.click(screen.getByText('Nic'));
    const go = screen.getByRole('button', { name: /^Pobierz$/ });
    expect(go.disabled).toBe(true);
    expect(screen.getByText('Wybierz co najmniej jedną sekcję raportu.')).toBeTruthy();
  });

  it('budżet: realizacja planowanych przychodów z wpływów bez wchodzenia w zakładkę Wpływy', async () => {
    renderModule();
    await waitFor(() => expect(screen.getAllByText('Zbiórki').length).toBeGreaterThan(0));
    const row = screen.getAllByText('Zbiórki')[0].closest('tr');
    // plan 1000, wpływy typu Darowizny = 700 → 70%
    await waitFor(() => expect(row.textContent).toMatch(/700,00\s?zł/));
    expect(row.textContent).toMatch(/70%/);
  });
});

