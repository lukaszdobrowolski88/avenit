import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Button from './Button';

describe('Button', () => {
  it('renderuje dzieci i reaguje na klik', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Zapisz</Button>);
    const btn = screen.getByRole('button', { name: 'Zapisz' });
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('variant primary ma gradient marki', () => {
    render(<Button>X</Button>);
    expect(screen.getByRole('button').className).toContain('from-accent-primary');
  });

  it('loading blokuje przycisk i nie klika', async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Wyślij</Button>);
    const btn = screen.getByRole('button');
    expect(btn.disabled).toBe(true);
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('danger nie używa gradientu marki', () => {
    render(<Button variant="danger">Usuń</Button>);
    const cls = screen.getByRole('button').className;
    expect(cls).toContain('bg-red-500');
    expect(cls).not.toContain('from-accent-primary');
  });
});
