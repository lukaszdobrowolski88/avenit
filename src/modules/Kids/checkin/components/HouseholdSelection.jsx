import React from 'react';
import { ArrowLeft, Users } from 'lucide-react';
import Button from '../../../../components/Button';
import { tr } from '../../../../i18n';
import { maskPhone, pluralForm } from '../utils/kiosk';

export const childrenCountLabel = (n) =>
  pluralForm(n, tr('{n} dziecko', { n }), tr('{n} dzieci', { n }), tr('{n} dzieci', { n }));

export default function HouseholdSelection({ households, onSelect, onBack }) {
  const n = households.length;
  const familiesLabel = pluralForm(
    n,
    tr('Znaleźliśmy {n} rodzinę z tym numerem', { n }),
    tr('Znaleźliśmy {n} rodziny z tym numerem', { n }),
    tr('Znaleźliśmy {n} rodzin z tym numerem', { n }),
  );

  return (
    <div className="flex flex-col items-center px-5 py-6 sm:py-8 min-h-full">
      <div className="text-center mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
          {tr('Wybierz rodzinę')}
        </h1>
        <p className="text-base text-gray-600 dark:text-gray-400">{familiesLabel}</p>
      </div>

      <div className="flex flex-col gap-4 w-full max-w-lg">
        {households.map((household) => {
          const primaryContact = household.parent_contacts?.find((c) => c.is_primary)
            || household.parent_contacts?.[0];
          const childrenCount = household.kids_students?.length || 0;
          // Na ekranie kiosku nie pokazujemy pełnych numerów innych rodzin.
          const masked = maskPhone(primaryContact?.phone);

          return (
            <button
              key={household.id}
              type="button"
              onClick={() => onSelect(household)}
              className="flex flex-col items-start p-5 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl cursor-pointer transition text-left w-full hover:border-accent-primary dark:hover:border-accent-primary-light hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/20 focus:outline-none focus-visible:ring-4 focus-visible:ring-accent-primary/30"
            >
              <div className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                {household.name}
              </div>
              {primaryContact && (
                <div className="text-base text-gray-600 dark:text-gray-400">
                  {primaryContact.full_name}
                  {masked && <span className="tabular-nums">{` • ${masked}`}</span>}
                </div>
              )}
              <div className="flex items-center gap-2 mt-3">
                <span className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1 rounded-full text-sm font-semibold">
                  <Users size={14} />
                  {childrenCountLabel(childrenCount)}
                </span>
              </div>
              {childrenCount > 0 && (
                <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {household.kids_students.map((s) => s.full_name).join(', ')}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <Button variant="secondary" size="lg" icon={ArrowLeft} onClick={onBack} className="mt-8">
        {tr('Wróć do wyszukiwania')}
      </Button>
    </div>
  );
}
