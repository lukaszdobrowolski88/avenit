import React, { useState } from 'react';
import { useCheckin } from '../hooks/useCheckin';
import VirtualKeypad from './VirtualKeypad';
import { Search, Check, CheckCircle, Loader2 } from 'lucide-react';

export default function CheckoutScreen({ session }) {
  const [searchValue, setSearchValue] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedCheckins, setSelectedCheckins] = useState({});
  const [searching, setSearching] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);
  const [checkedOutNames, setCheckedOutNames] = useState([]);

  const { searchBySecurityCode, checkOutMultiple, loading } = useCheckin();

  const handleSearch = async () => {
    if (searchValue.length !== 4 || !session) return;

    setSearching(true);
    setSearchResults([]);
    setSelectedCheckins({});

    try {
      // Szukaj po 4 cyfrach telefonu (kod bezpieczeństwa)
      const results = await searchBySecurityCode(session.id, searchValue);

      setSearchResults(results);

      if (results.length === 1) {
        setSelectedCheckins({ [results[0].id]: true });
      }
    } finally {
      setSearching(false);
    }
  };

  const handleToggleSelect = (checkinId) => {
    setSelectedCheckins(prev => ({
      ...prev,
      [checkinId]: !prev[checkinId]
    }));
  };

  const handleSelectAll = () => {
    const allSelected = {};
    searchResults.forEach(r => {
      allSelected[r.id] = true;
    });
    setSelectedCheckins(allSelected);
  };

  const handleCheckout = async () => {
    const selectedIds = Object.entries(selectedCheckins)
      .filter(([_, isSelected]) => isSelected)
      .map(([id]) => id);

    if (selectedIds.length === 0) return;

    const results = await checkOutMultiple(selectedIds);

    if (results.length > 0) {
      const names = searchResults
        .filter(r => selectedIds.includes(r.id))
        .map(r => r.is_guest ? r.guest_name : r.kids_students?.full_name);

      setCheckedOutNames(names);
      setCheckoutSuccess(true);

      setTimeout(() => {
        setCheckoutSuccess(false);
        setSearchValue('');
        setSearchResults([]);
        setSelectedCheckins({});
        setCheckedOutNames([]);
      }, 3000);
    }
  };

  const handleClear = () => {
    setSearchValue('');
    setSearchResults([]);
    setSelectedCheckins({});
  };

  const selectedCount = Object.values(selectedCheckins).filter(Boolean).length;

  // Success screen
  if (checkoutSuccess) {
    return (
      <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
        <div className="w-20 h-20 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center mb-6">
          <CheckCircle size={40} className="text-green-500 dark:text-green-400" />
        </div>
        <h2 className="text-2xl font-bold text-green-500 dark:text-green-400 mb-4">
          Odebrano!
        </h2>
        <p className="text-lg text-gray-700 dark:text-gray-300">
          {checkedOutNames.join(', ')}
        </p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-10 text-center text-gray-500 dark:text-gray-400">
        Brak aktywnej sesji. Przejdź do ustawień, aby utworzyć sesję.
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center px-5 py-10">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Checkout - Odbiór dzieci
        </h1>
        <p className="text-base text-gray-600 dark:text-gray-400">
          Wpisz ostatnie 4 cyfry swojego numeru telefonu
        </p>
      </div>

      {/* Search input - klawiatura numeryczna dla 4 cyfr telefonu */}
      <div className="mb-6">
        <VirtualKeypad
          value={searchValue}
          onChange={setSearchValue}
          maxLength={4}
          disabled={searching}
        />
        <button
          onClick={handleSearch}
          disabled={searchValue.length !== 4 || searching}
          className={`w-full mt-4 flex items-center justify-center gap-2 px-6 py-3.5 text-base font-semibold rounded-xl transition
            ${searchValue.length === 4
              ? 'bg-gradient-to-r from-pink-600 to-orange-600 text-white hover:shadow-lg cursor-pointer'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
            }`}
        >
          {searching ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Szukam...
            </>
          ) : (
            <>
              <Search size={18} />
              Szukaj dzieci
            </>
          )}
        </button>
      </div>

      {/* Results */}
      {searchResults.length > 0 && (
        <div className="w-full max-w-lg mt-4">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Znaleziono {searchResults.length} {searchResults.length === 1 ? 'dziecko' : 'dzieci'}
            </span>
            {searchResults.length > 1 && (
              <button
                onClick={handleSelectAll}
                className="px-3 py-1.5 text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition"
              >
                Zaznacz wszystkie
              </button>
            )}
          </div>

          {/* Children list */}
          <div className="flex flex-col gap-3">
            {searchResults.map((checkin) => {
              const name = checkin.is_guest
                ? checkin.guest_name
                : checkin.kids_students?.full_name;
              const isSelected = selectedCheckins[checkin.id];

              return (
                <div
                  key={checkin.id}
                  onClick={() => handleToggleSelect(checkin.id)}
                  className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition
                    ${isSelected
                      ? 'bg-pink-50 dark:bg-pink-900/20 border-pink-500 dark:border-pink-400'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-pink-300 dark:hover:border-pink-600'
                    }`}
                >
                  {/* Checkbox */}
                  <div
                    className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition
                      ${isSelected
                        ? 'bg-pink-600 border-pink-600'
                        : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600'
                      }`}
                  >
                    {isSelected && <Check size={14} className="text-white" />}
                  </div>

                  {/* Info */}
                  <div className="flex-1">
                    <div className="text-base font-semibold text-gray-900 dark:text-white">
                      {name}
                      {checkin.is_guest && (
                        <span className="ml-2 bg-amber-400 dark:bg-amber-500 text-black px-1.5 py-0.5 rounded text-[10px] font-bold">
                          GOŚĆ
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {checkin.checkin_locations?.name}
                      {' • '}
                      Check-in:{' '}
                      {new Date(checkin.checked_in_at).toLocaleTimeString('pl-PL', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Checkout button */}
          <button
            onClick={handleCheckout}
            disabled={selectedCount === 0 || loading}
            className={`w-full mt-6 flex items-center justify-center gap-2 px-6 py-4 text-lg font-semibold rounded-xl transition
              ${selectedCount > 0
                ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:shadow-lg cursor-pointer'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
              }`}
          >
            {loading ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Przetwarzanie...
              </>
            ) : (
              <>
                <Check size={20} />
                Odbierz {selectedCount > 0 ? `(${selectedCount})` : ''}
              </>
            )}
          </button>
        </div>
      )}

      {/* No results */}
      {searchResults.length === 0 && searchValue && !searching && (
        <div className="mt-6 text-center p-5 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-2xl max-w-md">
          <p className="text-base text-amber-800 dark:text-amber-200 mb-4">
            Nie znaleziono aktywnych check-inów dla tego kodu.
          </p>
          <button
            onClick={handleClear}
            className="px-5 py-2.5 text-base font-medium bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition"
          >
            Spróbuj ponownie
          </button>
        </div>
      )}
    </div>
  );
}
