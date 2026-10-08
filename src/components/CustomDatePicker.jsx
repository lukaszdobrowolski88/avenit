import React, { useState, useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { tr, appLocale } from '../i18n';
import { stopOutside } from './pickers/useAnchoredPopover';

// „YYYY-MM-DD” (albo ISO z API „…T00:00:00.000Z”) → data lokalna, bez przesunięcia strefy.
const parseYmd = (v) => {
  const [y, m, d] = String(v || '').slice(0, 10).split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
};
const toYmd = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
const addDays = (ymd, n) => { const d = parseYmd(ymd); d.setDate(d.getDate() + n); return toYmd(d); };
// ± miesiące z przycięciem dnia (31.01 + 1 mies. → 28/29.02).
const addMonths = (ymd, n) => {
  const d = parseYmd(ymd);
  const day = d.getDate();
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  t.setDate(Math.min(day, new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()));
  return toYmd(t);
};
const FOCUSABLE_IN_PANEL = 'button:not([disabled]):not([tabindex="-1"])';

function useDropdownPosition(triggerRef, isOpen) {
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, openUpward: false });

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const updatePosition = () => {
        const rect = triggerRef.current.getBoundingClientRect();
        const dropdownMaxHeight = 380; // kalendarz + stopka „Dziś/Wyczyść”
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const openUpward = spaceBelow < dropdownMaxHeight && spaceAbove > spaceBelow;

        setCoords({
          top: openUpward
            ? rect.top + window.scrollY - 4
            : rect.bottom + window.scrollY + 4,
          left: rect.left + window.scrollX,
          width: rect.width,
          openUpward
        });
      };

      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);

      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }
  }, [isOpen, triggerRef]);

  return coords;
}

// Kalendarz z obsługą klawiatury: pole (Enter/Spacja/↓) otwiera panel, fokus trafia na wybrany
// dzień (albo dziś); ←→ ±1 dzień, ↑↓ ±7 dni, Home/End początek/koniec tygodnia, PageUp/PageDown
// ±miesiąc (z Shift ±rok), Enter/Spacja wybiera, Esc zamyka TYLKO kalendarz (nie okno z formularzem)
// i oddaje fokus polu. Tab krąży w panelu. Nazwa pola: `label` albo `aria-label`/`aria-labelledby`.
export default function CustomDatePicker({ label, value, onChange, placeholder = tr('Wybierz datę'), compact = false, variant = 'field', min, max, disabled = false, autoFocus = false, onClose, clearable = true, id, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy, 'aria-describedby': ariaDescribedBy }) {
  const [isOpen, setIsOpen] = useState(!!autoFocus && !disabled);
  const uid = useId();
  const fieldId = id || `dp-${uid}`;
  const labelId = `${fieldId}-label`;
  const valueId = `${fieldId}-value`;
  const panelRef = useRef(null);
  const [focusYmd, setFocusYmd] = useState('');
  const wantFocus = useRef(false); // przenieś fokus do siatki po najbliższym renderze
  const [viewDate, setViewDate] = useState(parseYmd(value) || new Date());
  const valueYmd = value ? String(value).slice(0, 10) : '';
  const minYmd = min ? String(min).slice(0, 10) : '';
  const maxYmd = max ? String(max).slice(0, 10) : '';
  const outOfRange = (ymd) => (minYmd && ymd < minYmd) || (maxYmd && ymd > maxYmd);
  const wasOpen = useRef(isOpen);
  const [view, setView] = useState('days'); // 'days' | 'months' | 'years' — szybka nawigacja (np. data urodzenia)
  const triggerRef = useRef(null);
  const coords = useDropdownPosition(triggerRef, isOpen);

  // Po zamknięciu wróć do widoku dni (następne otwarcie startuje standardowo).
  useEffect(() => { if (!isOpen) setView('days'); }, [isOpen]);

  const clampYmd = (ymd) => (minYmd && ymd < minYmd ? minYmd : maxYmd && ymd > maxYmd ? maxYmd : ymd);
  // Przy otwarciu: dzień z fokusem = wybrana data, a bez niej dziś (w zakresie min/max).
  useEffect(() => {
    if (!isOpen) return;
    const start = clampYmd(valueYmd || toYmd(new Date()));
    setFocusYmd(start);
    const d = parseYmd(start);
    if (d) setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
    wantFocus.current = true;
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fokus na dniu po otwarciu i po każdym ruchu klawiaturą (także po zmianie miesiąca).
  useEffect(() => {
    if (!isOpen || !wantFocus.current || !panelRef.current) return;
    const btn = view === 'days'
      ? panelRef.current.querySelector(`[data-ymd="${focusYmd}"]`)
      : panelRef.current.querySelector('[aria-pressed="true"]') || panelRef.current.querySelector(FOCUSABLE_IN_PANEL);
    if (btn) { btn.focus({ preventScroll: true }); wantFocus.current = false; }
  });

  const closePicker = (refocus = true) => {
    setIsOpen(false);
    if (refocus) triggerRef.current?.focus({ preventScroll: true });
  };
  // Zamknięcie panelu = „blur” pola (np. komórka tabeli wraca do trybu podglądu).
  useEffect(() => { if (wasOpen.current && !isOpen) onClose?.(); wasOpen.current = isOpen; }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const d = parseYmd(value);
    if (d) setViewDate(d);
  }, [value]);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event) {
      if (triggerRef.current && !triggerRef.current.contains(event.target)) {
        if (!event.target.closest('.portal-datepicker')) {
          setIsOpen(false);
        }
      }
    }
    // Esc zamyka kalendarz, nie całe okno z formularzem (Modal sprawdza defaultPrevented).
    const handleKey = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      const inside = panelRef.current?.contains(document.activeElement) || triggerRef.current === document.activeElement;
      setIsOpen(false);
      if (inside) triggerRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isOpen]);

  // Nawigacja strzałkami zależna od widoku: dni → miesiąc, miesiące → rok, lata → 12 lat.
  const step = (dir) => (e) => {
    e.stopPropagation();
    if (view === 'days') {
      setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + dir, 1));
      if (focusYmd) setFocusYmd(clampYmd(addMonths(focusYmd, dir)));
    }
    else if (view === 'months') setViewDate(new Date(viewDate.getFullYear() + dir, viewDate.getMonth(), 1));
    else setViewDate(new Date(viewDate.getFullYear() + dir * 12, viewDate.getMonth(), 1));
  };
  const pickYear = (y) => { setViewDate(new Date(y, viewDate.getMonth(), 1)); setView('months'); wantFocus.current = true; };
  const pickMonth = (m) => {
    const vd = new Date(viewDate.getFullYear(), m, 1);
    setViewDate(vd);
    setView('days');
    const sel = parseYmd(focusYmd);
    const day = sel ? Math.min(sel.getDate(), new Date(vd.getFullYear(), m + 1, 0).getDate()) : 1;
    setFocusYmd(clampYmd(toYmd(new Date(vd.getFullYear(), m, day))));
    wantFocus.current = true;
  };

  const handleDayClick = (day) => {
    const ymd = toYmd(new Date(viewDate.getFullYear(), viewDate.getMonth(), day));
    if (outOfRange(ymd)) return;
    onChange(ymd);
    closePicker();
  };

  // Strzałki w siatce dni.
  const onGridKeyDown = (e) => {
    if (!focusYmd) return;
    let next = null;
    switch (e.key) {
      case 'ArrowLeft': next = addDays(focusYmd, -1); break;
      case 'ArrowRight': next = addDays(focusYmd, 1); break;
      case 'ArrowUp': next = addDays(focusYmd, -7); break;
      case 'ArrowDown': next = addDays(focusYmd, 7); break;
      case 'Home': { const wd = (parseYmd(focusYmd).getDay() + 6) % 7; next = addDays(focusYmd, -wd); break; }
      case 'End': { const wd = (parseYmd(focusYmd).getDay() + 6) % 7; next = addDays(focusYmd, 6 - wd); break; }
      case 'PageUp': next = addMonths(focusYmd, e.shiftKey ? -12 : -1); break;
      case 'PageDown': next = addMonths(focusYmd, e.shiftKey ? 12 : 1); break;
      default: return;
    }
    e.preventDefault();
    next = clampYmd(next);
    const d = parseYmd(next);
    if (d.getFullYear() !== viewDate.getFullYear() || d.getMonth() !== viewDate.getMonth()) {
      setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
    }
    setFocusYmd(next);
    wantFocus.current = true;
  };

  // Tab nie ucieka z panelu (panel to portal poza oknem formularza).
  const onPanelKeyDown = (e) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const items = Array.from(panelRef.current.querySelectorAll(FOCUSABLE_IN_PANEL));
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const onTriggerKeyDown = (e) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) setIsOpen(true);
      else wantFocus.current = true;
    }
  };

  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => {
    const day = new Date(year, month, 1).getDay();
    return day === 0 ? 6 : day - 1;
  };

  const daysInMonth = getDaysInMonth(viewDate.getFullYear(), viewDate.getMonth());
  const startDay = getFirstDayOfMonth(viewDate.getFullYear(), viewDate.getMonth());
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: startDay }, (_, i) => i);

  const monthName = viewDate.toLocaleDateString(appLocale(), { month: 'long', year: 'numeric' });
  const displayValue = parseYmd(value)?.toLocaleDateString(appLocale()) || '';
  const decadeStart = Math.floor(viewDate.getFullYear() / 12) * 12;
  const monthShort = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(appLocale(), { month: 'short' }));
  const selDate = parseYmd(value);
  const todayYmd = toYmd(new Date());
  const fullDate = (ymd) => parseYmd(ymd).toLocaleDateString(appLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const navLabels = view === 'days'
    ? [tr('Poprzedni miesiąc'), tr('Następny miesiąc')]
    : view === 'months' ? [tr('Poprzedni rok'), tr('Następny rok')] : [tr('Wcześniejsze lata'), tr('Późniejsze lata')];
  // Nazwa pola dla czytnika: etykieta + bieżąca wartość (albo podpowiedź).
  const nameProps = ariaLabel
    ? { 'aria-label': displayValue ? `${ariaLabel}: ${displayValue}` : ariaLabel }
    : ariaLabelledBy
      ? { 'aria-labelledby': `${ariaLabelledBy} ${valueId}` }
      : label ? { 'aria-labelledby': `${labelId} ${valueId}` } : { 'aria-labelledby': valueId };

  // variant="cell" — komórka tabeli: sama data tekstem (bez ramki pola), pusto = „+” na hover wiersza;
  // po kliknięciu ten sam kalendarz co w formularzach.
  const cell = variant === 'cell';
  return (
    <div className={`relative w-full${cell ? ' h-full' : ''}`}>
      {label && <label id={labelId} onClick={() => !disabled && triggerRef.current?.focus()} className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{label}</label>}
      <div
        ref={triggerRef}
        id={fieldId}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-disabled={disabled || undefined}
        aria-describedby={ariaDescribedBy}
        {...nameProps}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={onTriggerKeyDown}
        className={cell
          ? `w-full h-full px-2 flex items-center justify-center text-sm cursor-pointer outline-none rounded focus-visible:ring-2 focus-visible:ring-accent-primary-light/50 ${isOpen ? 'bg-black/[0.03] dark:bg-white/5' : ''}`
          : `ui-field w-full ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${compact ? 'px-2 py-1 text-xs h-[26px]' : 'px-4 py-3'} border rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm cursor-pointer flex justify-between items-center transition-all outline-none focus-visible:border-accent-primary-light focus-visible:ring-2 focus-visible:ring-accent-primary-light/30
          ${isOpen
            ? 'border-accent-primary-light ring-2 ring-accent-primary-light/20 dark:border-accent-primary-light'
            : 'border-gray-200/50 dark:border-gray-700/50 hover:border-accent-primary-light dark:hover:border-accent-primary'
          }
        `}
      >
        {cell ? (
          displayValue
            ? <span id={valueId} className="tabular-nums text-gray-700 dark:text-gray-200">{displayValue}</span>
            : <span id={valueId} className="text-gray-300 dark:text-gray-600 text-base leading-none opacity-0 group-hover/row:opacity-100 transition-opacity"><span aria-hidden="true">+</span><span className="sr-only">{placeholder}</span></span>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <Calendar size={compact ? 14 : 16} className="text-gray-400" aria-hidden="true" />
            <span id={valueId} className={displayValue ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}>
              {displayValue || placeholder}
            </span>
          </div>
        )}
      </div>

      {isOpen && coords.width > 0 && document.body && createPortal(
        <div
          {...stopOutside}
          ref={panelRef}
          role="dialog"
          aria-label={label ? `${typeof label === 'string' ? label : ''} — ${tr('Wybierz datę')}`.replace(/^ — /, '') : tr('Wybierz datę')}
          onKeyDown={onPanelKeyDown}
          className="portal-datepicker fixed z-[9999] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-4 animate-in fade-in zoom-in-95 duration-100"
          style={{
            ...(coords.openUpward
              ? { bottom: `calc(100vh - ${coords.top}px)` }
              : { top: coords.top }),
            left: coords.left,
            width: '280px'
          }}
        >
          <div className="flex justify-between items-center mb-4">
            <button type="button" onClick={step(-1)} aria-label={navLabels[0]} title={navLabels[0]} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-600 dark:text-gray-400"><ChevronLeft size={18} aria-hidden="true" /></button>
            <button type="button" aria-live="polite" onClick={(e) => { e.stopPropagation(); setView(view === 'years' ? 'days' : 'years'); wantFocus.current = true; }}
              className="text-sm font-bold text-gray-800 dark:text-gray-200 capitalize px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition">
              {view === 'days' ? monthName : view === 'months' ? viewDate.getFullYear() : `${decadeStart} – ${decadeStart + 11}`}
            </button>
            <button type="button" onClick={step(1)} aria-label={navLabels[1]} title={navLabels[1]} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-600 dark:text-gray-400"><ChevronRight size={18} aria-hidden="true" /></button>
          </div>

          {view === 'days' && (<>
          <div className="grid grid-cols-7 gap-1 mb-2" aria-hidden="true">
            {[tr('Pn'), tr('Wt'), tr('Śr'), tr('Cz'), tr('Pt'), tr('So'), tr('Nd')].map(d => (
              <div key={d} className="text-center text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1" onKeyDown={onGridKeyDown}>
            {blanks.map(b => <div key={`blank-${b}`} />)}
            {days.map(day => {
              const currentDayStr = `${viewDate.getFullYear()}-${String(viewDate.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
              const isSelected = valueYmd === currentDayStr;
              const isToday = todayYmd === currentDayStr;
              const off = outOfRange(currentDayStr);

              return (
                <button
                  key={day}
                  type="button"
                  disabled={off}
                  data-ymd={currentDayStr}
                  tabIndex={currentDayStr === focusYmd ? 0 : -1}
                  aria-label={fullDate(currentDayStr)}
                  aria-pressed={isSelected}
                  aria-current={isToday ? 'date' : undefined}
                  onClick={() => handleDayClick(day)}
                  className={`h-8 w-8 rounded-lg text-xs font-medium transition flex items-center justify-center
                    ${off ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed' : isSelected
                      ? 'bg-accent-primary text-white shadow-md shadow-accent-primary-light/30'
                      : isToday
                        ? 'bg-accent-primary-lightest dark:bg-accent-primary-darkest/20 text-accent-primary dark:text-accent-primary-light border border-accent-primary-lighter dark:border-accent-primary-dark'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }
                  `}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
            <button type="button" disabled={outOfRange(todayYmd)} onClick={() => { onChange(todayYmd); closePicker(); }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-accent-primary dark:text-accent-primary-light hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40">
              {tr('Dziś')}
            </button>
            {clearable && valueYmd && (
              <button type="button" onClick={() => { onChange(''); closePicker(); }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
                {tr('Wyczyść')}
              </button>
            )}
          </div>
          </>)}

          {view === 'months' && (
            <div className="grid grid-cols-3 gap-2">
              {monthShort.map((m, i) => {
                const isSel = selDate && selDate.getFullYear() === viewDate.getFullYear() && selDate.getMonth() === i;
                return (
                  <button key={i} type="button" aria-pressed={!!isSel} onClick={() => pickMonth(i)}
                    className={`py-2.5 rounded-lg text-sm font-medium capitalize transition ${isSel ? 'bg-accent-primary text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>{m}</button>
                );
              })}
            </div>
          )}

          {view === 'years' && (
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 12 }, (_, i) => decadeStart + i).map(y => {
                const isSel = selDate && selDate.getFullYear() === y;
                return (
                  <button key={y} type="button" aria-pressed={!!isSel} onClick={() => pickYear(y)}
                    className={`py-2.5 rounded-lg text-sm font-medium transition ${isSel ? 'bg-accent-primary text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>{y}</button>
                );
              })}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
