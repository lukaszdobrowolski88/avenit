import { useEffect, useRef } from 'react';

// Fokus w oknie modalnym (WCAG 2.1.2 / 2.4.3):
//  • przy otwarciu fokus trafia do okna ([data-autofocus] → element już sfokusowany w oknie,
//    np. pole z autoFocus → wskazany element startowy → sam panel z tabIndex=-1),
//  • Tab / Shift+Tab krążą tylko po elementach okna (najwyżej leżącego, gdy okna się zagnieżdżają),
//  • po zamknięciu fokus wraca na element, który okno otworzył.
// Panele wybieraków (listy, kalendarz — portale poza oknem) obsługują Tab same.
const FOCUSABLE = [
  'a[href]', 'area[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', 'iframe', 'audio[controls]', 'video[controls]',
  '[contenteditable="true"]', '[tabindex]:not([tabindex="-1"])',
].join(',');
const POPOVER_SEL = '.portal-dropdown-select, .portal-datepicker, .portal-timepicker, [data-popover]';

const trapStack = [];

function visible(el) {
  return typeof el.getClientRects !== 'function' || el.getClientRects().length > 0;
}

export function getFocusable(root) {
  if (!root) return [];
  const all = Array.from(root.querySelectorAll(FOCUSABLE))
    .filter((el) => !el.closest('[inert]') && el.getAttribute('aria-hidden') !== 'true');
  const shown = all.filter(visible);
  // Środowisko bez layoutu (testy) — nic nie ma wymiarów; wtedy bierzemy wszystkie.
  return shown.length ? shown : all;
}

function safeFocus(el) {
  try { el?.focus?.({ preventScroll: true }); } catch { /* ignore */ }
}

// panelRef — kontener okna (powinien mieć tabIndex={-1}); initialRef — opcjonalny element startowy.
export function useFocusTrap(panelRef, active, { initialRef = null, restoreFocus = true } = {}) {
  // Element-wywołujący zapamiętany już w renderze otwierającym: pole z autoFocus w oknie
  // przejmuje fokus w fazie commit, czyli zanim zadziała jakikolwiek efekt.
  const openerRef = useRef(null);
  const wasActive = useRef(false);
  if (active && !wasActive.current && typeof document !== 'undefined') openerRef.current = document.activeElement;
  wasActive.current = Boolean(active);

  useEffect(() => {
    if (!active) return undefined;
    const panel = panelRef.current;
    if (!panel || typeof document === 'undefined') return undefined;
    const token = {};
    trapStack.push(token);
    const opener = openerRef.current && !panel.contains(openerRef.current) ? openerRef.current : null;

    // Fokus startowy — chyba że dziecko (autoFocus / własny efekt) już ustawiło go w oknie.
    if (!panel.contains(document.activeElement)) {
      const target = panel.querySelector('[data-autofocus]') || initialRef?.current || panel;
      safeFocus(target);
    }

    const onKey = (e) => {
      if (e.key !== 'Tab' || e.defaultPrevented) return;
      if (trapStack[trapStack.length - 1] !== token) return;
      const current = document.activeElement;
      if (current && !panel.contains(current) && current.closest?.(POPOVER_SEL)) return;
      const items = getFocusable(panel);
      if (!items.length) { e.preventDefault(); safeFocus(panel); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (!panel.contains(current)) { e.preventDefault(); safeFocus(e.shiftKey ? last : first); return; }
      if (e.shiftKey && (current === first || current === panel)) { e.preventDefault(); safeFocus(last); }
      else if (!e.shiftKey && current === last) { e.preventDefault(); safeFocus(first); }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      const i = trapStack.lastIndexOf(token);
      if (i !== -1) trapStack.splice(i, 1);
      if (!restoreFocus || !opener || !opener.isConnected) return;
      // Nie odbieraj fokusu, jeśli coś innego już go świadomie przejęło.
      const now = document.activeElement;
      if (!now || now === document.body || panel.contains(now) || !now.isConnected) safeFocus(opener);
    };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
}
