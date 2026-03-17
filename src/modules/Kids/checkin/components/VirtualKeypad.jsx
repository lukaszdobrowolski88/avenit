import React from 'react';
import { Delete, X } from 'lucide-react';

export default function VirtualKeypad({ value, onChange, maxLength = 4, disabled = false }) {
  const handleDigitPress = (digit) => {
    if (disabled) return;
    if (value.length < maxLength) {
      onChange(value + digit);
    }
  };

  const handleBackspace = () => {
    if (disabled) return;
    onChange(value.slice(0, -1));
  };

  const handleClear = () => {
    if (disabled) return;
    onChange('');
  };

  const digits = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['C', '0', '<']
  ];

  return (
    <div className="flex flex-col gap-3 items-center">
      {/* Display */}
      <div className="flex gap-3 mb-4 justify-center">
        {[...Array(maxLength)].map((_, index) => (
          <div
            key={index}
            className={`w-14 h-16 sm:w-16 sm:h-[70px] border-2 rounded-xl flex items-center justify-center text-3xl sm:text-4xl font-bold transition-all
              ${value[index]
                ? 'border-pink-500 dark:border-pink-400 bg-pink-50 dark:bg-pink-900/30 text-gray-900 dark:text-white'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-600'
              }`}
          >
            {value[index] || ''}
          </div>
        ))}
      </div>

      {/* Keypad */}
      <div className="flex flex-col gap-3">
        {digits.map((row, rowIndex) => (
          <div key={rowIndex} className="flex gap-3">
            {row.map((key) => {
              if (key === 'C') {
                return (
                  <button
                    key={key}
                    onClick={handleClear}
                    disabled={disabled || value.length === 0}
                    onMouseDown={(e) => e.preventDefault()}
                    className={`w-16 h-16 sm:w-20 sm:h-20 text-base font-semibold rounded-xl border-2 flex items-center justify-center select-none transition-all
                      ${disabled || value.length === 0
                        ? 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-600 cursor-not-allowed'
                        : 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 cursor-pointer'
                      }`}
                  >
                    <X size={20} />
                  </button>
                );
              }
              if (key === '<') {
                return (
                  <button
                    key={key}
                    onClick={handleBackspace}
                    disabled={disabled || value.length === 0}
                    onMouseDown={(e) => e.preventDefault()}
                    className={`w-16 h-16 sm:w-20 sm:h-20 text-base font-semibold rounded-xl border-2 flex items-center justify-center select-none transition-all
                      ${disabled || value.length === 0
                        ? 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-600 cursor-not-allowed'
                        : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer'
                      }`}
                  >
                    <Delete size={20} />
                  </button>
                );
              }
              return (
                <button
                  key={key}
                  onClick={() => handleDigitPress(key)}
                  disabled={disabled || value.length >= maxLength}
                  onMouseDown={(e) => e.preventDefault()}
                  className={`w-16 h-16 sm:w-20 sm:h-20 text-2xl sm:text-3xl font-bold rounded-xl border-2 flex items-center justify-center select-none transition-all
                    ${disabled || value.length >= maxLength
                      ? 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-600 cursor-not-allowed'
                      : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-pink-300 dark:hover:border-pink-600 cursor-pointer'
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
