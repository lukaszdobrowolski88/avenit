import React, { useState, useMemo } from 'react';
import { X, Search, Forward, Users, Music, MessageSquare } from 'lucide-react';
import UserAvatar from './UserAvatar';
import { getMinistryName } from '../utils/messageHelpers';

export default function ForwardMessageModal({
  isOpen,
  onClose,
  message,
  conversations,
  currentUserEmail,
  onForward
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConversations, setSelectedConversations] = useState([]);
  const [sending, setSending] = useState(false);

  // Filtruj konwersacje (bez archiwum)
  const filteredConversations = useMemo(() => {
    return conversations
      .filter(conv => !conv.archived)
      .filter(conv => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
          conv.displayName?.toLowerCase().includes(query) ||
          conv.name?.toLowerCase().includes(query)
        );
      });
  }, [conversations, searchQuery]);

  const toggleConversation = (convId) => {
    setSelectedConversations(prev =>
      prev.includes(convId)
        ? prev.filter(id => id !== convId)
        : [...prev, convId]
    );
  };

  const handleForward = async () => {
    if (selectedConversations.length === 0 || !message) return;

    setSending(true);
    try {
      await onForward(message, selectedConversations);
      handleClose();
    } catch (err) {
      console.error('Error forwarding message:', err);
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setSearchQuery('');
    setSelectedConversations([]);
    onClose();
  };

  const getConversationIcon = (conv) => {
    if (conv.type === 'direct') {
      const otherParticipant = conv.participants?.find(p => p.user_email !== currentUserEmail);
      return (
        <UserAvatar
          user={otherParticipant || { full_name: conv.displayName }}
          size="sm"
        />
      );
    }

    if (conv.type === 'ministry') {
      return (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white">
          <Music size={14} />
        </div>
      );
    }

    return (
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white">
        <Users size={14} />
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm rounded-2xl w-full max-w-md mx-4 shadow-2xl overflow-hidden border border-gray-200/50 dark:border-gray-700/50">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200/50 dark:border-gray-700/50 bg-gradient-to-r from-pink-50/50 to-orange-50/50 dark:from-gray-800/50 dark:to-gray-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-orange-500 flex items-center justify-center shadow-lg shadow-pink-500/20">
              <Forward size={18} className="text-white" />
            </div>
            <h2 className="text-lg font-bold bg-gradient-to-r from-pink-600 to-orange-500 bg-clip-text text-transparent">
              Przekaż wiadomość
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all duration-200"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Podgląd wiadomości */}
        {message && (
          <div className="p-4 border-b border-gray-200/50 dark:border-gray-700/50 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800/50 dark:to-gray-900/50">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
              Przekazujesz:
            </p>
            <div className="flex items-start gap-3 p-3 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-100/50 dark:border-gray-700/50">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-100 to-orange-100 dark:from-pink-900/30 dark:to-orange-900/30 flex items-center justify-center flex-shrink-0">
                <MessageSquare size={14} className="text-pink-500" />
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3">
                {message.content || (message.attachments?.length > 0 ? `${message.attachments.length} załącznik(ów)` : '')}
              </p>
            </div>
          </div>
        )}

        {/* Wyszukiwarka */}
        <div className="p-4 border-b border-gray-200/50 dark:border-gray-700/50">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Szukaj konwersacji..."
              className="w-full pl-10 pr-4 py-2.5 bg-white/70 dark:bg-gray-800/70 border border-gray-200/50 dark:border-gray-700/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/50 text-gray-900 dark:text-gray-100 placeholder-gray-400 transition-all duration-200"
            />
          </div>
        </div>

        {/* Lista konwersacji */}
        <div className="max-h-64 overflow-y-auto p-2 custom-scrollbar">
          {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
                <Search size={20} className="text-gray-400" />
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-sm">Nie znaleziono konwersacji</p>
            </div>
          ) : (
            filteredConversations.map(conv => {
              const isSelected = selectedConversations.includes(conv.id);
              const displayName = conv.type === 'ministry'
                ? getMinistryName(conv.ministry_key) || conv.name
                : conv.displayName || conv.name;

              return (
                <button
                  key={conv.id}
                  onClick={() => toggleConversation(conv.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-left mb-1 ${
                    isSelected
                      ? 'bg-gradient-to-r from-pink-50 to-orange-50 dark:from-pink-900/30 dark:to-orange-900/30 ring-2 ring-pink-400/50 shadow-sm'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  }`}
                >
                  {getConversationIcon(conv)}
                  <span className="flex-1 font-medium text-gray-900 dark:text-white truncate">
                    {displayName}
                  </span>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                    isSelected
                      ? 'border-pink-500 bg-gradient-to-r from-pink-500 to-orange-500 shadow-sm shadow-pink-500/30'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}>
                    {isSelected && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200/50 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/30 flex justify-end gap-3">
          <button
            onClick={handleClose}
            className="px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all duration-200"
          >
            Anuluj
          </button>
          <button
            onClick={handleForward}
            disabled={selectedConversations.length === 0 || sending}
            className="px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all duration-200 flex items-center gap-2 shadow-lg shadow-pink-500/30 hover:shadow-pink-500/40"
          >
            {sending ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Wysyłanie...
              </>
            ) : (
              <>
                <Forward size={16} />
                Przekaż {selectedConversations.length > 0 && `(${selectedConversations.length})`}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
