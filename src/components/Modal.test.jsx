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

  it('stopka i podtytuł → nagłówek + przewijana treść + stopka', () => {
    render(<Modal isOpen onClose={() => {}} title="T" subtitle="pod" footer={<button>Zapisz</button>}><p>tresc</p></Modal>);
    expect(document.querySelector('.modal-head').textContent).toContain('pod');
    expect(document.querySelector('.modal-body').textContent).toContain('tresc');
    expect(document.querySelector('.modal-foot').textContent).toContain('Zapisz');
  });

  it('zagnieżdżone okna → Esc zamyka tylko górne; Esc obsłużony przez listę (preventDefault) nie zamyka okna', () => {
    const outer = vi.fn();
    const inner = vi.fn();
    render(<><Modal isOpen onClose={outer} title="A"><p>a</p></Modal><Modal isOpen onClose={inner} title="B"><p>b</p></Modal></>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    ev.preventDefault();
    document.dispatchEvent(ev);
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it('closeOnBackdrop={false} → klik w tło nie zamyka', () => {
    const onClose = vi.fn();
    render(<Modal isOpen onClose={onClose} title="T" closeOnBackdrop={false}><p>x</p></Modal>);
    fireEvent.click(document.querySelector('.backdrop-blur-sm'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('przerysowanie okna-rodzica z nowym onClose nie przesuwa go nad okno-dziecko', () => {
    const outer = vi.fn();
    const inner = vi.fn();
    const ui = (n) => <><Modal isOpen onClose={() => outer(n)} title="A"><p>a</p></Modal><Modal isOpen onClose={inner} title="B"><p>b</p></Modal></>;
    const { rerender } = render(ui(1));
    rerender(ui(2));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });
});
