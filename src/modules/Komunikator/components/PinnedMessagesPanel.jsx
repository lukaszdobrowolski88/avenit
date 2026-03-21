import React from 'react';
import { Pin, X, ChevronDown, ChevronUp } from 'lucide-react';
import UserAvatar from './UserAvatar';
import { formatMessageTime, truncateText } from '../utils/messageHelpers';

export default function PinnedMessagesPanel({
  pinnedMessages,
  isExpanded,
  onToggleExpand,
  onScrollToMessage,
  onUnpin,
  canUnpin = false
}) {
  if (pinnedMessages.length === 0) return null;

  return (
    <div className="border-b border-gray-200/50 dark:border-gray-700/50 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20">
      {/* Header - zawsze widoczny */}
      <button
        onClick={onToggleExpand}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-yellow-100/50 dark:hover:bg-yellow-900/30 transition-all duration-200"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center shadow-sm shadow-yellow-500/20">
            <Pin size={12} className="text-white fill-white" />
          </div>
          <span className="text-sm font-semibold text-yellow-700 dark:text-yellow-400">
            Przypięte wiadomości
          </span>
          <span className="px-1.5 py-0.5 bg-yellow-200/50 dark:bg-yellow-800/50 rounded-full text-xs font-bold text-yellow-700 dark:text-yellow-400">
            {pinnedMessages.length}
          </span>
        </div>
        <div className="p-1 rounded-lg hover:bg-yellow-200/50 dark:hover:bg-yellow-800/30 transition-all duration-200">
          {isExpanded ? (
            <ChevronUp size={16} className="text-yellow-600 dark:text-yellow-500" />
          ) : (
            <ChevronDown size={16} className="text-yellow-600 dark:text-yellow-500" />
          )}
        </div>
      </button>

      {/* Lista rozwinięta */}
      {isExpanded && (
        <div className="max-h-48 overflow-y-auto custom-scrollbar border-t border-yellow-200/50 dark:border-yellow-800/30">
          {pinnedMessages.map((pin) => (
            <div
              key={pin.id}
              className="flex items-start gap-3 px-4 py-2.5 hover:bg-yellow-100/50 dark:hover:bg-yellow-900/30 transition-all duration-200 group"
            >
              <UserAvatar
                user={pin.message?.sender}
                size="xs"
                className="mt-0.5 flex-shrink-0"
              />

              <div
                onClick={() => onScrollToMessage?.(pin.message_id)}
                className="flex-1 min-w-0 cursor-pointer"
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                    {pin.message?.sender?.full_name || pin.message?.sender_email}
                  </span>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">
                    {formatMessageTime(pin.message?.created_at)}
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                  {truncateText(pin.message?.content || (pin.message?.attachments?.length > 0 ? '📎 Załącznik' : ''), 60)}
                </p>
              </div>

              {canUnpin && (
                <button
                  onClick={() => onUnpin?.(pin.message_id)}
                  className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-all duration-200"
                  title="Odepnij"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
