import React, { useState, useEffect } from 'react';
import VirtualKeypad from './VirtualKeypad';
import { UserPlus, RotateCcw, Loader2 } from 'lucide-react';

export default function PhoneSearchScreen({
  onHouseholdFound,
  onMultipleHouseholds,
  onNoResults,
  onGuestClick,
  searchByPhone,
  loading
}) {
  const [phoneDigits, setPhoneDigits] = useState('');
  const [searching, setSearching] = useState(false);
  const [noResults, setNoResults] = useState(false);

  useEffect(() => {
    if (phoneDigits.length === 4) {
      handleSearch();
    } else {
      setNoResults(false);
    }
  }, [phoneDigits]);

  const handleSearch = async () => {
    if (phoneDigits.length !== 4) return;

    setSearching(true);
    setNoResults(false);

    try {
      const results = await searchByPhone(phoneDigits);

      if (results.length === 0) {
        setNoResults(true);
        onNoResults?.();
      } else if (results.length === 1) {
        onHouseholdFound(results[0]);
      } else {
        onMultipleHouseholds(results);
      }
    } finally {
      setSearching(false);
    }
  };

  const handleGuestClick = () => {
    onGuestClick?.();
  };

  const handleClear = () => {
    setPhoneDigits('');
    setNoResults(false);
  };

  return (
    <div className="flex flex-col items-center px-5 py-10 min-h-full">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-3">
          Check-in Dzieci
        </h1>
        <p className="text-base sm:text-lg text-gray-600 dark:text-gray-400">
          Wpisz ostatnie 4 cyfry numeru telefonu
        </p>
      </div>

      {/* Keypad */}
      <VirtualKeypad
        value={phoneDigits}
        onChange={setPhoneDigits}
        maxLength={4}
        disabled={searching || loading}
      />

      {/* Loading/Status */}
      {(searching || loading) && (
        <div className="mt-6 flex items-center gap-3 text-pink-600 dark:text-pink-400">
          <Loader2 size={24} className="animate-spin" />
          <span className="text-base font-medium">Szukam rodziny...</span>
        </div>
      )}

      {/* No results */}
      {noResults && !searching && (
        <div className="mt-6 text-center p-5 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-2xl max-w-md">
          <p className="text-base text-amber-800 dark:text-amber-200 mb-4">
            Nie znaleziono rodziny z tym numerem telefonu.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <button
              onClick={handleClear}
              className="flex items-center gap-2 px-5 py-2.5 text-base font-medium bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              <RotateCcw size={18} />
              Spróbuj ponownie
            </button>
            <button
              onClick={handleGuestClick}
              className="flex items-center gap-2 px-5 py-2.5 text-base font-semibold bg-gradient-to-r from-pink-600 to-orange-600 text-white rounded-xl hover:shadow-lg transition"
            >
              <UserPlus size={18} />
              Dodaj jako gościa
            </button>
          </div>
        </div>
      )}

      {/* Guest button */}
      <div className="mt-10">
        <button
          onClick={handleGuestClick}
          className="flex items-center gap-3 px-6 py-4 text-base font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 hover:border-pink-300 dark:hover:border-pink-600 transition"
        >
          <UserPlus size={20} className="text-pink-600 dark:text-pink-400" />
          Gość / Nowe dziecko
        </button>
      </div>
    </div>
  );
}
