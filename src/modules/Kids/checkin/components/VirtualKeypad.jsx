import React, { useEffect, useRef } from 'react';
import { Delete, X } from 'lucide-react';
import { tr } from '../../../../i18n';

import { KEY_CLEAR, KEY_BACK } from '../utils/kiosk';

const NUMERIC_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  [KEY_CLEAR, '0', KEY_BACK],
];

// Klawiatura ekranowa kiosku (cyfry albo znaki kodu odbioru) + obsługa fizycznej klawiatury.
//   rows    — układ klawiszy; KEY_CLEAR = wyczyść, KEY_BACK = cofnij
//   masked  — kropki zamiast znaków (PIN)
//   label   — opis pola dla czytników ekranu
export default function VirtualKeypad({
  value,
  onChange,
  maxLength = 4,
  disabled = false,
  rows = NUMERIC_ROWS,
  masked = false,
  label,
  captureKeyboard = true,
}) {
  const allowed = useRef(new Set());
  allowed.current = new Set(rows.flat().filter((k) => k !== KEY_CLEAR && k !== KEY_BACK));
  const valueRef = useRef(value);
  valueRef.current = value;

  const press = (key) => {
    if (disabled) return;
    const v = valueRef.current;
    if (key === KEY_CLEAR) onChange('');
    else if (key === KEY_BACK) onChange(v.slice(0, -1));
    else if (v.length < maxLength) onChange(v + key);
  };

  // Laptop/tablet z klawiaturą: cyfry/litery, Backspace, Escape (wyczyść).
  useEffect(() => {
    if (!captureKeyboard) return undefined;
    const onKey = (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
      const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      if (allowed.current.has(k)) { e.preventDefault(); press(k); }
      else if (k === 'Backspace') { e.preventDefault(); press(KEY_BACK); }
      else if (k === 'Escape' && valueRef.current) { e.preventDefault(); press(KEY_CLEAR); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureKeyboard, disabled, maxLength, onChange]);

  const cols = Math.max(...rows.map((r) => r.length));
  const keySize = cols > 4 ? 'w-14 h-14 sm:w-16 sm:h-16 text-xl sm:text-2xl' : 'w-16 h-16 sm:w-20 sm:h-20 text-2xl sm:text-3xl';
  const nextIndex = Math.min(value.length, maxLength - 1);

  return (
    <div className="flex flex-col gap-3 items-center">
      {/* Pola na znaki — puste też mają wyraźną ramkę; bieżące podświetlone */}
      <div className="flex gap-3 mb-3 justify-center" role="status" aria-live="polite" aria-label={label}>
        {[...Array(maxLength)].map((_, index) => {
          const ch = value[index];
          const isNext = !disabled && index === nextIndex && value.length < maxLength;
          return (
            <div
              key={index}
              className={`w-14 h-16 sm:w-16 sm:h-[70px] border-2 rounded-xl flex items-center justify-center text-3xl sm:text-4xl font-bold tracking-wider transition-colors
                ${ch
                  ? 'border-accent-primary bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 text-gray-900 dark:text-white'
                  : isNext
                    ? 'border-accent-primary bg-white dark:bg-gray-800 ring-4 ring-accent-primary/15'
                    : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800'
                }`}
            >
              {ch ? (masked ? '•' : ch) : ''}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2.5 sm:gap-3">
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="flex gap-2.5 sm:gap-3 justify-center">
            {row.map((key) => {
              if (key === KEY_CLEAR || key === KEY_BACK) {
                const off = disabled || value.length === 0;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => press(key)}
                    disabled={off}
                    onMouseDown={(e) => e.preventDefault()}
                    aria-label={key === KEY_CLEAR ? tr('Wyczyść') : tr('Usuń ostatni znak')}
                    className={`${keySize} font-semibold rounded-xl border-2 flex items-center justify-center select-none transition
                      ${off
                        ? 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-600 cursor-not-allowed'
                        : 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer'
                      }`}
                  >
                    {key === KEY_CLEAR ? <X size={20} /> : <Delete size={20} />}
                  </button>
                );
              }
              const off = disabled || value.length >= maxLength;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => press(key)}
                  disabled={off}
                  onMouseDown={(e) => e.preventDefault()}
                  className={`${keySize} font-bold rounded-xl border-2 flex items-center justify-center select-none transition
                    ${off
                      ? 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-600 cursor-not-allowed'
                      : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-accent-primary cursor-pointer'
                    }`}
                >
                  {key}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
