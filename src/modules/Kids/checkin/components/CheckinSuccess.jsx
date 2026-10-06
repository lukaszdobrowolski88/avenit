import React, { useEffect, useRef, useState } from 'react';
import { printLabels } from '../utils/labelGenerator';
import { splitStoredCodes } from '../utils/kiosk';
import { CheckCircle, Printer, Check, Info } from 'lucide-react';
import Button from '../../../../components/Button';
import { tr } from '../../../../i18n';

export default function CheckinSuccess({
  checkins,
  skipped = [],
  onDone,
  autoPrint = true,
  autoReturnSeconds = 8,
}) {
  const [countdown, setCountdown] = useState(autoReturnSeconds);
  const printedRef = useRef(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (autoPrint && checkins?.length > 0 && !printedRef.current) {
      printedRef.current = true;
      printLabels(checkins);
    }
  }, [autoPrint, checkins]);

  useEffect(() => {
    if (countdown <= 0) {
      doneRef.current?.();
      return undefined;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // Losowy kod odbioru (jeden na meldowanie rodziny); starsze meldowania mogą mieć kilka.
  const codes = [...new Set((checkins || []).flatMap((c) => splitStoredCodes(c.security_code)))];
  const isGuest = checkins?.some((c) => c.is_guest);
  const childrenNames = (checkins || []).map((c) => (c.is_guest ? c.guest_name : c.kids_students?.full_name || tr('Dziecko')));

  return (
    <div className="flex flex-col items-center justify-center px-5 py-8 min-h-full text-center">
      <div className="w-24 h-24 bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 rounded-full flex items-center justify-center mb-5 motion-safe:animate-[kidsScaleIn_0.3s_ease-out]">
        <CheckCircle size={48} className="text-accent-primary dark:text-accent-primary-light" />
      </div>

      <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
        {tr('Zameldowano!')}
      </h1>

      {codes.length > 0 && (
        <div className="bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 px-6 sm:px-10 py-5 rounded-2xl mb-5">
          <div className="text-sm text-gray-600 dark:text-gray-300 mb-2">
            {tr('Kod odbioru')}
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            {codes.map((code) => (
              <div key={code} className="text-5xl sm:text-6xl font-bold text-gray-900 dark:text-white tracking-[0.2em] tabular-nums">
                {code}
              </div>
            ))}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-300 mt-3 max-w-xs mx-auto">
            {tr('Zachowaj naklejkę z tym kodem — bez niej nie wydamy dziecka.')}
          </div>
        </div>
      )}

      <div className="mb-5">
        <div className="text-base text-gray-600 dark:text-gray-400 mb-1">
          {tr('Zameldowane dzieci:')}
        </div>
        <div className="text-xl font-semibold text-gray-900 dark:text-white">
          {childrenNames.join(', ')}
          {isGuest && (
            <span className="ml-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-2 py-0.5 rounded text-xs font-bold align-middle">
              {tr('Gość')}
            </span>
          )}
        </div>
      </div>

      {skipped.length > 0 && (
        <div className="flex items-center gap-2 mb-5 text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 px-4 py-2 rounded-xl">
          <Info size={16} />
          {tr('Pominięto dzieci zameldowane wcześniej: {n}', { n: skipped.length })}
        </div>
      )}

      <div className="flex items-center gap-2 mb-6 text-gray-500 dark:text-gray-400">
        <Printer size={20} />
        <span>{tr('Etykiety zostały wysłane do drukarki')}</span>
      </div>

      <div className="flex gap-4 mb-6 flex-wrap justify-center">
        <Button variant="secondary" size="lg" icon={Printer} onClick={() => printLabels(checkins)}>
          {tr('Drukuj ponownie')}
        </Button>
        <Button size="lg" icon={Check} onClick={() => onDone()}>
          {tr('Gotowe')}
        </Button>
      </div>

      <div className="text-sm text-gray-500 dark:text-gray-400" aria-live="off">
        {tr('Powrót do ekranu głównego za {n}s...', { n: countdown })}
      </div>

      <style>{`
        @keyframes kidsScaleIn {
          from { transform: scale(0.6); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
