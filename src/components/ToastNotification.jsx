import React, { useState, useEffect, useCallback } from 'react';
import { X, MessageSquare, AtSign, CheckSquare, Calendar, Bell } from 'lucide-react';

// Ikony dla typów powiadomień
const typeIcons = {
  message: MessageSquare,
  mention: AtSign,
  task: CheckSquare,
  event: Calendar,
  system: Bell
};

// Kolory dla typów
const typeColors = {
  message: 'from-blue-500 to-cyan-500',
  mention: 'from-purple-500 to-pink-500',
  task: 'from-green-500 to-emerald-500',
  event: 'from-orange-500 to-amber-500',
  system: 'from-gray-500 to-gray-600'
};

// Pojedynczy toast
function Toast({ notification, onClose, onClick }) {
  const [isExiting, setIsExiting] = useState(false);

  const IconComponent = typeIcons[notification.type] || Bell;
  const gradientColor = typeColors[notification.type] || typeColors.system;

  const handleClose = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => onClose(notification.id), 300);
  }, [notification.id, onClose]);

  // Auto-close po 5 sekundach
  useEffect(() => {
    const timer = setTimeout(handleClose, 5000);
    return () => clearTimeout(timer);
  }, [handleClose]);

  const handleClick = () => {
    onClick?.(notification);
    handleClose();
  };

  return (
    <div
      className={`
        max-w-sm w-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden
        transform transition-all duration-300 ease-out cursor-pointer
        ${isExiting ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100'}
        hover:scale-[1.02] hover:shadow-3xl
      `}
      onClick={handleClick}
    >
      <div className="flex items-start gap-3 p-4">
        {/* Ikona */}
        <div className={`p-2.5 rounded-xl bg-gradient-to-br ${gradientColor} text-white flex-shrink-0 shadow-lg`}>
          <IconComponent size={20} />
        </div>

        {/* Treść */}
        <div className="flex-1 min-w-0 pt-0.5">
          <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">
            {notification.title}
          </p>
          {notification.body && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
              {notification.body}
            </p>
          )}
        </div>

        {/* Przycisk zamknięcia */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleClose();
          }}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition flex-shrink-0"
        >
          <X size={16} className="text-gray-400" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-100 dark:bg-gray-700">
        <div
          className={`h-full bg-gradient-to-r ${gradientColor} animate-shrink`}
          style={{ animationDuration: '5s' }}
        />
      </div>
    </div>
  );
}

// Kontener na toasty
export default function ToastContainer({ toasts, onClose, onClick }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 z-[9999] flex flex-col gap-3">
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          notification={toast}
          onClose={onClose}
          onClick={onClick}
        />
      ))}
    </div>
  );
}

// Style CSS dla animacji (dodaj do index.css lub tailwind)
// .animate-shrink { animation: shrink linear forwards; }
// @keyframes shrink { from { width: 100%; } to { width: 0%; } }
