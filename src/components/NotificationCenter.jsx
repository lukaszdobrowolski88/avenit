import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, X, MessageSquare, AtSign, CheckSquare, Calendar, CalendarCheck, CheckCheck } from 'lucide-react';
import { useNotificationContext } from '../contexts/NotificationContext';
import { formatDistanceToNow } from 'date-fns';
import { pl } from 'date-fns/locale';
import { useT } from '../i18n';

// Rodzaj powiadomienia → ikona + krótka etykieta (PL — tłumaczona przy rysowaniu).
// Wzmianka w komentarzu zadania (data.item_id) to coś innego niż wzmianka w czacie.
export function notificationKind(n) {
  const type = n?.type;
  if (type === 'task') return { icon: CheckSquare, label: 'Zadanie' };
  if (type === 'mention') return { icon: AtSign, label: n?.data?.item_id ? 'Wzmianka w zadaniu' : 'Wzmianka' };
  if (type === 'message') return { icon: MessageSquare, label: 'Wiadomość' };
  if (type === 'assignment') return { icon: CalendarCheck, label: 'Służba' };
  if (type === 'event') return { icon: Calendar, label: 'Wydarzenie' };
  return { icon: Bell, label: null };
}

// Rozmowa w Komunikatorze → jedna pozycja (wzmianki z komentarzy zadań NIE są łączone).
const chatKey = (n) => {
  const conv = n?.data?.conversation_id;
  if (conv) return `msg:${conv}`;
  return n?.type === 'message' && n.link ? `msg:${n.link}` : null;
};

// Link wewnętrzny: ścieżka aplikacji (albo pełny adres tej samej domeny → ścieżka).
export function internalPath(link) {
  const s = String(link || '');
  if (!s) return null;
  if (s.startsWith('/')) return s;
  try {
    const u = new URL(s);
    if (typeof window !== 'undefined' && u.origin === window.location.origin) return `${u.pathname}${u.search}${u.hash}`;
  } catch { /* nie URL */ }
  return null;
}

export default function NotificationCenter() {
  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  // Użyj wspólnego kontekstu zamiast osobnego hooka
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll
  } = useNotificationContext();

  // Filtruj tylko nieprzeczytane powiadomienia. Wiadomości z jednej rozmowy łączymy w JEDNĄ
  // pozycję (ostatnia wiadomość + liczba) — wcześniej kilkanaście osobnych wpisów od jednej osoby.
  const unreadNotifications = useMemo(() => {
    const out = [];
    const byKey = new Map();
    for (const n of notifications) {
      if (n.read) continue;
      const key = chatKey(n);
      const g = key ? byKey.get(key) : null;
      if (g) { g.ids.push(n.id); g.count += 1; continue; }
      const item = { ...n, ids: [n.id], count: 1 };
      out.push(item);
      if (key) byKey.set(key, item);
    }
    return out;
  }, [notifications]);

  // Zamknij dropdown przy kliknięciu poza nim
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatTime = (dateString) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true, locale: pl });
    } catch {
      return '';
    }
  };

  // Klik = przeczytane (cała zgrupowana pozycja), potem przejście do celu.
  const handleNotificationClick = (notification) => {
    setIsOpen(false);
    (notification.ids || [notification.id]).forEach((nid) => { markAsRead(nid); });
    const path = internalPath(notification.link);
    if (path) navigate(path);
    else if (notification.link) window.open(notification.link, '_blank', 'noopener');
  };

  return (
    <div ref={dropdownRef} className="relative">
      {/* Przycisk powiadomień */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-11 h-11 sm:w-9 sm:h-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors relative"
        title={t('Powiadomienia')}
        aria-label={unreadCount > 0 ? t('Powiadomienia, nowe: {n}', { n: unreadCount }) : t('Powiadomienia')}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <Bell size={20} aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white dark:border-gray-800">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="fixed inset-x-2 top-14 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden z-[1000]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <h3 className="font-bold text-gray-900 dark:text-white">{t('Powiadomienia')}</h3>
            <div className="flex items-center gap-2">
              {unreadNotifications.length > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition text-gray-500 dark:text-gray-400"
                  title={t('Oznacz wszystkie jako przeczytane')}
                >
                  <CheckCheck size={18} />
                </button>
              )}
            </div>
          </div>

          {/* Lista powiadomień - tylko nieprzeczytane */}
          <div className="max-h-[60vh] sm:max-h-[400px] overflow-y-auto custom-scrollbar">
            {unreadNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4">
                <Bell size={48} className="text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-gray-500 dark:text-gray-400 text-sm text-center">
                  {t('Brak nowych powiadomień')}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {unreadNotifications.map(notification => {
                  const kind = notificationKind(notification);
                  const IconComponent = kind.icon;

                  return (
                    <div
                      key={notification.ids.join(',')}
                      className="flex items-start gap-1 pr-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition bg-accent-primary-lightest/50 dark:bg-accent-primary-darkest/10"
                    >
                      <button
                        type="button"
                        onClick={() => handleNotificationClick(notification)}
                        className="flex-1 min-w-0 flex items-start gap-3 pl-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-300 dark:focus-visible:ring-gray-600"
                      >
                        {/* Ikona */}
                        <div className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex-shrink-0">
                          <IconComponent size={18} aria-hidden="true" />
                        </div>

                        {/* Treść */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {notification.title}
                              {notification.count > 1 && (
                                <span className="font-normal text-gray-500 dark:text-gray-400"> · {t('{n} wiadomości', { n: notification.count })}</span>
                              )}
                            </p>
                            <span className="w-2 h-2 bg-accent-primary-light rounded-full flex-shrink-0 mt-1.5" aria-hidden="true" />
                          </div>
                          {(notification.body || notification.type === 'message') && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                              {notification.body || t('Załącznik')}
                            </p>
                          )}
                          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                            {kind.label && <span className="font-medium text-gray-500 dark:text-gray-400">{t(kind.label)} · </span>}
                            {formatTime(notification.created_at)}
                          </p>
                        </div>
                      </button>

                      {/* Akcja usunięcia */}
                      <button
                        type="button"
                        onClick={() => notification.ids.forEach((id) => deleteNotification(id))}
                        className="mt-3 p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex-shrink-0"
                        title={t('Usuń')}
                        aria-label={t('Usuń')}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {unreadNotifications.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                {t('{n} nieprzeczytanych', { n: unreadCount })}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
