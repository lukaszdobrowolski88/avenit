import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Search, MessageSquare } from 'lucide-react';
import UserAvatar from './UserAvatar';
import { formatMessageDate, truncateText } from '../utils/messageHelpers';

export default function SearchModal({
  isOpen,
  onClose,
  onSearch,
  results,
  loading,
  onScrollToMessage
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (searchQuery.length >= 2) {
      searchTimeoutRef.current = setTimeout(() => {
        onSearch(searchQuery);
      }, 300);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, onSearch]);

  // Focus input on open
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
    }
  }, [isOpen]);

  const handleResultClick = (messageId) => {
    onScrollToMessage(messageId);
    onClose();
  };

  // Highlight matching text
  const highlightText = (text, query) => {
    if (!query || query.length < 2) return text;
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, idx) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={idx} className="bg-yellow-300 dark:bg-yellow-600 px-0.5 rounded">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-20 bg-black/50 backdrop-blur-sm">
      <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm rounded-2xl w-full max-w-lg mx-4 shadow-2xl overflow-hidden border border-gray-200/50 dark:border-gray-700/50">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-gray-200/50 dark:border-gray-700/50 bg-gradient-to-r from-pink-50/50 to-orange-50/50 dark:from-gray-800/50 dark:to-gray-800/50">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-orange-500 flex items-center justify-center shadow-lg shadow-pink-500/20 flex-shrink-0">
            <Search size={18} className="text-white" />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Szukaj wiadomości..."
            className="flex-1 bg-transparent border-0 focus:outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 text-lg"
          />
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all duration-200"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-100 to-orange-100 dark:from-pink-900/30 dark:to-orange-900/30 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-pink-600 border-t-transparent rounded-full animate-spin" />
              </div>
              <p className="text-sm text-gray-500">Wyszukiwanie...</p>
            </div>
          ) : searchQuery.length < 2 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-100 to-orange-100 dark:from-pink-900/30 dark:to-orange-900/30 flex items-center justify-center mb-4">
                <Search size={28} className="text-pink-500" />
              </div>
              <p className="text-gray-700 dark:text-gray-300 font-medium mb-1">Wyszukaj wiadomości</p>
              <p className="text-gray-500 dark:text-gray-400 text-sm">Wpisz co najmniej 2 znaki, aby rozpocząć wyszukiwanie</p>
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center mb-4">
                <MessageSquare size={28} className="text-gray-400" />
              </div>
              <p className="text-gray-700 dark:text-gray-300 font-medium mb-1">Brak wyników</p>
              <p className="text-gray-500 dark:text-gray-400 text-sm">Nie znaleziono wiadomości dla "{searchQuery}"</p>
            </div>
          ) : (
            <div className="p-2">
              <div className="px-3 py-2 mb-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Znaleziono {results.length} wiadomości
                </span>
              </div>
              {results.map((msg) => (
                <button
                  key={msg.id}
                  onClick={() => handleResultClick(msg.id)}
                  className="w-full flex items-start gap-3 p-3 hover:bg-gradient-to-r hover:from-pink-50 hover:to-orange-50 dark:hover:from-pink-900/20 dark:hover:to-orange-900/20 rounded-xl transition-all duration-200 text-left mb-1"
                >
                  <UserAvatar user={msg.sender} size="sm" className="flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {msg.sender?.full_name || msg.sender_email}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 font-medium">
                        {formatMessageDate(msg.created_at)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                      {highlightText(msg.content, searchQuery)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
