import React from 'react';
import { X, User } from 'lucide-react';
import CustomSelect from '../../../components/CustomSelect';
import { tr } from '../../../i18n';
import { POST_STATUS_LABELS } from '@avenit/shared/src/lib/social.js';
import { EMPTY_FILTERS, filtersActive } from '../lib/socialUi';
import ChannelAvatar, { channelName } from './ChannelAvatar';

// Filtry kalendarza i list: kanały (awatary), status (tylko kalendarz/opublikowane), tylko moje.
export default function FilterBar({ accounts, filters, onChange, statuses }) {
  if (!accounts.length) return null;
  const set = (patch) => onChange({ ...filters, ...patch });
  const toggleAcc = (id) => set({ accounts: filters.accounts.includes(id) ? filters.accounts.filter((x) => x !== id) : [...filters.accounts, id] });
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1" role="group" aria-label={tr('Filtruj po kanale')}>
        {accounts.map((a) => {
          const on = filters.accounts.includes(a.id);
          return (
            <button key={a.id} type="button" onClick={() => toggleAcc(a.id)} aria-pressed={on} title={channelName(a)} className="rounded-full p-0.5">
              <ChannelAvatar account={a} size={28} selected={on} dimmed={filters.accounts.length > 0 && !on} />
            </button>
          );
        })}
      </div>
      {statuses?.length > 0 && (
        <div className="w-48">
          <CustomSelect
            value={filters.status}
            onChange={(v) => set({ status: v || '' })}
            options={[{ value: '', label: tr('Wszystkie statusy') }, ...statuses.map((s) => ({ value: s, label: tr(POST_STATUS_LABELS[s]) }))]}
            compact
            aria-label={tr('Status')}
          />
        </div>
      )}
      <button type="button" onClick={() => set({ mine: !filters.mine })} aria-pressed={filters.mine}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${filters.mine ? 'bg-accent-primary text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}>
        <User size={13} aria-hidden="true" />{tr('Tylko moje')}
      </button>
      {filtersActive(filters) && (
        <button type="button" onClick={() => onChange(EMPTY_FILTERS)} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
          <X size={13} aria-hidden="true" />{tr('Wyczyść filtry')}
        </button>
      )}
    </div>
  );
}
