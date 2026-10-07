import { describe, it, expect, vi } from 'vitest';
import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VirtualKeypad from './VirtualKeypad';
import { CODE_KEYPAD_ROWS } from '../utils/kiosk';

function Harness({ rows, onValue, maxLength = 4 }) {
  const [v, setV] = useState('');
  return (
    <VirtualKeypad
      value={v}
      rows={rows}
      maxLength={maxLength}
      onChange={(next) => { setV(next); onValue?.(next); }}
    />
  );
}

describe('VirtualKeypad', () => {
  it('na klawiaturze kodu „C” to litera, a czyszczenie to osobny klawisz', async () => {
    const onValue = vi.fn();
    render(<Harness rows={CODE_KEYPAD_ROWS} onValue={onValue} />);
    await userEvent.click(screen.getByRole('button', { name: 'C' }));
    await userEvent.click(screen.getByRole('button', { name: '7' }));
    expect(onValue).toHaveBeenLastCalledWith('C7');
    await userEvent.click(screen.getByRole('button', { name: 'Wyczyść' }));
    expect(onValue).toHaveBeenLastCalledWith('');
  });

  it('obsługuje fizyczną klawiaturę: małe litery, Backspace i limit długości', () => {
    const onValue = vi.fn();
    render(<Harness rows={CODE_KEYPAD_ROWS} onValue={onValue} />);
    fireEvent.keyDown(window, { key: 'k' });
    fireEvent.keyDown(window, { key: '7' });
    fireEvent.keyDown(window, { key: 'B' }); // spoza alfabetu kodów — ignorowane
    expect(onValue).toHaveBeenLastCalledWith('K7');
    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(onValue).toHaveBeenLastCalledWith('K');
    ['H', 'X', 'Y', 'A'].forEach((key) => fireEvent.keyDown(window, { key }));
    expect(onValue).toHaveBeenLastCalledWith('KHXY');
  });

  it('domyślnie numeryczna, z przyciskiem cofania', async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    await userEvent.click(screen.getByRole('button', { name: '1' }));
    await userEvent.click(screen.getByRole('button', { name: '2' }));
    await userEvent.click(screen.getByRole('button', { name: 'Usuń ostatni znak' }));
    expect(onValue).toHaveBeenLastCalledWith('1');
  });
});
