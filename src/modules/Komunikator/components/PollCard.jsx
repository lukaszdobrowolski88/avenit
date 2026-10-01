import React from 'react';
import { BarChart3, Check, Users } from 'lucide-react';
import { tr } from '../../../i18n';

// Karta ankiety wewnątrz wiadomości. Samodzielna (neutralne tło).
export default function PollCard({ message, results, onVote }) {
  const meta = message.metadata || {};
  const question = meta.question || tr('Ankieta');
  const multiple = !!meta.multiple;
  const closesAt = meta.closes_at ? new Date(meta.closes_at) : null;
  const isClosed = closesAt ? closesAt.getTime() < Date.now() : false;

  const options = results?.options || (meta.options || []).map(o => ({ ...o, count: 0, percent: 0, hasVoted: false }));
  const totalVoters = results?.voterCount || 0;

  return (
    <div className="w-72 sm:w-80 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200/70 dark:border-gray-700/70 shadow-sm overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-start gap-2">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-accent-primary-light to-accent-secondary-light flex items-center justify-center flex-shrink-0">
          <BarChart3 size={16} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 dark:text-white break-words leading-snug">{question}</p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
            {multiple ? tr('Wielokrotny wybór') : tr('Jeden wybór')}
            {isClosed && ` · ${tr('Zamknięta')}`}
          </p>
        </div>
      </div>

      <div className="px-3 pb-2 space-y-1.5">
        {options.map(opt => (
          <button
            key={opt.id}
            type="button"
            onClick={() => !isClosed && onVote?.(message, opt.id)}
            disabled={isClosed}
            className={`relative w-full text-left rounded-xl overflow-hidden border transition-all ${
              opt.hasVoted
                ? 'border-accent-primary-light/60 dark:border-accent-primary/60'
                : 'border-gray-200/70 dark:border-gray-700/70 hover:border-accent-primary-light/40'
            } ${isClosed ? 'cursor-default' : 'cursor-pointer'}`}
          >
            {/* Pasek wyniku */}
            <div
              className={`absolute inset-y-0 left-0 transition-all duration-500 ${
                opt.hasVoted ? 'bg-accent-primary-lighter/60 dark:bg-accent-primary-darkest/40' : 'bg-gray-100 dark:bg-gray-700/40'
              }`}
              style={{ width: `${opt.percent}%` }}
            />
            <div className="relative flex items-center justify-between gap-2 px-3 py-2">
              <span className="flex items-center gap-1.5 text-sm text-gray-800 dark:text-gray-100 min-w-0">
                {opt.hasVoted && <Check size={14} className="text-accent-primary flex-shrink-0" />}
                <span className="truncate">{opt.text}</span>
              </span>
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex-shrink-0">
                {opt.percent}% · {opt.count}
              </span>
            </div>
          </button>
        ))}
      </div>

      <div className="px-4 pb-3 pt-1 flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500">
        <Users size={12} />
        {totalVoters === 0
          ? tr('Brak głosów')
          : tr('{n} głosujących', { n: totalVoters })}
      </div>
    </div>
  );
}
