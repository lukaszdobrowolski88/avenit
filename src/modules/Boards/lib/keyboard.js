// Skróty klawiaturowe tablicy (n — nowe zadanie, / — szukaj, Esc — zamknij/wyczyść zaznaczenie).
// Nie działają podczas pisania, gdy otwarte jest okno (Modal/dialog) albo lista wyboru (popover)
// i gdy wciśnięto modyfikator (Ctrl/⌘/Alt — skróty przeglądarki).

const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image']);

export function isTypingTarget(el) {
  if (!el || typeof el !== 'object') return false;
  if (el.isContentEditable) return true;
  const tag = String(el.tagName || '').toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') return !NON_TEXT_INPUTS.has(String(el.type || 'text').toLowerCase());
  return false;
}

export function overlayOpen(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc) return false;
  return !!doc.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"], [data-popover], [role="menu"]');
}

export function shortcutBlocked(e, doc) {
  if (!e || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return true;
  if (isTypingTarget(e.target)) return true;
  return overlayOpen(doc);
}
