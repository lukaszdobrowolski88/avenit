import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import CoverPicker from './CoverPicker';

// Bramka okładki = useCan('module:settings'). Sterujemy nią z testu.
let _can = true;
vi.mock('./Can', () => ({ useCan: () => _can }));
vi.mock('../lib/supabase', () => ({ supabase: {} }));
vi.mock('../hooks/useModuleLabel', () => ({ invalidateModuleLabels: () => {} }));
vi.mock('../lib/toast', () => ({ toast: { error() {}, success() {} } }));

describe('CoverPicker (bramka „Zmień okładkę")', () => {
  beforeEach(() => { _can = true; });

  it('pokazuje „Zmień okładkę" gdy user ma module:settings (np. rada_starszych)', () => {
    render(<CoverPicker moduleKey="programs" />);
    expect(screen.getByRole('button', { name: /Zmień okładkę/i })).toBeTruthy();
  });

  it('ukrywa się gdy brak uprawnienia (członek)', () => {
    _can = false;
    const { container } = render(<CoverPicker moduleKey="programs" />);
    expect(container.firstChild).toBeNull();
  });

  it('ukrywa się bez moduleKey (nie ma czego edytować)', () => {
    const { container } = render(<CoverPicker moduleKey={undefined} />);
    expect(container.firstChild).toBeNull();
  });
});
