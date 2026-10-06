import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../../lib/supabase', () => ({ supabase: { auth: { signOut: vi.fn() } } }));

import { KioskStartDialog, KioskShell } from './KioskMode';
import { hashPin } from '../utils/kiosk';

const typePin = async (digits) => {
  for (const d of digits) {
    // eslint-disable-next-line no-await-in-loop
    await userEvent.click(screen.getByRole('button', { name: d }));
  }
};

describe('KioskStartDialog', () => {
  it('wymaga dwukrotnego PIN-u i przekazuje tylko jego skrót', async () => {
    const onStart = vi.fn();
    render(<KioskStartDialog isOpen onClose={() => {}} onStart={onStart} />);
    const startBtn = screen.getByRole('button', { name: /Włącz tryb kiosku/ });
    expect(startBtn.disabled).toBe(true);

    await typePin('1234');
    await typePin('9999');
    expect(screen.getByRole('alert').textContent).toMatch(/różnią/);
    expect(startBtn.disabled).toBe(true);

    await typePin('1234');
    await typePin('1234');
    expect(startBtn.disabled).toBe(false);
    await userEvent.click(startBtn);
    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(1));
    const state = onStart.mock.calls[0][0];
    expect(state.active).toBe(true);
    expect(Object.values(state)).not.toContain('1234');
    expect(Object.keys(state).sort()).toEqual(['active', 'pinHash', 'salt', 'startedAt']);
    expect(state.pinHash).toBe(await hashPin('1234', state.salt));
  });
});

describe('KioskShell', () => {
  it('wyjście wymaga poprawnego PIN-u', async () => {
    const salt = 'sól';
    const kioskState = { active: true, salt, pinHash: await hashPin('4321', salt) };
    const onExit = vi.fn();
    render(
      <KioskShell kioskState={kioskState} screen="checkin" onScreenChange={() => {}} onExit={onExit} onIdle={() => {}}>
        <div>Treść kiosku</div>
      </KioskShell>,
    );
    expect(screen.getByText('Treść kiosku')).toBeTruthy();
    // Brak nawigacji aplikacji — tylko meldowanie / odbiór / zakończenie.
    expect(screen.queryByText('Ustawienia')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Zakończ tryb kiosku' }));
    await typePin('1111');
    await waitFor(() => expect(screen.getByText('Nieprawidłowy PIN.')).toBeTruthy());
    expect(onExit).not.toHaveBeenCalled();

    await typePin('4321');
    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
  });
});
