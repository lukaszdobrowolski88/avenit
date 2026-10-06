import React, { useState, useEffect, useRef, useId, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { tr } from '../i18n';

function useDropdownPosition(triggerRef, isOpen) {
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, openUpward: false });

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const updatePosition = () => {
        const rect = triggerRef.current.getBoundingClientRect();
        const dropdownMaxHeight = 240; // max-h-60 = 15rem = 240px
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;

        // Otwórz w górę jeśli nie ma miejsca na dole, ale jest na górze
        const openUpward = spaceBelow < dropdownMaxHeight && spaceAbove > spaceBelow;

        // Użyj position: fixed z viewport coordinates (bez scrollY)
        setCoords({
          top: openUpward ? rect.top - 4 : rect.bottom + 4,
          left: rect.left,
          width: rect.width,
          openUpward
        });
      };

      updatePosition();

      // Zamknij dropdown przy scrollu zamiast próbować go śledzić
      const handleScroll = () => {
        // Aktualizuj pozycję przy scrollu
        updatePosition();
      };

      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', handleScroll, true);

      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', handleScroll, true);
      };
    }
  }, [isOpen, triggerRef]);

  return coords;
}

// Lista rozwijana (wzorzec „select-only combobox” WAI-ARIA): pole dostaje fokus z klawiatury,
// Enter/Spacja/↓/↑ otwierają listę, ↑↓/Home/End/PageUp/PageDown przesuwają aktywną opcję,
// Enter/Spacja wybiera, Esc/Tab zamykają, wpisanie liter skacze do pasującej opcji.
// Fokus zostaje na polu (aria-activedescendant wskazuje opcję), więc okno modalne go nie gubi.
// Nazwa pola: `label` (powiązana przez aria-labelledby) albo `aria-label` / `aria-labelledby`.
export default function CustomSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  icon: Icon,
  compact = false,
  mapOptionToLabel,
  mapOptionToValue,
  id,
  disabled = false,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  // Podświetlenie aktywnej opcji tylko przy obsłudze klawiaturą (mysz ma własny hover).
  const [kb, setKb] = useState(false);
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const typeahead = useRef({ text: '', timer: null });
  const coords = useDropdownPosition(triggerRef, isOpen);
  const uid = useId();
  const triggerId = id || `cs-${uid}`;
  const labelId = `${triggerId}-label`;
  const listId = `${triggerId}-list`;
  const optionId = (i) => `${listId}-opt-${i}`;
  const opts = Array.isArray(options) ? options : [];

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event) {
      if (triggerRef.current && !triggerRef.current.contains(event.target)) {
        if (!event.target.closest('.portal-dropdown-select')) {
          setIsOpen(false);
        }
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    // Esc zamyka listę (i nie zamyka okna, w którym leży — Modal sprawdza defaultPrevented).
    const handleKey = (event) => { if (event.key === 'Escape') { event.preventDefault(); setIsOpen(false); } };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isOpen]);

  useEffect(() => () => clearTimeout(typeahead.current.timer), []);

  // Helper functions to get value and label from options
  const getLabel = (opt) => {
    if (mapOptionToLabel) return mapOptionToLabel(opt);
    if (typeof opt === 'object' && opt !== null) return opt.label || opt.value || opt;
    return opt;
  };

  const getValue = (opt) => {
    if (mapOptionToValue) return mapOptionToValue(opt);
    if (typeof opt === 'object' && opt !== null) return opt.value;
    return opt;
  };

  const selectedIndex = opts.findIndex(opt => getValue(opt) === value);
  const selectedOption = selectedIndex >= 0 ? opts[selectedIndex] : undefined;
  const displayValue = selectedOption ? getLabel(selectedOption) : (placeholder === undefined ? tr('Wybierz...') : placeholder);

  // Aktywna (podświetlona klawiaturą) opcja — przewiń do niej listę.
  useEffect(() => {
    if (!isOpen || activeIndex < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${activeIndex}"]`);
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  }, [isOpen, activeIndex, coords.width]);

  const open = useCallback((index, viaKeyboard = false) => {
    if (disabled) return;
    setActiveIndex(index);
    setKb(viaKeyboard);
    setIsOpen(true);
  }, [disabled]);

  const close = () => { setIsOpen(false); setActiveIndex(-1); };

  const choose = (idx) => {
    const opt = opts[idx];
    if (opt === undefined) return;
    onChange(getValue(opt));
    close();
  };

  const labelText = (opt) => {
    const l = getLabel(opt);
    return typeof l === 'string' || typeof l === 'number' ? String(l) : '';
  };

  // Wpisywanie liter: skok do pierwszej opcji zaczynającej się od wpisanego tekstu
  // (ta sama litera kilka razy — kolejne opcje na tę literę).
  const findByTyping = (char) => {
    const t = typeahead.current;
    clearTimeout(t.timer);
    t.text += char.toLocaleLowerCase();
    t.timer = setTimeout(() => { t.text = ''; }, 600);
    const same = t.text.length > 1 && t.text.split('').every((c) => c === t.text[0]);
    const needle = same ? t.text[0] : t.text;
    const startFrom = isOpen ? activeIndex : selectedIndex;
    const n = opts.length;
    const offset = needle.length === 1 ? 1 : 0;
    for (let k = 0; k < n; k++) {
      const i = (Math.max(startFrom, -1) + offset + k + n) % n;
      if (labelText(opts[i]).toLocaleLowerCase().startsWith(needle)) return i;
    }
    return -1;
  };

  const handleKeyDown = (e) => {
    if (disabled) return;
    const n = opts.length;
    const last = n - 1;
    const key = e.key;
    if (key !== 'Tab' && key !== 'Shift') setKb(true);
    if (!isOpen) {
      if (key === 'Enter' || key === ' ' || key === 'ArrowDown' || key === 'ArrowUp') {
        e.preventDefault();
        open(selectedIndex >= 0 ? selectedIndex : (key === 'ArrowUp' ? last : 0), true);
      } else if (key === 'Home' || key === 'End') {
        e.preventDefault();
        open(key === 'Home' ? 0 : last, true);
      } else if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && n) {
        const i = findByTyping(key);
        if (i >= 0) { e.preventDefault(); open(i, true); }
      }
      return;
    }
    switch (key) {
      case 'ArrowDown': e.preventDefault(); setActiveIndex((i) => Math.min(last, i + 1)); break;
      case 'ArrowUp':
        e.preventDefault();
        if (e.altKey) { if (activeIndex >= 0) choose(activeIndex); else close(); }
        else setActiveIndex((i) => Math.max(0, i < 0 ? last : i - 1));
        break;
      case 'Home': e.preventDefault(); setActiveIndex(0); break;
      case 'End': e.preventDefault(); setActiveIndex(last); break;
      case 'PageDown': e.preventDefault(); setActiveIndex((i) => Math.min(last, Math.max(i, 0) + 10)); break;
      case 'PageUp': e.preventDefault(); setActiveIndex((i) => Math.max(0, i - 10)); break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0) choose(activeIndex); else close();
        break;
      case ' ':
        if (typeahead.current.text) { const i = findByTyping(' '); if (i >= 0) setActiveIndex(i); e.preventDefault(); break; }
        e.preventDefault();
        if (activeIndex >= 0) choose(activeIndex); else close();
        break;
      case 'Escape':
        e.preventDefault(); // nie zamykaj okna, w którym leży lista
        close();
        break;
      case 'Tab':
        close();
        break;
      default:
        if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && n) {
          const i = findByTyping(key);
          if (i >= 0) { e.preventDefault(); setActiveIndex(i); }
        }
    }
  };

  // Nazwa pola dla czytnika: jawne aria-* > własna etykieta > placeholder.
  const nameProps = ariaLabel
    ? { 'aria-label': ariaLabel }
    : ariaLabelledBy
      ? { 'aria-labelledby': ariaLabelledBy }
      : label
        ? { 'aria-labelledby': labelId }
        : (typeof placeholder === 'string' && placeholder ? { 'aria-label': placeholder } : {});

  return (
    <div className="w-full">
      {label && (
        <label
          id={labelId}
          onClick={() => triggerRef.current?.focus()}
          className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1"
        >
          {label}
        </label>
      )}

      <div
        ref={triggerRef}
        id={triggerId}
        role="combobox"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-activedescendant={isOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        aria-disabled={disabled || undefined}
        aria-describedby={ariaDescribedBy}
        {...nameProps}
        onClick={() => { if (disabled) return; if (isOpen) close(); else open(selectedIndex); }}
        onKeyDown={handleKeyDown}
        className={`ui-field w-full ${compact ? 'px-2 py-1 text-xs h-[26px]' : 'px-4 py-3'} border rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} flex justify-between items-center transition-all outline-none focus-visible:border-accent-primary-light focus-visible:ring-2 focus-visible:ring-accent-primary-light/30
          ${isOpen
            ? 'border-accent-primary-light ring-2 ring-accent-primary-light/20 dark:border-accent-primary-light'
            : 'border-gray-200/50 dark:border-gray-700/50 hover:border-accent-primary-light dark:hover:border-accent-primary'
          }
        `}
      >
        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-200 truncate">
          {Icon && <Icon size={compact ? 14 : 16} className="text-gray-400 shrink-0" aria-hidden="true" />}
          <span className={`${compact ? 'text-xs' : 'text-sm'} truncate ${!selectedOption ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>
            {displayValue}
          </span>
        </div>
        <ChevronDown
          size={compact ? 12 : 16}
          aria-hidden="true"
          className={`text-gray-400 transition-transform duration-200 flex-shrink-0 ml-2 ${isOpen ? 'rotate-180' : ''}`}
        />
      </div>

      {isOpen && coords.width > 0 && typeof document !== 'undefined' && document.body && createPortal(
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          {...(label ? { 'aria-labelledby': labelId } : ariaLabel ? { 'aria-label': ariaLabel } : {})}
          className="portal-dropdown-select fixed z-[9999] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl max-h-60 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-100"
          style={{
            ...(coords.openUpward
              ? { bottom: window.innerHeight - coords.top }
              : { top: coords.top }),
            left: Math.max(8, Math.min(coords.left, window.innerWidth - coords.width - 8)),
            width: Math.min(coords.width, window.innerWidth - 16),
            minWidth: compact ? '120px' : undefined
          }}
        >
          {opts.map((opt, idx) => {
            const optVal = getValue(opt);
            const isActive = optVal === value;
            const isHighlighted = kb && idx === activeIndex;
            return (
              <div
                key={idx}
                id={optionId(idx)}
                data-idx={idx}
                role="option"
                aria-selected={isActive}
                // Klik w opcję nie zabiera fokusu polu (klawiatura działa dalej po wyborze myszą).
                onMouseDown={(e) => e.preventDefault()}
                onMouseMove={() => { if (kb || idx !== activeIndex) { setKb(false); setActiveIndex(idx); } }}
                onClick={() => choose(idx)}
                className={`px-4 py-2.5 text-sm cursor-pointer transition flex items-center justify-between
                  ${isActive
                    ? 'bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light font-medium'
                    : isHighlighted
                      ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }
                  ${isHighlighted ? 'outline outline-2 -outline-offset-2 outline-accent-primary/60' : ''}
                `}
              >
                <span>{getLabel(opt)}</span>
                {isActive && <Check size={16} className="flex-shrink-0 ml-2" aria-hidden="true" />}
              </div>
            );
          })}
          {opts.length === 0 && (
            <div className="p-3 text-gray-400 dark:text-gray-500 text-sm text-center">
              {tr('Brak opcji')}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
