import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

// Małe menu akcji (⋯) dla wydarzenia w grafiku. Lista w portalu (position: fixed), żeby nie
// ucinała jej przewijana siatka. Klawiatura: Enter/↓ otwiera, ↑/↓ po pozycjach, Esc zamyka.
// items: [{ key, icon, label, hint?, onClick, disabled?, danger? } | { divider: true }]
export default function ActionMenu({ items, label, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const listRef = useRef(null);

  const close = useCallback((focus) => { setOpen(false); if (focus) btnRef.current?.focus(); }, []);

  useEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = 264;
      const left = align === 'right' ? Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8)) : Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      const below = window.innerHeight - r.bottom > 300 || r.top < 300;
      setPos({ left, width, ...(below ? { top: r.bottom + 4 } : { bottom: window.innerHeight - r.top + 4 }) });
    };
    place();
    const onDown = (e) => { if (!btnRef.current?.contains(e.target) && !listRef.current?.contains(e.target)) close(false); };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, align, close]);

  useEffect(() => {
    if (open && pos) listRef.current?.querySelector('[role="menuitem"]:not([aria-disabled="true"])')?.focus({ preventScroll: true });
  }, [open, pos]);

  const onKeyDown = (e) => {
    const els = Array.from(listRef.current?.querySelectorAll('[role="menuitem"]:not([aria-disabled="true"])') || []);
    const i = els.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); els[Math.min(els.length - 1, i + 1)]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); els[Math.max(0, i - 1)]?.focus(); }
    else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); close(true); }
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="sg-icon-btn text-gray-600 dark:text-gray-300"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); } }}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
      {open && pos && createPortal(
        <div ref={listRef} role="menu" aria-label={label} onKeyDown={onKeyDown}
          className="portal-multiselect sg-pop fixed z-[9999] py-1 animate-in fade-in zoom-in-95 duration-100"
          style={pos}>
          {items.map((it, i) => (it.divider ? (
            <div key={`d${i}`} className="my-1 border-t border-gray-100 dark:border-white/10" role="separator" />
          ) : (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              tabIndex={-1}
              aria-disabled={it.disabled || undefined}
              className={`sg-opt ${it.danger ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-100'}`}
              onClick={() => { if (it.disabled) return; close(false); it.onClick(); }}
              title={it.hint || undefined}
            >
              {it.icon && <it.icon size={15} className="shrink-0 opacity-80" aria-hidden="true" />}
              <span className="truncate">{it.label}</span>
              {it.hint && <span className="sg-opt-hint">{it.hint}</span>}
            </button>
          )))}
        </div>,
        document.body
      )}
    </>
  );
}
