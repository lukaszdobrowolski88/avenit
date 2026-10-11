import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import BudgetExpenseTable from './BudgetExpenseTable';

const items = [
  { id: 'a', category: 'małe Avenit', description: 'Małe SChWro', planned_amount: 6000 },
  { id: 'b', category: 'MediaTeam', description: 'MediaTeam', planned_amount: 4800 },
  { id: 'c', category: 'Misja', description: 'Ewangelizacja', planned_amount: 3600 },
  { id: 'd', category: 'Misja', description: 'Acts 29', planned_amount: 1000 },
];
const spent = { a: 2849.45, b: 2102.2, c: 1746, d: 1500 };
const LABEL = { 'małe Avenit': 'Małe SchWro' };

const renderTable = () => render(
  <BudgetExpenseTable
    items={items} groupKey={(i) => i.category} groupLabel={(k) => LABEL[k] || k} columnLabel="Służba / obszar"
    realizationOf={(i) => spent[i.id]} expensesOf={() => []} renderMeta={() => null}
    onEdit={() => {}} onDelete={() => {}} changesOf={() => []} onShowChanges={() => {}} statusLabel={() => ''}
  />,
);

describe('tabela planowanych wydatków', () => {
  it('bez wierszy „Podsumowanie”; grupa jednopozycyjna = jeden wiersz z nazwą z menu, bez dublowania', () => {
    const { container } = renderTable();
    const desktop = container.querySelector('.hidden.sm\\:block');
    expect(desktop.textContent).not.toMatch(/Podsumowanie/);
    expect(desktop.textContent).not.toMatch(/małe Avenit/);
    expect(within(desktop).getAllByText('MediaTeam')).toHaveLength(1);
    expect(within(desktop).getByText('Małe SchWro')).toBeTruthy();
  });
  it('grupa wielopozycyjna: nagłówek z licznikiem i sumami, przekroczenie na czerwono, zwijanie', () => {
    const { container } = renderTable();
    const desktop = container.querySelector('.hidden.sm\\:block');
    const header = within(desktop).getByRole('button', { name: /Misja/ });
    const headerRow = header.closest('tr');
    expect(headerRow.textContent).toMatch(/4600,00\s?zł/);
    expect(headerRow.textContent).toMatch(/3246,00\s?zł/);
    // Acts 29: 1500 z 1000 → -500 zł, 150%
    const acts = within(desktop).getByText('Acts 29').closest('tr');
    expect(acts.textContent).toMatch(/-500,00\s?zł/);
    expect(acts.querySelector('.text-red-700')).toBeTruthy();
    fireEvent.click(header);
    expect(within(desktop).queryByText('Acts 29')).toBeNull();
    // Razem
    expect(desktop.textContent).toMatch(/Razem/);
    expect(desktop.textContent).toMatch(/15\s?400,00\s?zł/);
  });
});
