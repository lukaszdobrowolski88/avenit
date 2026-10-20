import React from 'react';
import { tr } from '../../i18n';
import { STATUS_COLORS } from '../../components/ui/DataTable';

// Status osoby w zespole (worship_team / media_team: kolumna status „Aktywny” | „Nieaktywny”,
// puste = aktywna — tak samo zapisuje mobilka). Nieaktywna osoba nie pojawia się przy
// przypisywaniu do grafiku ani w propozycjach obsady (ScheduleTab).
export const MEMBER_STATUSES = ['Aktywny', 'Nieaktywny'];
export const isInactiveStatus = (status) => status === 'Nieaktywny';
export const memberStatusColor = (status) => (isInactiveStatus(status) ? STATUS_COLORS.neutral : STATUS_COLORS.success);

export default function MemberStatusField({ value, onChange }) {
  const current = isInactiveStatus(value) ? 'Nieaktywny' : 'Aktywny';
  return (
    <div>
      <span id="member-status-label" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Status')}</span>
      <div role="radiogroup" aria-labelledby="member-status-label" className="flex gap-2">
        {MEMBER_STATUSES.map((s) => {
          const on = current === s;
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(s)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                on
                  ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {tr(s)}
            </button>
          );
        })}
      </div>
      {current === 'Nieaktywny' && (
        <p className="mt-1.5 ml-1 text-xs text-gray-500 dark:text-gray-400">{tr('Nieaktywna osoba nie pojawia się przy przypisywaniu do grafiku.')}</p>
      )}
    </div>
  );
}
