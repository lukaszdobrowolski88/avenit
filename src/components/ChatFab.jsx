import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { useCan } from './Can';
import { useNotificationContext } from '../contexts/NotificationContext';
import { tr } from '../i18n';

// Okrągły przycisk Komunikatora w prawym dolnym rogu (każda trasa poza samym Komunikatorem).
// Licznik = nieprzeczytane powiadomienia o wiadomościach (message/mention) — od migracji 110
// znikają po przeczytaniu rozmowy, więc odpowiadają nieprzeczytanym wiadomościom.
export function unreadMessageCount(notifications) {
  return (notifications || []).filter((n) => !n.read && (n.type === 'message' || n.type === 'mention')).length;
}

export default function ChatFab() {
  const { pathname } = useLocation();
  const allowed = useCan('module:komunikator');
  const { notifications, refetch } = useNotificationContext();
  const onChat = pathname.startsWith('/komunikator');

  // Po wyjściu z Komunikatora licznik odświeżamy (przeczytanie oznacza powiadomienia po stronie bazy).
  useEffect(() => {
    if (!onChat) refetch?.();
  }, [onChat]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!allowed || onChat) return null;
  const unread = unreadMessageCount(notifications);
  const label = unread
    ? tr('Komunikator — nieprzeczytane: {n}', { n: unread })
    : tr('Komunikator');

  return (
    <Link
      to="/komunikator"
      aria-label={label}
      title={label}
      className="fixed bottom-4 right-4 z-[55] w-14 h-14 rounded-full flex items-center justify-center bg-accent-primary text-white shadow-lg hover:-translate-y-0.5 transition-transform focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-primary-light/50"
    >
      <MessageCircle size={26} strokeWidth={2.2} aria-hidden="true" />
      {unread > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1.5 rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-bold flex items-center justify-center ring-2 ring-white dark:ring-gray-900"
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}
