import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// UXA-06: zaznaczenie obecności nie może udawać sukcesu, a „Wyczyść” musi pytać.
const h = vi.hoisted(() => ({
  insertResult: { error: null },
  deleteResult: { error: null },
  selectData: [],
  calls: [],
  toastError: null,
  confirm: null,
}));

vi.mock('../lib/supabase', () => {
  const builder = () => {
    let op = 'select';
    const b = {
      select() { return b; },
      eq() { return b; },
      in() { return b; },
      insert(rows) { op = 'insert'; h.calls.push(['insert', rows]); return b; },
      delete() { op = 'delete'; h.calls.push(['delete']); return b; },
      then(res, rej) {
        const r = op === 'insert' ? h.insertResult : op === 'delete' ? h.deleteResult : { data: h.selectData, error: null };
        return Promise.resolve(r).then(res, rej);
      },
    };
    return b;
  };
  return { supabase: { from: () => builder() } };
});
vi.mock('../lib/toast', () => ({ toast: { error: (...a) => h.toastError(...a), success() {}, info() {} } }));
vi.mock('../lib/dialog', () => ({ confirmDialog: (...a) => h.confirm(...a) }));
vi.mock('../components/CustomDatePicker', () => ({ default: () => null }));
vi.mock('../i18n', () => ({
  tr: (k, v) => String(k).replace(/\{(\w+)\}/g, (_, n) => (v && v[n] != null ? v[n] : `{${n}}`)),
  appLocale: () => 'pl-PL',
}));

import AttendanceTab from './AttendanceTab';

const members = [{ id: 1, first_name: 'Jan', last_name: 'Kowalski' }];

describe('AttendanceTab', () => {
  beforeEach(() => {
    h.insertResult = { error: null };
    h.deleteResult = { error: null };
    h.selectData = [];
    h.calls = [];
    h.toastError = vi.fn();
    h.confirm = vi.fn(async () => false);
  });

  it('błąd zapisu: osoba NIE jest oznaczona jako obecna i pojawia się komunikat', async () => {
    h.insertResult = { error: { message: 'forbidden', code: '403' } };
    render(<AttendanceTab members={members} />);
    const tile = await screen.findByRole('button', { name: /Jan Kowalski/ });
    fireEvent.click(tile);
    await waitFor(() => expect(h.toastError).toHaveBeenCalled());
    expect(tile.getAttribute('aria-pressed')).toBe('false');
  });

  it('udany zapis: osoba oznaczona jako obecna', async () => {
    render(<AttendanceTab members={members} />);
    const tile = await screen.findByRole('button', { name: /Jan Kowalski/ });
    fireEvent.click(tile);
    await waitFor(() => expect(tile.getAttribute('aria-pressed')).toBe('true'));
    expect(h.toastError).not.toHaveBeenCalled();
  });

  it('„Wyczyść” pyta o potwierdzenie i bez zgody niczego nie kasuje', async () => {
    h.selectData = [{ member_id: 1 }];
    render(<AttendanceTab members={members} />);
    const tile = await screen.findByRole('button', { name: /Jan Kowalski/ });
    await waitFor(() => expect(tile.getAttribute('aria-pressed')).toBe('true'));
    fireEvent.click(screen.getByRole('button', { name: 'Wyczyść' }));
    await waitFor(() => expect(h.confirm).toHaveBeenCalled());
    expect(h.calls.some(([op]) => op === 'delete')).toBe(false);
  });
});
