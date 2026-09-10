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

  it('DOMYŚLNIE: baner zawsze — tytuł biały na banerze (wariant gradient)', () => {
    const { container } = render(<PageHeader icon={Gift} title="X" />);
    const h1 = container.querySelector('h1');
    expect(h1.className).toContain('text-white');       // tytuł na banerze = biały
    expect(h1.className).not.toContain('text-gray-900'); // nie wariant jasny/kompaktowy
    expect(container.querySelector('.backdrop-blur-md')).toBeNull(); // gradient, nie glass
  });

  it('styl glass: matowy pasek (backdrop-blur) pod tytułem', () => {
    _cover = { type: 'color', value: '#334155', style: 'glass' };
    const { container } = render(<PageHeader icon={Gift} title="X" />);
    expect(container.querySelector('.backdrop-blur-md')).toBeTruthy();
    expect(container.querySelector('h1').className).toContain('text-white');
  });

  it('cover=false → wariant kompaktowy (tytuł ciemny, bez banera)', () => {
    const { container } = render(<PageHeader icon={Gift} title="X" cover={false} />);
    expect(container.querySelector('h1').className).toContain('text-gray-900');
    expect(container.querySelector('.backdrop-blur-md')).toBeNull();
  });
});
