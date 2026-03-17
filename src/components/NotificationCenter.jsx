import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, X, MessageSquare, AtSign, CheckSquare, Calendar, Trash2, CheckCheck } from 'lucide-react';
import { useNotificationContext } from '../contexts/NotificationContext';
import { notificationColors } from '../hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import { pl } from 'date-fns/locale';

// Ikony dla typów powiadomień
const typeIcons = {
  message: MessageSquare,
  mention: AtSign,
  task: CheckSquare,
  event: Calendar,
  system: Bell
};

export default function NotificationCenter() {
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

  // Filtruj tylko nieprzeczytane powiadomienia
  const unreadNotifications = notifications.filter(n => !n.read);

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

  const handleNotificationClick = (notification) => {
    // NIE oznaczaj jako przeczytane - to zrobi się automatycznie po wejściu w konwersację
    if (notification.link) {
      // Użyj react-router navigate zamiast window.location
      navigate(notification.link);
    }
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} className="relative">
      {/* Przycisk powiadomień */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors relative"
        title="Powiadomienia"
      >
        <Bell size={20} />
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
            <h3 className="font-bold text-gray-900 dark:text-white">Powiadomienia</h3>
            <div className="flex items-center gap-2">
              {unreadNotifications.length > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition text-gray-500 dark:text-gray-400"
                  title="Oznacz wszystkie jako przeczytane"
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
                  Brak nowych powiadomień
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {unreadNotifications.map(notification => {
                  const IconComponent = typeIcons[notification.type] || Bell;
                  const colorClass = notificationColors[notification.type] || notificationColors.system;

                  return (
                    <div
                      key={notification.id}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition cursor-pointer bg-pink-50/50 dark:bg-pink-900/10"
                      onClick={() => handleNotificationClick(notification)}
                    >
                      {/* Ikona */}
                      <div className={`p-2 rounded-xl ${colorClass} flex-shrink-0`}>
                        <IconComponent size={18} />
                      </div>

                      {/* Treść */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {notification.title}
                          </p>
                          <span className="w-2 h-2 bg-pink-500 rounded-full flex-shrink-0 mt-1.5" />
                        </div>
                        {notification.body && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                            {notification.body}
                          </p>
                        )}
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                          {formatTime(notification.created_at)}
                        </p>
                      </div>

                      {/* Akcja usunięcia */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotification(notification.id);
                        }}
                        className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-full transition text-gray-400 hover:text-red-500 flex-shrink-0"
                        title="Usuń"
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
                {unreadCount} nieprzeczytanych
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
