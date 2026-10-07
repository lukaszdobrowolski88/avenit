import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../../lib/supabase', () => ({ supabase: { functions: { invoke: vi.fn(async () => ({ error: null })) } } }));
vi.mock('../../../components/CustomSelect', () => ({
  default: ({ value, onChange, options }) => (
    <select data-testid="custom-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
}));

import SecuritySettings from './SecuritySettings';

const setup = (values = {}) => {
  const save = vi.fn();
  const get = (k) => values[k];
  render(<SecuritySettings get={get} save={save} roles={[{ key: 'czlonek', label: 'Członek' }]} campuses={[]} />);
  return { save };
};

describe('SecuritySettings (Bezpieczeństwo i logowanie)', () => {
  it('pokazuje stan realnego klucza require_2fa_all i zapisuje go jako on/off', () => {
    const { save } = setup({ require_2fa_all: 'on' });
    const sw = screen.getByRole('switch', { name: 'Wymagaj weryfikacji dwuetapowej od wszystkich' });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(sw);
    expect(save).toHaveBeenCalledWith('require_2fa_all', 'off');
  });

  it('2FA dla administratorów zapisuje require_2fa_admins (nie sec_*)', () => {
    const { save } = setup({});
    fireEvent.click(screen.getByRole('switch', { name: 'Wymagaj weryfikacji dwuetapowej od administratorów' }));
    expect(save).toHaveBeenCalledWith('require_2fa_admins', 'on');
    expect(save.mock.calls.some(([k]) => String(k).startsWith('sec_'))).toBe(false);
  });

  it('nie ma już martwej opcji automatycznego wylogowania', () => {
    setup({});
    expect(screen.queryByText(/Automatyczne wylogowanie/)).toBeNull();
  });

  it('ostrzega, gdy SSO tworzy konta każdemu, i proponuje zatwierdzanie (bez zmiany ustawień)', () => {
    const { save } = setup({ sso_google_enabled: 'on', sso_auto_provision: 'on' });
    expect(screen.getByRole('alert').textContent).toMatch(/może teraz sama założyć konto/);
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Wymagaj zatwierdzenia' }));
    expect(save).toHaveBeenCalledWith('sso_provision_approval', 'on');
  });

  it('bez ostrzeżenia, gdy domeny są ograniczone', () => {
    setup({ sso_google_enabled: 'on', sso_auto_provision: 'on', sso_allowed_domains: 'schwro.pl' });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
