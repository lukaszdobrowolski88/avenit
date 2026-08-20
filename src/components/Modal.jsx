import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// Kanoniczny Modal. Dwa tryby (kompatybilne wstecznie):
//  • CIENKI (bez onClose) — tylko portal + `fixed inset-0 z-[100]`. Dzieci dostarczają
//    własny backdrop/panel. Zachowanie jak dotąd (29 istniejących użyć).
//  • BOGATY (z onClose) — pełny shell: backdrop (klik = zamknij) + Esc + wyśrodkowany panel
//    (rounded-2xl, border, shadow-xl, dark mode) + opcjonalny nagłówek z „X". Kanon audytu
//    zamiast ~92 ręcznych nakładek bez klawiatury.
//      <Modal isOpen onClose={fn} title="Tytuł" size="md">…treść (+ stopka)…</Modal>
const SIZES = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', full: 'max-w-6xl' };

export default function Modal({ isOpen, onClose, title, size = 'md', className = '', children }) {
  useEffect(() => {
    if (!isOpen || !onClose) return;
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined' || !document.body) return null;

  // Tryb cienki — bez zmian względem poprzedniej wersji.
  if (!onClose) {
    return createPortal(<div className={`fixed inset-0 z-[100] ${className}`}>{children}</div>, document.body);
  }

  // Tryb bogaty — wspólny shell.
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full ${SIZES[size] || SIZES.md} max-h-[90vh] overflow-y-auto custom-scrollbar bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl animate-in fade-in zoom-in-95 duration-150 ${className}`}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-900 rounded-t-2xl z-10">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate pr-2">{title}</h2>
            <button onClick={onClose} aria-label="Zamknij"
              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition shrink-0">
              <X size={18} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body
  );
}
