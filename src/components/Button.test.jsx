import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
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

  it('danger nie używa gradientu marki (czerwień o kontraście ≥ 4,5:1)', () => {
    render(<Button variant="danger">Usuń</Button>);
    const cls = screen.getByRole('button').className;
    expect(cls).toContain('bg-red-600');
    expect(cls).not.toContain('from-accent-primary');
  });

  it('onClick zwracający Promise blokuje przycisk do rozstrzygnięcia (bez podwójnego zapisu)', async () => {
    let resolve;
    const onClick = vi.fn(() => new Promise((r) => { resolve = r; }));
    render(<Button onClick={onClick}>Zapisz</Button>);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    fireEvent.click(btn); // drugi klik w tej samej chwili
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-busy')).toBe('true');
    await act(async () => { resolve(); });
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute('aria-busy')).toBeNull();
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('odrzucony Promise też zdejmuje blokadę', async () => {
    let reject;
    const onClick = () => new Promise((_, r) => { reject = r; }).catch(() => {});
    render(<Button onClick={onClick}>Zapisz</Button>);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(btn.disabled).toBe(true);
    await act(async () => { reject(new Error('x')); });
    expect(btn.disabled).toBe(false);
  });

  it('jawne loading={false} wyłącza automatyczną blokadę (steruje wywołujący)', () => {
    const onClick = vi.fn(() => new Promise(() => {}));
    render(<Button loading={false} onClick={onClick}>Zapisz</Button>);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('synchroniczny onClick nie blokuje przycisku', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>X</Button>);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(btn.disabled).toBe(false);
  });
});
