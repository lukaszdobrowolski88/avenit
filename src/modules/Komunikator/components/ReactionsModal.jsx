import React, { useEffect, useMemo, useState } from 'react';
import { Smile } from 'lucide-react';
import { tr } from '../../../i18n';
import Modal from '../../../components/Modal';
import UserAvatar from './UserAvatar';

// „Reakcje”: kto zareagował na wiadomość — zakładka „Wszystkie” i po jednej na każde emoji.
// Dane: zakładki z reactionTabs (packages/shared/src/lib/reactionPeople.js), avatar z userOf
// (skład rozmowy, który klient już ma). Moją reakcję można tu od razu usunąć.
export default function ReactionsModal({ isOpen, onClose, tabs = [], total = 0, initialEmoji = null, userOf, onRemoveMine }) {
  const [active, setActive] = useState(initialEmoji || 'all');
  useEffect(() => { if (isOpen) setActive(initialEmoji || 'all'); }, [isOpen, initialEmoji]);

  // Zakładka zniknęła (np. ktoś cofnął ostatnią reakcję tym emoji) — wracamy do „Wszystkie”.
  const current = active === 'all' ? null : tabs.find((t) => t.emoji === active);
  const rows = useMemo(() => (current
    ? current.people.map((p) => ({ ...p, emoji: current.emoji }))
    : tabs.flatMap((t) => t.people.map((p) => ({ ...p, emoji: t.emoji })))), [current, tabs]);

  if (!isOpen) return null;
  const tabClass = (on) => `flex-shrink-0 px-3 py-1.5 text-sm font-medium rounded-xl transition-colors flex items-center gap-1.5 ${on
    ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-sm'
    : 'text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800'}`;
  const selected = current ? current.emoji : 'all';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={tr('Reakcje')} icon={Smile} size="sm">
      <div className="sticky top-0 z-10 flex gap-1.5 overflow-x-auto px-4 py-2 border-b border-gray-200/50 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-900"
        role="tablist" aria-label={tr('Reakcje')}>
        <button type="button" role="tab" aria-selected={selected === 'all'} onClick={() => setActive('all')} className={tabClass(selected === 'all')}>
          {tr('Wszystkie')} <span className="tabular-nums opacity-70">{total}</span>
        </button>
        {tabs.map((t) => (
          <button key={t.emoji} type="button" role="tab" aria-selected={selected === t.emoji}
            aria-label={tr('Reakcja {emoji}: {n}', { emoji: t.emoji, n: t.people.length })}
            onClick={() => setActive(t.emoji)} className={tabClass(selected === t.emoji)}>
            <span className="text-base leading-none">{t.emoji}</span>
            <span className="tabular-nums opacity-70">{t.people.length}</span>
          </button>
        ))}
      </div>
      <ul className="px-4 py-3 space-y-0.5" role="tabpanel">
        {rows.map((p) => {
          const user = userOf ? userOf(p.email) : { email: p.email };
          return (
            <li key={`${p.emoji}|${p.email}`} className="flex items-center gap-3 px-2 py-2 rounded-xl">
              <UserAvatar user={{ ...user, full_name: user?.full_name || p.name, email: p.email }} size="sm" />
              <span className="flex-1 min-w-0">
                <span className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100">{p.me ? tr('Ty') : p.name}</span>
                {p.me && onRemoveMine && (
                  <button type="button" onClick={() => onRemoveMine(p.emoji)}
                    className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:underline">
                    {tr('Usuń moją reakcję')}
                  </button>
                )}
              </span>
              <span className="text-lg leading-none flex-shrink-0" aria-hidden={selected !== 'all'}>{p.emoji}</span>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
