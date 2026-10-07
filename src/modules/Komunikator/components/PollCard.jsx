import React from 'react';
import { BarChart3, Check, Users, Lock, EyeOff } from 'lucide-react';
import { tr, appLocale } from '../../../i18n';
import { pollOf, isPollClosed } from '../utils/chatLogic';

// Karta ankiety wewnątrz wiadomości (K7): wiele odpowiedzi, anonimowa, zamknięcie o czasie.
export default function PollCard({ message, results, onVote, nameOf = (e) => e }) {
  const poll = pollOf(message);
  const question = poll.question || tr('Ankieta');
  const closesAt = poll.closes_at ? new Date(poll.closes_at) : null;
  const isClosed = isPollClosed(poll);

  const options = results?.options || poll.options.map(o => ({ ...o, count: 0, percent: 0, hasVoted: false, voters: [] }));
  const total = results?.total || 0;
  const voters = results?.voterCount || 0;

  const meta = [
    poll.multiple ? tr('Wiele odpowiedzi') : tr('Jedna odpowiedź'),
    poll.anonymous ? tr('Anonimowa') : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="w-72 sm:w-80 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200/70 dark:border-gray-700/70 shadow-sm overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-start gap-2">
        <div className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
          <BarChart3 size={16} className="text-gray-700 dark:text-gray-200" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 dark:text-white break-words leading-snug">{question}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1">
            {poll.anonymous && <EyeOff size={11} aria-hidden="true" />}
            {meta}
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
            aria-pressed={!!opt.hasVoted}
            title={!poll.anonymous && opt.voters?.length ? opt.voters.map(nameOf).join(', ') : undefined}
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

      <div className="px-4 pb-3 pt-1 flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 flex-wrap">
        <Users size={12} aria-hidden="true" />
        <span>
          {total === 0
            ? tr('Brak głosów')
            : poll.anonymous
              ? tr('Głosów: {n}', { n: total })
              : tr('Głosujących: {n}', { n: voters })}
        </span>
        {isClosed ? (
          <span className="ml-auto flex items-center gap-1 font-semibold text-gray-700 dark:text-gray-200">
            <Lock size={11} aria-hidden="true" /> {tr('Ankieta zamknięta')}
          </span>
        ) : closesAt ? (
          <span className="ml-auto">
            {tr('Zamknięcie: {date}', { date: closesAt.toLocaleString(appLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })}
          </span>
        ) : null}
      </div>
    </div>
  );
}
