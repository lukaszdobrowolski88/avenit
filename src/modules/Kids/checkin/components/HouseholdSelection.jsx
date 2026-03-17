import React from 'react';
import { ArrowLeft, Users } from 'lucide-react';

export default function HouseholdSelection({ households, onSelect, onBack }) {
  return (
    <div className="flex flex-col items-center px-5 py-10 min-h-full">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-3">
          Wybierz rodzinę
        </h1>
        <p className="text-base text-gray-600 dark:text-gray-400">
          Znaleziono {households.length} rodzin z tym numerem telefonu
        </p>
      </div>

      {/* Household cards */}
      <div className="flex flex-col gap-4 w-full max-w-lg">
        {households.map((household) => {
          const primaryContact = household.parent_contacts?.find(c => c.is_primary)
            || household.parent_contacts?.[0];
          const childrenCount = household.kids_students?.length || 0;

          return (
            <button
              key={household.id}
              onClick={() => onSelect(household)}
              className="flex flex-col items-start p-5 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl cursor-pointer transition-all text-left w-full hover:border-pink-500 dark:hover:border-pink-400 hover:bg-pink-50 dark:hover:bg-pink-900/20"
            >
              {/* Family name */}
              <div className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                {household.family_name}
              </div>

              {/* Primary contact */}
              {primaryContact && (
                <div className="text-base text-gray-600 dark:text-gray-400 mb-1">
                  {primaryContact.full_name}
                  {primaryContact.phone && ` • ${primaryContact.phone}`}
                </div>
              )}

              {/* Children count */}
              <div className="flex items-center gap-2 mt-2">
                <span className="flex items-center gap-1.5 bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300 px-3 py-1 rounded-full text-sm font-semibold">
                  <Users size={14} />
                  {childrenCount} {childrenCount === 1 ? 'dziecko' : childrenCount < 5 ? 'dzieci' : 'dzieci'}
                </span>
              </div>

              {/* Children names preview */}
              {household.kids_students?.length > 0 && (
                <div className="mt-3 text-sm text-gray-500 dark:text-gray-500">
                  {household.kids_students.map(s => s.full_name).join(', ')}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Back button */}
      <button
        onClick={onBack}
        className="mt-8 flex items-center gap-2 px-6 py-3 text-base font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition"
      >
        <ArrowLeft size={18} />
        Wróć do wyszukiwania
      </button>
    </div>
  );
}
