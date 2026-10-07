import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, MessageSquare } from 'lucide-react';
import UserAvatar from './UserAvatar';
import { formatMessageDate, truncateText } from '../utils/messageHelpers';
import { tr } from '../../../i18n';
import Modal from '../../../components/Modal';
import EmptyState from '../../../components/EmptyState';
import Spinner from '../../../components/Spinner';

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

  // Skok do wiadomości — także starszej niż wczytana część rozmowy (wątek doczyta, K11).
  const handleResultClick = (msg) => {
    onClose();
    onScrollToMessage(msg.id, msg.created_at);
  };

  // Highlight matching text (zapytanie dosłownie — znaki specjalne nie psują wyszukiwania)
  const highlightText = (text, query) => {
    if (!text) return '';
    if (!query || query.length < 2) return text;
    const safe = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${safe})`, 'gi'));
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      closeOnBackdrop={false}
      title={tr('Wyszukaj wiadomości')}
      icon={Search}
      size="md"
    >
      {/* Pole wyszukiwania */}
      <div className="sticky top-0 z-10 px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={tr('Szukaj wiadomości...')}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-100 dark:bg-gray-800 border-0 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary-light text-gray-900 dark:text-gray-100 placeholder-gray-500"
          />
        </div>
      </div>

      {/* Results */}
      <div>
        {loading ? (
          <Spinner center label={tr('Wyszukiwanie...')} />
        ) : searchQuery.length < 2 ? (
          <EmptyState
            compact
            icon={Search}
            title={tr('Wyszukaj wiadomości')}
            subtitle={tr('Wpisz co najmniej 2 znaki, aby rozpocząć wyszukiwanie')}
          />
        ) : results.length === 0 ? (
          <EmptyState
            compact
            icon={MessageSquare}
            title={tr('Brak wyników')}
            subtitle={tr('Nie znaleziono wiadomości dla "{q}"', { q: searchQuery })}
          />
        ) : (
          <div className="px-4 py-2">
            <div className="px-3 py-2 mb-2">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {tr('Znaleziono {n} wiadomości', { n: results.length })}
              </span>
            </div>
            {results.map((msg) => (
              <button
                key={msg.id}
                onClick={() => handleResultClick(msg)}
                className="w-full flex items-start gap-3 p-3 hover:bg-gradient-to-r hover:from-accent-primary-lightest hover:to-accent-secondary-lightest dark:hover:from-accent-primary-darkest/20 dark:hover:to-accent-secondary-darkest/20 rounded-xl transition-all duration-200 text-left mb-1"
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
    </Modal>
  );
}
