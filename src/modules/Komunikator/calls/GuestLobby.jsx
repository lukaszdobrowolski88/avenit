import React from 'react';
import { UserPlus, Check, X } from 'lucide-react';
import UserAvatar from '../components/UserAvatar';
import { tr } from '../../../i18n';

// Poczekalnia gości — karta nad oknem rozmowy (pełnym i mini) dla osób w rozmowie:
// „Gość chce dołączyć: Anna” z Wpuść / Odrzuć. Kilku gości — po kolei (najstarszy pierwszy),
// z licznikiem pozostałych. Bez pułapki fokusu: nie przerywa rozmowy, Tab dochodzi do przycisków.
export default function GuestLobby({ queue, onAdmit, onDeny }) {
  if (!queue?.length) return null;
  const [first, ...rest] = queue;
  const name = first.guest_name || tr('Gość');
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[97] w-[min(26rem,calc(100vw-2rem))]" role="region" aria-label={tr('Poczekalnia gości')}>
      <div className="rounded-2xl bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-2xl ring-1 ring-black/5 dark:ring-white/10 p-4 animate-[slideIn_.2s_ease]">
        <div className="flex items-center gap-3" role="status" aria-live="polite">
          <UserAvatar user={{ full_name: name, email: first.id }} size="md" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 inline-flex items-center gap-1">
              <UserPlus size={12} aria-hidden="true" /> {tr('Gość chce dołączyć')}
            </p>
            <p className="font-semibold truncate">{name}</p>
            {rest.length > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{tr('i jeszcze {n} w poczekalni', { n: rest.length })}</p>
            )}
          </div>
        </div>
        <div className="mt-3 flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => onDeny(first.id)}
            aria-label={tr('Odrzuć: {name}', { name })}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
          >
            <X size={16} aria-hidden="true" /> {tr('Odrzuć')}
          </button>
          <button
            type="button"
            onClick={() => onAdmit(first.id)}
            aria-label={tr('Wpuść: {name}', { name })}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2"
          >
            <Check size={16} aria-hidden="true" /> {tr('Wpuść')}
          </button>
        </div>
      </div>
    </div>
  );
}
