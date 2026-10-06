import React, { useState, useEffect, useRef } from 'react';
import VirtualKeypad from './VirtualKeypad';
import Button from '../../../../components/Button';
import { UserPlus, RotateCcw, Loader2, SearchX } from 'lucide-react';
import { tr } from '../../../../i18n';

// Krok 1 meldowania: 4 ostatnie cyfry telefonu rodzica. Wynik „nie znaleziono” pokazujemy
// ZAMIAST klawiatury (wcześniej lądował pod linią przewijania i wyglądało to na zawieszenie).
export default function PhoneSearchScreen({
  onHouseholdFound,
  onMultipleHouseholds,
  onGuestClick,
  searchByPhone,
  loading,
  keyboardActive = true,
}) {
  const [phoneDigits, setPhoneDigits] = useState('');
  const [searching, setSearching] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const resultRef = useRef(null);

  useEffect(() => {
    if (phoneDigits.length === 4) {
      handleSearch(phoneDigits);
    } else {
      setNoResults(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoneDigits]);

  useEffect(() => {
    if (noResults) resultRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [noResults]);

  const handleSearch = async (digits) => {
    setSearching(true);
    setNoResults(false);
    try {
      const results = await searchByPhone(digits);
      if (results.length === 0) {
        setNoResults(true);
      } else if (results.length === 1) {
        onHouseholdFound(results[0]);
      } else {
        onMultipleHouseholds(results);
      }
    } finally {
      setSearching(false);
    }
  };

  const handleClear = () => {
    setPhoneDigits('');
    setNoResults(false);
  };

  const busy = searching || loading;

  return (
    <div className="flex flex-col items-center px-5 py-6 sm:py-8 min-h-full">
      <div className="text-center mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
          {tr('Meldowanie dzieci')}
        </h1>
        <p className="text-base sm:text-lg text-gray-600 dark:text-gray-400">
          {tr('Wpisz ostatnie 4 cyfry numeru telefonu rodzica')}
        </p>
      </div>

      {noResults && !busy ? (
        <div ref={resultRef} className="w-full max-w-md text-center">
          <div className="flex gap-3 mb-5 justify-center" aria-hidden="true">
            {phoneDigits.split('').map((d, i) => (
              <div key={i} className="w-14 h-16 border-2 border-gray-300 dark:border-gray-600 rounded-xl flex items-center justify-center text-3xl font-bold text-gray-900 dark:text-white">
                {d}
              </div>
            ))}
          </div>
          <div className="p-5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800" role="alert">
            <SearchX size={28} className="mx-auto mb-2 text-gray-400" />
            <p className="text-base font-medium text-gray-800 dark:text-gray-100 mb-1">
              {tr('Nie znaleźliśmy rodziny z numerem kończącym się na {digits}.', { digits: phoneDigits })}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              {tr('Sprawdź cyfry albo zamelduj dziecko jako gościa.')}
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Button variant="secondary" size="lg" icon={RotateCcw} onClick={handleClear}>
                {tr('Wpisz ponownie')}
              </Button>
              <Button size="lg" icon={UserPlus} onClick={() => onGuestClick?.()}>
                {tr('Zamelduj jako gościa')}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="h-7 mb-2 flex items-center" aria-live="polite">
            {busy && (
              <span className="flex items-center gap-2 text-accent-primary dark:text-accent-primary-light text-base font-medium">
                <Loader2 size={20} className="animate-spin" />
                {tr('Szukam rodziny...')}
              </span>
            )}
          </div>
          <VirtualKeypad
            value={phoneDigits}
            onChange={setPhoneDigits}
            maxLength={4}
            disabled={busy}
            label={tr('Cyfry numeru telefonu')}
            captureKeyboard={keyboardActive}
          />
          <div className="mt-8">
            <Button variant="outline" size="lg" icon={UserPlus} onClick={() => onGuestClick?.()}>
              {tr('Pierwszy raz u nas? Zamelduj gościa')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
