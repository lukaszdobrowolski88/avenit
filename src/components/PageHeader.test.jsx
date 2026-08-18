import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import PageHeader from './PageHeader';
import { Gift } from 'lucide-react';

// Sterowana okładka — domyślnie brak (czysty nagłówek), test może ją włączyć.
let _cover = null;
vi.mock('../hooks/useModuleLabel', () => ({
  useModuleLabel: (_k, fallback) => fallback,
  useModuleColor: () => null,
  useModuleCover: () => _cover,
}));
// CoverPicker zależy od kontekstu uprawnień/supabase — w teście PageHeader nieistotny.
vi.mock('./CoverPicker', () => ({ default: () => null }));

describe('PageHeader', () => {
  beforeEach(() => { _cover = null; });

  it('renderuje tytuł, podtytuł i akcje', () => {
    render(<PageHeader icon={Gift} title="Dawanie" subtitle="opis" actions={<button>Akcja</button>} />);
    expect(screen.getByRole('heading', { name: 'Dawanie' })).toBeTruthy();
    expect(screen.getByText('opis')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Akcja' })).toBeTruthy();
  });

  it('DOMYŚLNIE: czysto — bez banera/obwódki, tytuł 3xl', () => {
    const { container } = render(<PageHeader icon={Gift} title="X" />);
    expect(container.querySelector('h1').className).toContain('sm:text-3xl');
    expect(container.querySelector('.ring-4')).toBeNull(); // brak okładki → brak obwódki nad banerem
  });

  it('z ustawioną okładką: pojawia się baner + obwódka ikony (ring-4)', () => {
    _cover = { type: 'color', value: '#334155' };
    const { container } = render(<PageHeader icon={Gift} title="X" />);
    expect(container.querySelector('.ring-4')).toBeTruthy();
  });

  it('cover=false → wariant kompaktowy (bez obwódki ring-4)', () => {
    const { container } = render(<PageHeader icon={Gift} title="X" cover={false} />);
    expect(container.querySelector('.ring-4')).toBeNull();
  });
});
