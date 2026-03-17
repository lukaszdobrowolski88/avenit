import React, { useState, useRef, useCallback } from 'react';
import {
  Star, Paperclip, Tag, MoreVertical, Trash2, Archive,
  FolderInput, CheckSquare, Square, RefreshCw, Search,
  ChevronDown, Mail, MailOpen
} from 'lucide-react';

export default function MessageList({
  messages,
  folders,
  labels,
  selectedMessageId,
  onSelectMessage,
  onToggleStar,
  onMarkAsRead,
  onMoveToFolder,
  onDelete,
  onToggleLabel,
  onRefresh,
  onSearch,
  loading,
  hasMore,
  onLoadMore,
  folderName
}) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [showLabelMenu, setShowLabelMenu] = useState(false);
  const listRef = useRef(null);

  // Toggle zaznaczenie wiadomości
  const toggleSelect = (e, messageId) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  // Zaznacz wszystkie
  const selectAll = () => {
    if (selectedIds.size === messages.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(messages.map(m => m.id)));
    }
  };

  // Bulk akcje
  const handleBulkAction = async (action, param) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    switch (action) {
      case 'read':
        await onMarkAsRead(ids, true);
        break;
      case 'unread':
        await onMarkAsRead(ids, false);
        break;
      case 'delete':
        await onDelete(ids);
        break;
      case 'move':
        await onMoveToFolder(ids, param);
        setShowMoveMenu(false);
        break;
      case 'label':
        for (const id of ids) {
          await onToggleLabel(id, param);
        }
        setShowLabelMenu(false);
        break;
    }

    setSelectedIds(new Set());
  };

  // Wyszukiwanie
  const handleSearch = (e) => {
    e.preventDefault();
    if (onSearch && searchQuery.trim()) {
      onSearch(searchQuery.trim());
    }
  };

  // Infinite scroll
  const handleScroll = useCallback(() => {
    if (!listRef.current || !hasMore || loading) return;

    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    if (scrollHeight - scrollTop - clientHeight < 200) {
      onLoadMore();
    }
  }, [hasMore, loading, onLoadMore]);

  // Format daty
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'wczoraj';
    } else if (diffDays < 7) {
      return date.toLocaleDateString('pl-PL', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
    }
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700">
      {/* Header z wyszukiwaniem */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-lg font-bold text-gray-800 dark:text-white">{folderName}</h2>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            ({messages.length} wiadomości)
          </span>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="ml-auto p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Wyszukiwarka */}
        <form onSubmit={handleSearch} className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Szukaj wiadomości..."
            className="w-full pl-11 pr-4 py-2.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-pink-500 focus:border-transparent outline-none placeholder:text-gray-400"
          />
        </form>
      </div>

      {/* Toolbar z bulk akcjami */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <button
          onClick={selectAll}
          className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
        >
          {selectedIds.size === messages.length && messages.length > 0 ? (
            <CheckSquare size={18} />
          ) : (
            <Square size={18} />
          )}
        </button>

        {selectedIds.size > 0 && (
          <>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {selectedIds.size} zaznaczonych
            </span>

            <div className="flex items-center gap-1 ml-2">
              <button
                onClick={() => handleBulkAction('read')}
                className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                title="Oznacz jako przeczytane"
              >
                <MailOpen size={16} />
              </button>
              <button
                onClick={() => handleBulkAction('unread')}
                className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                title="Oznacz jako nieprzeczytane"
              >
                <Mail size={16} />
              </button>

              {/* Przenieś do folderu */}
              <div className="relative">
                <button
                  onClick={() => setShowMoveMenu(!showMoveMenu)}
                  className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                  title="Przenieś"
                >
                  <FolderInput size={16} />
                </button>
                {showMoveMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowMoveMenu(false)} />
                    <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[160px]">
                      {folders.filter(f => f.type !== 'trash').map(folder => (
                        <button
                          key={folder.id}
                          onClick={() => handleBulkAction('move', folder.id)}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          <span>{folder.name}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Etykiety */}
              <div className="relative">
                <button
                  onClick={() => setShowLabelMenu(!showLabelMenu)}
                  className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                  title="Etykiety"
                >
                  <Tag size={16} />
                </button>
                {showLabelMenu && labels.length > 0 && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowLabelMenu(false)} />
                    <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[160px]">
                      {labels.map(label => (
                        <button
                          key={label.id}
                          onClick={() => handleBulkAction('label', label.id)}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: label.color }} />
                          <span>{label.name}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <button
                onClick={() => handleBulkAction('delete')}
                className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                title="Usuń"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Lista wiadomości */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        {loading && messages.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <RefreshCw size={24} className="animate-spin text-pink-500" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-500 dark:text-gray-400">
            <Mail size={32} className="mb-2 opacity-50" />
            <p className="text-sm">Brak wiadomości</p>
          </div>
        ) : (
          messages.map((message) => {
            const isSelected = selectedMessageId === message.id;
            const isChecked = selectedIds.has(message.id);

            return (
              <div
                key={message.id}
                onClick={() => onSelectMessage(message.id)}
                className={`
                  flex items-start gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800 cursor-pointer transition-colors
                  ${isSelected ? 'bg-pink-50 dark:bg-pink-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}
                  ${!message.is_read ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}
                `}
              >
                {/* Checkbox */}
                <button
                  onClick={(e) => toggleSelect(e, message.id)}
                  className="flex-shrink-0 p-0.5 mt-1"
                >
                  {isChecked ? (
                    <CheckSquare size={18} className="text-pink-500" />
                  ) : (
                    <Square size={18} className="text-gray-400" />
                  )}
                </button>

                {/* Gwiazdka */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleStar(message.id);
                  }}
                  className="flex-shrink-0 p-0.5 mt-1"
                >
                  <Star
                    size={18}
                    className={message.is_starred ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300 dark:text-gray-600'}
                  />
                </button>

                {/* Treść */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-sm truncate ${!message.is_read ? 'font-bold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                      {message.from_name || message.from_email}
                    </span>
                    {message.hasAttachments && (
                      <Paperclip size={14} className="flex-shrink-0 text-gray-400" />
                    )}
                    <span className="ml-auto text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                      {formatDate(message.received_at)}
                    </span>
                  </div>

                  <p className={`text-sm truncate ${!message.is_read ? 'font-medium text-gray-800 dark:text-gray-200' : 'text-gray-600 dark:text-gray-400'}`}>
                    {message.subject}
                  </p>

                  <p className="text-xs text-gray-500 dark:text-gray-500 truncate mt-0.5">
                    {message.snippet}
                  </p>

                  {/* Etykiety */}
                  {message.labels && message.labels.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {message.labels.map(label => (
                        <span
                          key={label.id}
                          className="px-1.5 py-0.5 text-[10px] font-medium rounded"
                          style={{
                            backgroundColor: `${label.color}20`,
                            color: label.color
                          }}
                        >
                          {label.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Loading more */}
        {loading && messages.length > 0 && (
          <div className="flex items-center justify-center py-4">
            <RefreshCw size={20} className="animate-spin text-pink-500" />
          </div>
        )}
      </div>
    </div>
  );
}
