import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { tr } from '../i18n';

function useDropdownPosition(triggerRef, isOpen) {
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, openUpward: false });

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const updatePosition = () => {
        const rect = triggerRef.current.getBoundingClientRect();
        const dropdownMaxHeight = 300; // datepicker is taller
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

export default function CustomDatePicker({ label, value, onChange, placeholder = tr('Wybierz datę'), compact = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(value ? new Date(value) : new Date());
  const [view, setView] = useState('days'); // 'days' | 'months' | 'years' — szybka nawigacja (np. data urodzenia)
  const triggerRef = useRef(null);
  const coords = useDropdownPosition(triggerRef, isOpen);

  // Po zamknięciu wróć do widoku dni (następne otwarcie startuje standardowo).
  useEffect(() => { if (!isOpen) setView('days'); }, [isOpen]);

  useEffect(() => {
    if (value) setViewDate(new Date(value));
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
    const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    const year = newDate.getFullYear();
    const month = String(newDate.getMonth() + 1).padStart(2, '0');
    const d = String(newDate.getDate()).padStart(2, '0');
    onChange(`${year}-${month}-${d}`);
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

  const monthName = viewDate.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
  const displayValue = value ? new Date(value).toLocaleDateString('pl-PL') : '';
  const decadeStart = Math.floor(viewDate.getFullYear() / 12) * 12;
  const monthShort = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString('pl-PL', { month: 'short' }));
  const selDate = value ? new Date(value) : null;

  return (
    <div className="relative w-full">
      {label && <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{label}</label>}
      <div
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full ${compact ? 'px-2 py-1 text-xs h-[26px]' : 'px-4 py-3'} border rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm cursor-pointer flex justify-between items-center transition-all
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
              const isSelected = value === currentDayStr;
              const isToday = new Date().toDateString() === new Date(viewDate.getFullYear(), viewDate.getMonth(), day).toDateString();

              return (
                <button
                  key={day}
                  onClick={() => handleDayClick(day)}
                  className={`h-8 w-8 rounded-lg text-xs font-medium transition flex items-center justify-center
                    ${isSelected
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
