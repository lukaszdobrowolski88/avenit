import React, { useEffect, useRef, useState } from 'react';
import { useCheckin } from '../hooks/useCheckin';
import VirtualKeypad from './VirtualKeypad';
import Button from '../../../../components/Button';
import EmptyState from '../../../../components/EmptyState';
import { Check, CheckCircle, ClipboardList, RotateCcw, SearchX, Loader2, Lock } from 'lucide-react';
import { tr, appLocale } from '../../../../i18n';
import { PICKUP_CODE_LENGTH, CODE_KEYPAD_ROWS, lockoutRemaining } from '../utils/kiosk';
import { childrenCountLabel } from './HouseholdSelection';

const MAX_FAILED = 5;

// Odbiór dzieci po kodzie z naklejki (losowy kod nadany przy meldowaniu — nie telefon).
export default function CheckoutScreen({ session, kiosk = false, onGoToAttendance, keyboardActive = true }) {
  const [code, setCode] = useState('');
  const [searchResults, setSearchResults] = useState(null); // null = jeszcze nie szukano
  const [selectedCheckins, setSelectedCheckins] = useState({});
  const [searching, setSearching] = useState(false);
  const [checkedOutNames, setCheckedOutNames] = useState(null);
  const [failures, setFailures] = useState({ count: 0, at: 0 });
  const [now, setNow] = useState(Date.now());
  const resetTimer = useRef(null);

  const { searchBySecurityCode, checkOutMultiple, loading, error, clearError } = useCheckin();

  const lockMs = kiosk ? lockoutRemaining(failures.count, failures.at, now) : 0;
  useEffect(() => {
    if (!lockMs) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [lockMs]);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const reset = () => {
    setCode('');
    setSearchResults(null);
    setSelectedCheckins({});
    setCheckedOutNames(null);
    clearError();
  };

  const runSearch = async (value) => {
    if (!session || value.length !== PICKUP_CODE_LENGTH) return;
    setSearching(true);
    setSelectedCheckins({});
    try {
      const results = await searchBySecurityCode(session.id, value);
      setSearchResults(results);
      if (results.length === 0) {
        setFailures((f) => {
          const count = f.count >= MAX_FAILED ? 1 : f.count + 1;
          return { count, at: Date.now() };
        });
        setNow(Date.now());
      } else {
        setFailures({ count: 0, at: 0 });
        // Domyślnie zaznaczamy wszystkie dzieci z tego kodu (to jedna naklejka rodzica).
        setSelectedCheckins(Object.fromEntries(results.map((r) => [r.id, true])));
      }
    } finally {
      setSearching(false);
    }
  };

  const handleCodeChange = (value) => {
    setCode(value);
    if (value.length === PICKUP_CODE_LENGTH) runSearch(value);
  };

  const handleToggleSelect = (checkinId) => {
    setSelectedCheckins((prev) => ({ ...prev, [checkinId]: !prev[checkinId] }));
  };

  const handleCheckout = async () => {
    const selectedIds = Object.entries(selectedCheckins).filter(([, on]) => on).map(([id]) => id);
    if (selectedIds.length === 0) return;
    const done = await checkOutMultiple(selectedIds);
    if (done.length > 0) {
      const doneIds = new Set(done.map((r) => String(r.id)));
      setCheckedOutNames((searchResults || [])
        .filter((r) => doneIds.has(String(r.id)))
        .map((r) => (r.is_guest ? r.guest_name : r.kids_students?.full_name)));
      resetTimer.current = setTimeout(reset, 4000);
    }
  };

  const selectedCount = Object.values(selectedCheckins).filter(Boolean).length;

  if (checkedOutNames) {
    return (
      <div className="flex flex-col items-center justify-center px-5 py-16 text-center" role="status">
        <div className="w-20 h-20 bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 rounded-full flex items-center justify-center mb-5">
          <CheckCircle size={40} className="text-accent-primary dark:text-accent-primary-light" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">{tr('Odebrano!')}</h2>
        <p className="text-lg text-gray-700 dark:text-gray-300 mb-6">{checkedOutNames.join(', ')}</p>
        <Button size="lg" icon={Check} onClick={() => { clearTimeout(resetTimer.current); reset(); }}>
          {tr('Gotowe')}
        </Button>
      </div>
    );
  }

  if (!session) {
    return (
      <EmptyState
        icon={ClipboardList}
        title={tr('Dziś nikt nie jest jeszcze zameldowany')}
        subtitle={tr('Odbiór będzie możliwy po pierwszym meldowaniu dziecka.')}
      />
    );
  }

  const busy = searching || loading;
  const showResults = searchResults !== null && !busy;

  return (
    <div className="flex flex-col items-center px-5 py-6 sm:py-8">
      <div className="text-center mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
          {tr('Odbiór dzieci')}
        </h1>
        <p className="text-base text-gray-600 dark:text-gray-400">
          {tr('Wpisz kod odbioru z naklejki rodzica')}
        </p>
      </div>

      {error && (
        <div role="alert" className="w-full max-w-lg mb-4 p-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {lockMs > 0 ? (
        <div className="w-full max-w-md text-center p-6 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800" role="alert">
          <Lock size={28} className="mx-auto mb-2 text-gray-400" />
          <p className="text-base font-medium text-gray-800 dark:text-gray-100 mb-1">
            {tr('Za dużo nieudanych prób.')}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {tr('Spróbuj ponownie za {n} s albo poproś o pomoc obsługę.', { n: Math.ceil(lockMs / 1000) })}
          </p>
        </div>
      ) : showResults ? (
        searchResults.length === 0 ? (
          <div className="w-full max-w-md text-center p-5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800" role="alert">
            <SearchX size={28} className="mx-auto mb-2 text-gray-400" />
            <p className="text-base font-medium text-gray-800 dark:text-gray-100 mb-1">
              {tr('Nie znaleźliśmy dzieci z kodem {code}.', { code })}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              {tr('Sprawdź kod na naklejce albo poproś o pomoc obsługę.')}
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Button variant="secondary" size="lg" icon={RotateCcw} onClick={reset}>{tr('Wpisz ponownie')}</Button>
              {!kiosk && onGoToAttendance && (
                <Button variant="outline" size="lg" icon={ClipboardList} onClick={onGoToAttendance}>
                  {tr('Wydaj z listy obecności')}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="w-full max-w-lg">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {tr('Kod {code}', { code })} · {childrenCountLabel(searchResults.length)}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {searchResults.map((checkin) => {
                const name = checkin.is_guest ? checkin.guest_name : checkin.kids_students?.full_name;
                const isSelected = !!selectedCheckins[checkin.id];
                return (
                  <button
                    type="button"
                    key={checkin.id}
                    onClick={() => handleToggleSelect(checkin.id)}
                    aria-pressed={isSelected}
                    className={`flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition
                      ${isSelected
                        ? 'bg-accent-primary-lightest dark:bg-accent-primary-darkest/20 border-accent-primary'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-accent-primary'
                      }`}
                  >
                    <span className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition
                      ${isSelected ? 'bg-accent-primary border-accent-primary' : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600'}`}
                    >
                      {isSelected && <Check size={14} className="text-white" />}
                    </span>
                    <span className="flex-1">
                      <span className="block text-base font-semibold text-gray-900 dark:text-white">
                        {name}
                        {checkin.is_guest && (
                          <span className="ml-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-1.5 py-0.5 rounded text-[11px] font-bold">
                            {tr('Gość')}
                          </span>
                        )}
                      </span>
                      <span className="block text-sm text-gray-600 dark:text-gray-400">
                        {[checkin.checkin_locations?.name, tr('zameldowane o {time}', {
                          time: new Date(checkin.checked_in_at).toLocaleTimeString(appLocale(), { hour: '2-digit', minute: '2-digit' }),
                        })].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex gap-3 mt-6">
              <Button variant="secondary" size="lg" icon={RotateCcw} onClick={reset} className="flex-1 py-4">
                {tr('Inny kod')}
              </Button>
              <Button
                size="lg"
                icon={Check}
                onClick={handleCheckout}
                disabled={selectedCount === 0}
                loading={loading}
                className="flex-[2] py-4 text-lg"
              >
                {selectedCount > 0 ? tr('Wydaj ({n})', { n: selectedCount }) : tr('Wydaj')}
              </Button>
            </div>
          </div>
        )
      ) : (
        <>
          <div className="h-7 mb-2 flex items-center" aria-live="polite">
            {busy && (
              <span className="flex items-center gap-2 text-accent-primary dark:text-accent-primary-light text-base font-medium">
                <Loader2 size={20} className="animate-spin" />
                {tr('Szukam...')}
              </span>
            )}
          </div>
          <VirtualKeypad
            value={code}
            onChange={handleCodeChange}
            maxLength={PICKUP_CODE_LENGTH}
            disabled={busy}
            rows={CODE_KEYPAD_ROWS}
            label={tr('Kod odbioru')}
            captureKeyboard={keyboardActive}
          />
          {!kiosk && (
            <p className="mt-6 text-sm text-gray-500 dark:text-gray-400 text-center max-w-sm">
              {tr('Rodzic zgubił naklejkę? Sprawdź tożsamość i wydaj dziecko z listy obecności.')}
            </p>
          )}
        </>
      )}
    </div>
  );
}
