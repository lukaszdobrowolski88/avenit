import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

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

export default function CustomSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "Wybierz...",
  icon: Icon,
  compact = false,
  mapOptionToLabel,
  mapOptionToValue
}) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef(null);
  const coords = useDropdownPosition(triggerRef, isOpen);

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
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Helper functions to get value and label from options
  const getLabel = (opt) => {
    if (mapOptionToLabel) return mapOptionToLabel(opt);
    if (typeof opt === 'object') return opt.label || opt.value || opt;
    return opt;
  };

  const getValue = (opt) => {
    if (mapOptionToValue) return mapOptionToValue(opt);
    if (typeof opt === 'object') return opt.value;
    return opt;
  };

  const selectedOption = options.find(opt => getValue(opt) === value);
  const displayValue = selectedOption ? getLabel(selectedOption) : placeholder;

  return (
    <div className="w-full">
      {label && (
        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">
          {label}
        </label>
      )}

      <div
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full ${compact ? 'px-2 py-1 text-xs h-[26px]' : 'px-4 py-3'} border rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm cursor-pointer flex justify-between items-center transition-all
          ${isOpen
            ? 'border-pink-500 ring-2 ring-pink-500/20 dark:border-pink-400'
            : 'border-gray-200/50 dark:border-gray-700/50 hover:border-pink-300 dark:hover:border-pink-600'
          }
        `}
      >
        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-200 truncate">
          {Icon && <Icon size={compact ? 14 : 16} className="text-gray-400 shrink-0" />}
          <span className={`${compact ? 'text-xs' : 'text-sm'} truncate ${!selectedOption ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>
            {displayValue}
          </span>
        </div>
        <ChevronDown
          size={compact ? 12 : 16}
          className={`text-gray-400 transition-transform duration-200 flex-shrink-0 ml-2 ${isOpen ? 'rotate-180' : ''}`}
        />
      </div>

      {isOpen && coords.width > 0 && typeof document !== 'undefined' && document.body && createPortal(
        <div
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
          {options.map((opt, idx) => {
            const optVal = getValue(opt);
            const isActive = optVal === value;
            return (
              <div
                key={idx}
                onClick={() => {
                  onChange(optVal);
                  setIsOpen(false);
                }}
                className={`px-4 py-2.5 text-sm cursor-pointer transition flex items-center justify-between
                  ${isActive
                    ? 'bg-pink-50 dark:bg-pink-900/30 text-pink-600 dark:text-pink-300 font-medium'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }
                `}
              >
                <span>{getLabel(opt)}</span>
                {isActive && <Check size={16} className="flex-shrink-0 ml-2" />}
              </div>
            );
          })}
          {options.length === 0 && (
            <div className="p-3 text-gray-400 dark:text-gray-500 text-sm text-center">
              Brak opcji
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
