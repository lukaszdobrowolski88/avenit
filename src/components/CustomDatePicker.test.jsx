import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CustomDatePicker from './CustomDatePicker';
import Modal from './Modal';

beforeAll(() => {
  Element.prototype.getBoundingClientRect = function () {
    return { top: 10, bottom: 40, left: 10, right: 210, width: 200, height: 30, x: 10, y: 10, toJSON() {} };
  };
});

describe('CustomDatePicker (klawiatura)', () => {
  it('pole jest osiągalne Tabem i nazwane etykietą + wartością', () => {
    render(<CustomDatePicker label="Data urodzenia" value="2026-10-06" onChange={() => {}} />);
    const field = screen.getByRole('button', { name: /Data urodzenia/ });
    expect(field.getAttribute('tabindex')).toBe('0');
    expect(field.getAttribute('aria-expanded')).toBe('false');
  });

  it('Enter otwiera, fokus na wybranym dniu, strzałki przesuwają, Enter wybiera i oddaje fokus polu', () => {
    const onChange = vi.fn();
    render(<CustomDatePicker label="Data" value="2026-10-06" onChange={onChange} />);
    const field = screen.getByRole('button', { name: /Data/ });
    field.focus();
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(field.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement.getAttribute('data-ymd')).toBe('2026-10-06');
    fireEvent.keyDown(document.activeElement, { key: 'ArrowRight' });
    expect(document.activeElement.getAttribute('data-ymd')).toBe('2026-10-07');
    fireEvent.keyDown(document.activeElement, { key: 'ArrowDown' });
    expect(document.activeElement.getAttribute('data-ymd')).toBe('2026-10-14');
    fireEvent.keyDown(document.activeElement, { key: 'PageDown' });
    expect(document.activeElement.getAttribute('data-ymd')).toBe('2026-11-14');
    fireEvent.click(document.activeElement);
    expect(onChange).toHaveBeenCalledWith('2026-11-14');
    expect(document.activeElement).toBe(field);
  });

  it('strzałki miesiąca mają nazwy', () => {
    render(<CustomDatePicker label="Data" value="2026-10-06" onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Data/ }));
    expect(screen.getByRole('button', { name: 'Poprzedni miesiąc' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Następny miesiąc' })).toBeTruthy();
  });

  it('Esc w otwartym kalendarzu zamyka tylko kalendarz, nie okno z formularzem', () => {
    const onClose = vi.fn();
    render(<Modal isOpen onClose={onClose} title="Nowa osoba"><CustomDatePicker label="Data" value="" onChange={() => {}} /></Modal>);
    const field = screen.getByRole('button', { name: /Data/ });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(field.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(field.getAttribute('aria-expanded')).toBe('false');
    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(field);
  });
});
