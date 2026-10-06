import { useEffect, useState } from 'react';

// Pozycja panelu (portal w <body>) przyklejonego do pola: pod polem, a gdy brak miejsca — nad nim.
// Współrzędne „fixed” (viewport), przeliczane przy przewijaniu i zmianie rozmiaru okna.
export function useAnchoredPopover(anchorRef, open, { height = 300, width = 280 } = {}) {
  const [pos, setPos] = useState(null);

  useEffect(() => {
    if (!open || !anchorRef.current) { setPos(null); return undefined; }
    const update = () => {
      const r = anchorRef.current.getBoundingClientRect();
      const below = window.innerHeight - r.bottom;
      const up = below < height + 12 && r.top > below;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      setPos(up ? { left, bottom: window.innerHeight - r.top + 6, width: r.width } : { left, top: r.bottom + 6, width: r.width });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, anchorRef, height, width]);

  return pos;
}

// Zamknięcie po kliknięciu poza polem i panelem (panel to osobny portal — sprawdzamy oba).
export function useOutsideClose(open, refs, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (refs.some((r) => r.current && r.current.contains(e.target))) return;
      onClose();
    };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, refs, onClose]);
}

// Kliknięcia w panelu wybieraka nie mogą zamykać okienek, w których leży pole (np. Popover
// w Projektach nasłuchuje „mousedown” na document) — zatrzymujemy je na korzeniu panelu.
export const stopOutside = { onMouseDown: (e) => e.stopPropagation() };
