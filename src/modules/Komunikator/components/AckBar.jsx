import React from 'react';
import { AlertCircle, Check, Loader, Users } from 'lucide-react';
import { tr } from '../../../i18n';

// „Ważne — potwierdź przeczytanie” pod dymkiem wiadomości (migracja 115).
//  • odbiorca: plakietka „Ważne” + „Rozumiem” (po kliknięciu — „Potwierdzono”),
//  • nadawca / administrator rozmowy: „Potwierdziło X z Y” → lista osób i przypomnienie.
export default function AckBar({
  isOwn = false,
  mine = false,
  busy = false,
  count = 0,
  total = 0,
  canManage = false,
  onAck,
  onOpenStatus,
}) {
  const needsMyAck = !isOwn && !mine;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 mt-1 ${isOwn ? 'justify-end pr-1' : 'pl-10'}`}>
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${needsMyAck
          ? 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-900/20 dark:text-amber-200 dark:border-amber-800/60'
          : 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'}`}
      >
        <AlertCircle size={12} aria-hidden="true" />
        {tr('Ważne')}
      </span>

      {!isOwn && (mine ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-gray-500 dark:text-gray-400">
          <Check size={12} aria-hidden="true" /> {tr('Potwierdzono')}
        </span>
      ) : (
        <button
          type="button"
          onClick={onAck}
          disabled={busy || !onAck}
          className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 disabled:opacity-60 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
        >
          {busy ? <Loader size={12} className="animate-spin" aria-hidden="true" /> : <Check size={12} aria-hidden="true" />}
          {tr('Rozumiem')}
        </button>
      ))}

      {canManage && (
        <button
          type="button"
          onClick={onOpenStatus}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-gray-600 dark:text-gray-300 bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
          aria-label={tr('Kto potwierdził: {n} z {total}', { n: count, total })}
        >
          <Users size={12} aria-hidden="true" />
          {tr('Potwierdziło {n} z {total}', { n: count, total })}
        </button>
      )}
    </div>
  );
}
