import React, { useState, useEffect, useRef } from 'react';
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

export default function CustomDatePicker({ label, value, onChange, placeholder = tr('Wybierz datę'), compact = false, min, max, disabled = false, autoFocus = false, onClose, clearable = true }) {
  const [isOpen, setIsOpen] = useState(!!autoFocus && !disabled);
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
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Nawigacja strzałkami zależna od widoku: dni → miesiąc, miesiące → rok, lata → 12 lat.
  const step = (dir) => (e) => {
    e.stopPropagation();
    if (view === 'days') setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + dir, 1));
    else if (view === 'months') setViewDate(new Date(viewDate.getFullYear() + dir, viewDate.getMonth(), 1));
    else setViewDate(new Date(viewDate.getFullYear() + dir * 12, viewDate.getMonth(), 1));
  };
  const pickYear = (y) => { setViewDate(new Date(y, viewDate.getMonth(), 1)); setView('months'); };
  const pickMonth = (m) => { setViewDate(new Date(viewDate.getFullYear(), m, 1)); setView('days'); };

  const handleDayClick = (day) => {
    const ymd = toYmd(new Date(viewDate.getFullYear(), viewDate.getMonth(), day));
    if (outOfRange(ymd)) return;
    onChange(ymd);
    setIsOpen(false);
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

  return (
    <div className="relative w-full">
      {label && <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{label}</label>}
      <div
        ref={triggerRef}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`ui-field w-full ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${compact ? 'px-2 py-1 text-xs h-[26px]' : 'px-4 py-3'} border rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm cursor-pointer flex justify-between items-center transition-all
          ${isOpen
            ? 'border-accent-primary-light ring-2 ring-accent-primary-light/20 dark:border-accent-primary-light'
            : 'border-gray-200/50 dark:border-gray-700/50 hover:border-accent-primary-light dark:hover:border-accent-primary'
          }
        `}
      >
        <div className="flex items-center gap-2 text-sm">
          <Calendar size={compact ? 14 : 16} className="text-gray-400" />
          <span className={displayValue ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}>
            {displayValue || placeholder}
          </span>
        </div>
      </div>

      {isOpen && coords.width > 0 && document.body && createPortal(
        <div
          {...stopOutside}
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
            <button onClick={step(-1)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-600 dark:text-gray-400"><ChevronLeft size={18}/></button>
            <button onClick={(e) => { e.stopPropagation(); setView(view === 'years' ? 'days' : 'years'); }}
              className="text-sm font-bold text-gray-800 dark:text-gray-200 capitalize px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition">
              {view === 'days' ? monthName : view === 'months' ? viewDate.getFullYear() : `${decadeStart} – ${decadeStart + 11}`}
            </button>
            <button onClick={step(1)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-600 dark:text-gray-400"><ChevronRight size={18}/></button>
          </div>

          {view === 'days' && (<>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {[tr('Pn'), tr('Wt'), tr('Śr'), tr('Cz'), tr('Pt'), tr('So'), tr('Nd')].map(d => (
              <div key={d} className="text-center text-[10px] font-bold text-gray-400 uppercase">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
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
            <button type="button" disabled={outOfRange(todayYmd)} onClick={() => { onChange(todayYmd); setIsOpen(false); }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-accent-primary dark:text-accent-primary-light hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40">
              {tr('Dziś')}
            </button>
            {clearable && valueYmd && (
              <button type="button" onClick={() => { onChange(''); setIsOpen(false); }}
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
                  <button key={i} onClick={() => pickMonth(i)}
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
                  <button key={y} onClick={() => pickYear(y)}
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
