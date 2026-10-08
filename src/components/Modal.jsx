import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { tr } from '../i18n';
import { useFocusTrap } from './ui/useFocusTrap';

// Kanoniczny Modal. Dwa tryby (kompatybilne wstecznie):
//  • CIENKI (bez onClose) — tylko portal + `fixed inset-0 z-[100]`. Dzieci dostarczają
//    własny backdrop/panel.
//  • BOGATY (z onClose) — pełny shell: backdrop (klik = zamknij) + Esc + wyśrodkowany panel.
//    Z tytułem/stopką panel ma stały układ: nagłówek (tytuł, podtytuł, X) → przewijana treść →
//    stopka z przyciskami (Anuluj po lewej od akcji głównej). Treść daje własny padding:
//      <Modal isOpen onClose={close} title="Nowa sesja" size="md"
//             footer={<><Button variant="secondary" onClick={close}>Anuluj</Button><Button onClick={save}>Zapisz</Button></>}>
//        <div className="p-6 space-y-4">…pola…</div>
//      </Modal>
//    Bez tytułu i stopki — dzieci trafiają wprost do panelu (stary układ, np. Boards ItemPanel).
//  zIndex — gdy okno musi leżeć nad innym oknem z wyższą warstwą; closeOnBackdrop={false} —
//  klik w tło nie zamyka (formularze, w których łatwo stracić dane).
//  Dostępność (tryb bogaty): przy otwarciu fokus przechodzi do okna (pole z autoFocus albo
//  element z `data-autofocus` ma pierwszeństwo), Tab/Shift+Tab nie wychodzą poza okno, po
//  zamknięciu fokus wraca na przycisk, który je otworzył; tytuł jest nazwą okna (aria-labelledby).
const SIZES = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', full: 'max-w-6xl' };

// Esc zamyka tylko najwyżej leżące okno (okna potrafią się zagnieżdżać).
const openStack = [];

export default function Modal({
  isOpen, onClose, title, subtitle, icon: Icon, footer, size = 'md', className = '',
  bodyClassName = '', zIndex, closeOnBackdrop = true, header, ariaLabel, children,
}) {
  const id = useId();
  // onClose przez ref: funkcja podana inline zmienia się przy każdym renderze rodzica, a ponowne
  // zarejestrowanie przesuwałoby okno na szczyt stosu (Esc zamknąłby nie to okno).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const closable = Boolean(onClose);
  const panelRef = useRef(null);
  useFocusTrap(panelRef, Boolean(isOpen && closable));
  useEffect(() => {
    if (!isOpen || !closable) return undefined;
    openStack.push(id);
    // Na window (nie document): wybieraki/listy w oknie obsługują Esc na document wcześniej
    // i oznaczają je preventDefault — wtedy Esc zamyka tylko listę, nie całe okno.
    const h = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (openStack[openStack.length - 1] !== id) return;
      closeRef.current?.();
    };
    window.addEventListener('keydown', h);
    return () => {
      window.removeEventListener('keydown', h);
      const i = openStack.lastIndexOf(id);
      if (i !== -1) openStack.splice(i, 1);
    };
  }, [isOpen, closable, id]);

  if (!isOpen || typeof document === 'undefined' || !document.body) return null;

  // Tryb cienki — bez zmian względem poprzedniej wersji.
  if (!onClose) {
    return createPortal(<div className={`fixed inset-0 z-[100] ${className}`}>{children}</div>, document.body);
  }

  // header — własny nagłówek zamiast tytułu (np. panel zadania: ścieżka + akcje); zamykanie i
  // przycisk X dostarcza wtedy wołający. ariaLabel nazywa okno, gdy nie ma tytułu.
  const structured = Boolean(title || footer || header);
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={zIndex ? { zIndex } : undefined}>
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={closeOnBackdrop ? onClose : undefined}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby={title ? `${id}-title` : undefined}
        aria-label={title ? undefined : ariaLabel}
        className={`modal-panel outline-none relative w-full ${SIZES[size] || SIZES.md} max-h-[90vh] bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl animate-in fade-in zoom-in-95 duration-150 ${structured ? 'flex flex-col overflow-hidden' : 'overflow-y-auto custom-scrollbar'} ${className}`}
      >
        {header ? (
          <div className="modal-head shrink-0 border-b border-gray-200 dark:border-gray-700">{header}</div>
        ) : title && (
          <div className="modal-head shrink-0 flex items-start gap-3 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            {Icon && (
              <div data-tone={1} className="w-9 h-9 rounded-full bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light flex items-center justify-center shrink-0">
                <Icon size={18} />
              </div>
            )}
            <div className="min-w-0 flex-1 self-center">
              <h2 id={`${id}-title`} className="text-lg font-bold text-gray-900 dark:text-white truncate">{title}</h2>
              {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label={tr('Zamknij')}
              className="p-2 -mr-2 -my-0.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 transition shrink-0">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        )}
        {structured ? (
          <div className={`modal-body flex-1 min-h-0 overflow-y-auto custom-scrollbar ${bodyClassName}`}>{children}</div>
        ) : children}
        {footer && (
          <div className="modal-foot shrink-0 flex flex-wrap items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
