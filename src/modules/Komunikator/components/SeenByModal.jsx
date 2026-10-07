import React from 'react';
import { Eye, Clock } from 'lucide-react';
import { tr, appLocale } from '../../../i18n';
import Modal from '../../../components/Modal';
import EmptyState from '../../../components/EmptyState';
import UserAvatar from './UserAvatar';
import { sameEmail, normEmail } from '../utils/chatLogic';

// „Widziane przez” (K6): kto przeczytał moją wiadomość i kiedy; poniżej — kto jeszcze nie.
const fmt = (iso) => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString(appLocale(), { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString(appLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export default function SeenByModal({ isOpen, onClose, seen = [], participants = [], senderEmail }) {
  if (!isOpen) return null;
  const personOf = (email) => participants.find((p) => sameEmail(p.user_email, email)) || { user_email: email };
  const seenKeys = new Set(seen.map((r) => normEmail(r.user_email)));
  const notYet = participants.filter((p) => !sameEmail(p.user_email, senderEmail) && !seenKeys.has(normEmail(p.user_email)));
  const nameOf = (p) => p.full_name || p.user_email;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={tr('Widziane przez')} icon={Eye} size="sm">
      <div className="px-4 py-3">
        {seen.length === 0 ? (
          <EmptyState compact icon={Eye} title={tr('Nikt jeszcze nie przeczytał')} />
        ) : (
          <>
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              {tr('Przeczytali: {n}', { n: seen.length })}
            </p>
            <ul className="space-y-0.5">
              {seen.map((r) => {
                const p = personOf(r.user_email);
                return (
                  <li key={r.user_email} className="flex items-center gap-3 px-2 py-2 rounded-xl">
                    <UserAvatar user={{ ...p, email: p.user_email }} size="sm" />
                    <span className="flex-1 min-w-0 truncate text-sm font-medium text-gray-900 dark:text-gray-100">{nameOf(p)}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">{fmt(r.read_at)}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {notYet.length > 0 && (
          <>
            <p className="mt-3 px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 flex items-center gap-1">
              <Clock size={11} aria-hidden="true" /> {tr('Jeszcze nie przeczytali: {n}', { n: notYet.length })}
            </p>
            <ul className="space-y-0.5">
              {notYet.map((p) => (
                <li key={p.user_email} className="flex items-center gap-3 px-2 py-1.5 rounded-xl opacity-70">
                  <UserAvatar user={{ ...p, email: p.user_email }} size="sm" />
                  <span className="flex-1 min-w-0 truncate text-sm text-gray-700 dark:text-gray-300">{nameOf(p)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}
