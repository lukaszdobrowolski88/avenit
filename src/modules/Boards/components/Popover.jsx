import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

// Lekki popover zakotwiczony do elementu wyzwalającego (portal do body).
// Zamyka się po kliknięciu poza i przy Escape. Używany do edytorów komórek.
export default function Popover({ trigger, children, className = '', width, onOpenChange, align = 'left' }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const popRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, minWidth: 0 });

  useEffect(() => { onOpenChange && onOpenChange(open); }, [open]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const update = () => {
      const rect = triggerRef.current.getBoundingClientRect();
      const popH = popRef.current?.offsetHeight || 280;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < popH && rect.top > spaceBelow;
      const left = align === 'right' ? rect.right - (width || rect.width) : rect.left;
      setCoords({
        top: openUp ? rect.top - (popH + 4) : rect.bottom + 4,
        left: Math.max(8, left),
        minWidth: width || rect.width,
      });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, width, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <div ref={triggerRef} onClick={() => setOpen(o => !o)} className="w-full h-full cursor-pointer">
        {typeof trigger === 'function' ? trigger(open) : trigger}
      </div>
      {open && createPortal(
        <div
          ref={popRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left, minWidth: coords.minWidth, zIndex: 200 }}
          className={`bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 ${className}`}
        >
          {typeof children === 'function' ? children({ close: () => setOpen(false) }) : children}
        </div>,
        document.body
      )}
    </>
  );
}
