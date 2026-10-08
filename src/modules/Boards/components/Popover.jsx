import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import '../../../components/pickList.css';

// Lekki popover zakotwiczony do elementu wyzwalającego (portal do body).
// Zamyka się po kliknięciu poza i przy Escape. Używany do edytorów komórek i menu tablic.
// Wygląd domyślny = wspólna lista wyboru aplikacji (pick-pop z pickList.css); `bare` = bez
// domyślnej skórki — wygląd daje className.
// Klawiatura: wyzwalacz jest osiągalny Tabem (rola przycisku, Enter/Spacja otwiera; gdy wyzwalaczem
// jest już <button>, opakowanie nie dokłada drugiego przystanku), Esc zamyka TYLKO ten popover
// (nie panel zadania pod spodem) i oddaje fokus wyzwalaczowi.
export default function Popover({ trigger, children, className = '', width, onOpenChange, align = 'left', triggerClassName = 'w-full h-full', bare = false, label, disabled = false }) {
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
      const w = width || rect.width;
      const rawLeft = align === 'right' ? rect.right - w : rect.left;
      // Clamp do widoku w obu osiach — inaczej popover przy prawej krawędzi (np. „+" dodaj
      // kolumnę na końcu tabeli) wychodzi poza ekran i jest obcięty.
      const left = Math.max(8, Math.min(rawLeft, window.innerWidth - w - 8));
      setCoords({
        top: Math.max(8, openUp ? rect.top - (popH + 4) : rect.bottom + 4),
        left,
        minWidth: w,
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

  const close = (refocus) => {
    setOpen(false);
    if (refocus) (triggerRef.current?.querySelector('button') || triggerRef.current)?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (popRef.current?.contains(e.target)) return;
      // Listy, kalendarze i zagnieżdżone popovery otwarte Z WNĘTRZA rysują się w osobnym portalu —
      // klik w nie nie jest „poza” (inaczej wybór wartości filtra zamykał cały panel filtrów).
      if (e.target.closest?.('.portal-dropdown-select, .portal-datepicker, .portal-multiselect, [data-popover]')) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Fokus do środka po otwarciu (pierwsze pole / opcja), jeśli nic nie ustawiło go samo (autoFocus).
  useEffect(() => {
    if (!open) return undefined;
    const id = requestAnimationFrame(() => {
      const pop = popRef.current;
      if (!pop || pop.contains(document.activeElement)) return;
      pop.querySelector('input, textarea, [role="option"], [role="menuitem"], button')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Esc w popoverze: zamyka tylko jego. preventDefault — Modal (panel zadania) sprawdza
  // defaultPrevented i wtedy się nie zamyka; stopPropagation — nadrzędny popover też zostaje.
  const onPopKeyDown = (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    close(true);
  };

  const triggerIsButton = React.isValidElement(trigger) && trigger.type === 'button';
  const onTriggerKeyDown = (e) => {
    if (disabled || triggerIsButton || e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((o) => !o); }
  };
  const a11y = triggerIsButton
    ? {}
    : { role: 'button', tabIndex: disabled ? -1 : 0, 'aria-haspopup': 'dialog', 'aria-expanded': open, 'aria-label': label, 'aria-disabled': disabled || undefined };

  return (
    <>
      <div
        ref={triggerRef}
        {...a11y}
        onClick={() => { if (!disabled) setOpen(o => !o); }}
        onKeyDown={onTriggerKeyDown}
        className={`${triggerClassName} ${disabled ? '' : 'cursor-pointer'} ${triggerIsButton ? '' : 'outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/60 rounded'}`}
      >
        {typeof trigger === 'function' ? trigger(open) : trigger}
      </div>
      {open && createPortal(
        <div
          ref={popRef}
          data-popover=""
          onKeyDown={onPopKeyDown}
          style={{ position: 'fixed', top: coords.top, left: coords.left, minWidth: coords.minWidth, zIndex: 200 }}
          className={bare ? className : `pick-pop ${className}`}
        >
          {typeof children === 'function' ? children({ close: () => close(true) }) : children}
        </div>,
        document.body
      )}
    </>
  );
}
