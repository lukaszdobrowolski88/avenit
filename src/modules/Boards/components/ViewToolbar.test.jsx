// Pasek widoku: chip „Moje” (osobisty filtr) i lista osób z „Ja” na górze (filtr Osoby).
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ViewToolbar, { PeoplePickList } from './ViewToolbar';
import { ME } from '../lib/viewData';

const people = [
  { email: 'anna@x.pl', name: 'Anna' },
  { email: 'ja@x.pl', name: 'Ja Sam' },
  { email: 'bartek@x.pl', name: 'Bartek' },
];
const cols = [{ id: 'p', type: 'people', name: 'Osoby' }, { id: 's', type: 'status', name: 'Status', settings: { labels: [] } }];

describe('ViewToolbar — chip „Moje”', () => {
  it('przełącza config.mine', () => {
    const onUpdateConfig = vi.fn();
    const { rerender } = render(<ViewToolbar columns={cols} config={{}} onUpdateConfig={onUpdateConfig} search="" onSearch={() => {}} people={people} me="ja@x.pl" />);
    const chip = screen.getByRole('button', { name: /Moje/ });
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(chip);
    expect(onUpdateConfig).toHaveBeenCalledWith({ mine: true });
    rerender(<ViewToolbar columns={cols} config={{ mine: true }} onUpdateConfig={onUpdateConfig} search="" onSearch={() => {}} people={people} me="ja@x.pl" />);
    expect(screen.getByRole('button', { name: /Moje/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('bez kolumny Osoby albo bez użytkownika — bez chipa', () => {
    render(<ViewToolbar columns={[cols[1]]} config={{}} onUpdateConfig={vi.fn()} search="" onSearch={() => {}} people={people} me="ja@x.pl" />);
    expect(screen.queryByRole('button', { name: /Moje/ })).toBeNull();
  });

  it('licznik filtrów pomija filtry bez wartości', () => {
    render(<ViewToolbar columns={cols} config={{ filters: [{ columnId: 'p', op: 'is', value: null }, { columnId: 'p', op: 'is', value: ME }] }}
      onUpdateConfig={vi.fn()} search="" onSearch={() => {}} people={people} me="ja@x.pl" />);
    expect(screen.getByRole('button', { name: /Filtruj · 1/ })).toBeTruthy();
  });
});

describe('PeoplePickList — wybór osoby', () => {
  it('„Ja” na górze (bez dubla siebie na liście), wybór zwraca ME albo e-mail', () => {
    const onPick = vi.fn();
    render(<PeoplePickList people={people} me="JA@x.pl" label="Osoby" onPick={onPick} />);
    const opts = screen.getAllByRole('option');
    expect(opts[0].textContent).toContain('Ja');
    expect(opts.some(o => o.textContent.includes('Ja Sam'))).toBe(false);
    expect(opts).toHaveLength(3);
    fireEvent.click(opts[0]);
    expect(onPick).toHaveBeenCalledWith(ME);
    fireEvent.click(screen.getByRole('option', { name: /Anna/ }));
    expect(onPick).toHaveBeenLastCalledWith('anna@x.pl', people[0]);
  });

  it('szukanie zawęża listę', () => {
    render(<PeoplePickList people={people} me="ja@x.pl" label="Osoby" onPick={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'bar' } });
    const left = screen.getAllByRole('option');
    expect(left).toHaveLength(1);
    expect(left[0].textContent).toContain('Bartek');
  });
});
