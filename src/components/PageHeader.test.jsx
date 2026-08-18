import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PageHeader from './PageHeader';
import { Gift } from 'lucide-react';

// Hooki modułu (baza) — mock, by test był czysto jednostkowy.
vi.mock('../hooks/useModuleLabel', () => ({
  useModuleLabel: (_k, fallback) => fallback,
  useModuleColor: () => null,
  useModuleCover: () => null,
}));
// CoverPicker zależy od kontekstu uprawnień/supabase — w teście PageHeader nieistotny.
vi.mock('./CoverPicker', () => ({ default: () => null }));

describe('PageHeader', () => {
  it('renderuje tytuł, podtytuł i akcje', () => {
    render(<PageHeader icon={Gift} title="Dawanie" subtitle="opis" actions={<button>Akcja</button>} />);
    expect(screen.getByRole('heading', { name: 'Dawanie' })).toBeTruthy();
    expect(screen.getByText('opis')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Akcja' })).toBeTruthy();
  });

  it('wariant z okładką ma większy tytuł (3xl) i obwódkę ikony', () => {
    const { container } = render(<PageHeader icon={Gift} title="X" />);
    expect(container.querySelector('h1').className).toContain('sm:text-3xl');
    expect(container.querySelector('.ring-4')).toBeTruthy(); // ikona z obwódką nad okładką
  });

  it('cover=false → wariant kompaktowy (bez obwódki ring-4)', () => {
    const { container } = render(<PageHeader icon={Gift} title="X" cover={false} />);
    expect(container.querySelector('.ring-4')).toBeNull();
  });
});
