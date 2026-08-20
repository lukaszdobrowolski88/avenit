import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import Modal from './Modal';

describe('Modal', () => {
  it('zamknięty → nic nie renderuje', () => {
    render(<Modal isOpen={false}><p>x</p></Modal>);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('tryb CIENKI (bez onClose) → portal fixed inset-0, bez dialogu (kompatybilność wsteczna)', () => {
    render(<Modal isOpen className="z-test"><p>cienki</p></Modal>);
    expect(document.querySelector('.fixed.inset-0')).toBeTruthy();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.textContent).toContain('cienki');
  });

  it('tryb BOGATY (onClose) → dialog + tytuł + X; Esc i przycisk zamykają', () => {
    const onClose = vi.fn();
    render(<Modal isOpen onClose={onClose} title="Tytuł"><p>tresc</p></Modal>);
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    expect(document.body.textContent).toContain('Tytuł');
    expect(document.body.textContent).toContain('tresc');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(document.querySelector('button[aria-label="Zamknij"]'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
