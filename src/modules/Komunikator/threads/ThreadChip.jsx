import React from 'react';
import UserAvatar from '../components/UserAvatar';
import { formatMessageTime } from '../utils/messageHelpers';
import { tr } from '../../../i18n';
import { replyCountOf, replyCountLabel } from './threadLogic';

// „N odpowiedzi · ostatnia 12:30” pod wiadomością główną — miękka pigułka z awatarami
// ostatnio odpowiadających; kliknięcie otwiera panel wątku.
export default function ThreadChip({ message, repliers = [], userOf, onOpen, align = 'start' }) {
  const n = replyCountOf(message);
  if (!n) return null;
  const last = message.thread_last_reply_at ? formatMessageTime(message.thread_last_reply_at) : null;
  return (
    <div className={`flex mt-1.5 ${align === 'end' ? 'justify-end' : 'justify-start'}`}>
      <button
        type="button"
        onClick={() => onOpen?.(message)}
        aria-label={tr('Otwórz wątek: {label}', { label: replyCountLabel(n) })}
        className="inline-flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-full bg-white dark:bg-gray-800 border border-gray-200/70 dark:border-gray-700/60 hover:bg-gray-50 dark:hover:bg-gray-700/60 text-xs transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/50"
      >
        {repliers.length > 0 && (
          <span className="flex -space-x-1.5" aria-hidden="true">
            {repliers.map((email) => (
              <UserAvatar key={email} user={userOf?.(email) || { email }} size="xs" />
            ))}
          </span>
        )}
        <span className="font-semibold text-gray-800 dark:text-gray-100">{replyCountLabel(n)}</span>
        {last && <span className="text-gray-500 dark:text-gray-400">{tr('ostatnia {time}', { time: last })}</span>}
      </button>
    </div>
  );
}
