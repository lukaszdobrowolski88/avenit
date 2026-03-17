import React, { useEffect, useState } from 'react';
import { printLabels } from '../utils/labelGenerator';
import { CheckCircle, Printer, Check } from 'lucide-react';

export default function CheckinSuccess({
  checkins,
  onDone,
  autoPrint = true,
  autoReturnSeconds = 5
}) {
  const [countdown, setCountdown] = useState(autoReturnSeconds);
  const [printed, setPrinted] = useState(false);

  useEffect(() => {
    if (autoPrint && checkins?.length > 0 && !printed) {
      printLabels(checkins);
      setPrinted(true);
    }
  }, [autoPrint, checkins, printed]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      onDone();
    }
  }, [countdown, onDone]);

  const handlePrintAgain = () => {
    printLabels(checkins);
  };

  const handleDoneNow = () => {
    onDone();
  };

  // Pobierz listę kodów bezpieczeństwa (ostatnie 4 cyfry telefonów osób z can_pickup)
  const securityCodesList = checkins?.[0]?.security_codes_list || [];
  // Alternatywnie parsuj z security_code jeśli security_codes_list nie jest dostępne
  const securityCodesFromField = checkins?.[0]?.security_code?.split('|') || [];
  const displayCodes = securityCodesList.length > 0
    ? securityCodesList
    : securityCodesFromField.map(code => ({ code, name: '' }));

  const isGuest = checkins?.some(c => c.is_guest);

  const childrenNames = checkins?.map(c => {
    if (c.is_guest) return c.guest_name;
    return c.kids_students?.full_name || 'Nieznane';
  }) || [];

  return (
    <div className="flex flex-col items-center justify-center px-5 py-10 min-h-full text-center">
      {/* Success icon */}
      <div className="w-24 h-24 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center mb-6 animate-[scaleIn_0.3s_ease-out]">
        <CheckCircle size={48} className="text-green-500 dark:text-green-400" />
      </div>

      {/* Title */}
      <h1 className="text-3xl sm:text-4xl font-bold text-green-500 dark:text-green-400 mb-4">
        Zameldowano!
      </h1>

      {/* Security codes */}
      <div className="bg-pink-50 dark:bg-pink-900/30 px-6 sm:px-10 py-5 rounded-2xl mb-6">
        <div className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          {displayCodes.length > 1 ? 'Kody bezpieczeństwa (ostatnie 4 cyfry telefonu)' : 'Kod bezpieczeństwa'}
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          {displayCodes.map((codeInfo, index) => (
            <div key={index} className="flex flex-col items-center">
              <div className="text-4xl sm:text-5xl font-bold text-pink-600 dark:text-pink-400 tracking-widest">
                {codeInfo.code}
              </div>
              {codeInfo.name && (
                <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  {codeInfo.name}
                </div>
              )}
            </div>
          ))}
        </div>
        {displayCodes.length > 1 && (
          <div className="text-xs text-gray-500 dark:text-gray-500 mt-3 text-center">
            Każdy z tych kodów może być użyty do odbioru dziecka
          </div>
        )}
      </div>

      {/* Children list */}
      <div className="mb-8">
        <div className="text-base text-gray-600 dark:text-gray-400 mb-2">
          Zameldowane dzieci:
        </div>
        <div className="text-xl font-semibold text-gray-900 dark:text-white">
          {childrenNames.join(', ')}
          {isGuest && (
            <span className="ml-2 bg-amber-400 dark:bg-amber-500 text-black px-2 py-0.5 rounded text-xs font-bold align-middle">
              GOŚĆ
            </span>
          )}
        </div>
      </div>

      {/* Print info */}
      <div className="flex items-center gap-2 mb-8 text-gray-500 dark:text-gray-400">
        <Printer size={20} />
        <span>Etykiety zostały wysłane do drukarki</span>
      </div>

      {/* Actions */}
      <div className="flex gap-4 mb-8">
        <button
          onClick={handlePrintAgain}
          className="flex items-center gap-2 px-5 py-3 text-base font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition"
        >
          <Printer size={18} />
          Drukuj ponownie
        </button>
        <button
          onClick={handleDoneNow}
          className="flex items-center gap-2 px-5 py-3 text-base font-medium bg-gradient-to-r from-pink-600 to-orange-600 text-white rounded-xl hover:shadow-lg transition"
        >
          <Check size={18} />
          Gotowe
        </button>
      </div>

      {/* Auto return countdown */}
      <div className="text-sm text-gray-400 dark:text-gray-500">
        Powrót do ekranu głównego za {countdown}s...
      </div>

      <style>{`
        @keyframes scaleIn {
          from {
            transform: scale(0);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
