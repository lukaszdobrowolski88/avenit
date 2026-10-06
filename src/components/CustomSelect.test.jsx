import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CustomSelect from './CustomSelect';

// jsdom nie ma layoutu — lista renderuje się dopiero, gdy pole ma szerokość.
beforeAll(() => {
  Element.prototype.getBoundingClientRect = function () {
    return { top: 10, bottom: 40, left: 10, right: 210, width: 200, height: 30, x: 10, y: 10, toJSON() {} };
  };
});

const OPTS = [
  { value: 'member', label: 'Członek' },
  { value: 'guest', label: 'Gość' },
  { value: 'sympathizer', label: 'Sympatyk' },
];

describe('CustomSelect (klawiatura i dostępność)', () => {
  it('pole jest osiągalne Tabem i nazwane etykietą', () => {
    render(<CustomSelect label="Status" value="member" onChange={() => {}} options={OPTS} />);
    const cb = screen.getByRole('combobox', { name: 'Status' });
    expect(cb.getAttribute('tabindex')).toBe('0');
    expect(cb.getAttribute('aria-expanded')).toBe('false');
    expect(cb.textContent).toContain('Członek');
  });

  it('Enter otwiera listę, strzałki przesuwają, Enter wybiera i zamyka', () => {
    const onChange = vi.fn();
    render(<CustomSelect label="Status" value="member" onChange={onChange} options={OPTS} />);
    const cb = screen.getByRole('combobox');
    cb.focus();
    fireEvent.keyDown(cb, { key: 'Enter' });
    expect(cb.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(cb.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[0].id);
    fireEvent.keyDown(cb, { key: 'ArrowDown' });
    expect(cb.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[1].id);
    fireEvent.keyDown(cb, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('guest');
    expect(cb.getAttribute('aria-expanded')).toBe('false');
  });

  it('Home/End i wpisanie litery', () => {
    const onChange = vi.fn();
    render(<CustomSelect value="" onChange={onChange} options={OPTS} placeholder="Wybierz status" />);
    const cb = screen.getByRole('combobox', { name: 'Wybierz status' });
    fireEvent.keyDown(cb, { key: 'End' });
    expect(cb.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[2].id);
    fireEvent.keyDown(cb, { key: 'Home' });
    expect(cb.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[0].id);
    fireEvent.keyDown(cb, { key: 'g' });
    expect(cb.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[1].id);
    fireEvent.keyDown(cb, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('guest');
  });

  it('Esc zamyka listę i oznacza zdarzenie (okno modalne się nie zamknie)', () => {
    render(<CustomSelect label="Status" value="member" onChange={() => {}} options={OPTS} />);
    const cb = screen.getByRole('combobox');
    fireEvent.keyDown(cb, { key: 'ArrowDown' });
    expect(cb.getAttribute('aria-expanded')).toBe('true');
    const notPrevented = fireEvent.keyDown(cb, { key: 'Escape' });
    expect(notPrevented).toBe(false); // preventDefault → Modal nie zamknie okna
    expect(cb.getAttribute('aria-expanded')).toBe('false');
  });

  it('opcje mają role option i aria-selected; klik myszą wybiera', () => {
    const onChange = vi.fn();
    render(<CustomSelect aria-label="Rok" value="guest" onChange={onChange} options={OPTS} />);
    const cb = screen.getByRole('combobox', { name: 'Rok' });
    fireEvent.click(cb);
    const options = screen.getAllByRole('option');
    expect(options[1].getAttribute('aria-selected')).toBe('true');
    fireEvent.click(options[2]);
    expect(onChange).toHaveBeenCalledWith('sympathizer');
  });

  it('disabled → nie otwiera się i nie jest w kolejności Tab', () => {
    render(<CustomSelect label="Status" value="member" onChange={() => {}} options={OPTS} disabled />);
    const cb = screen.getByRole('combobox');
    expect(cb.getAttribute('tabindex')).toBe('-1');
    fireEvent.click(cb);
    fireEvent.keyDown(cb, { key: 'Enter' });
    expect(cb.getAttribute('aria-expanded')).toBe('false');
  });
});
