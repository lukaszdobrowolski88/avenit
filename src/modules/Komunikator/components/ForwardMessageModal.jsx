import React, { useState, useMemo } from 'react';
import { Search, Forward, Users, Music, MessageSquare } from 'lucide-react';
import UserAvatar from './UserAvatar';
import { getMinistryName } from '../utils/messageHelpers';
import { tr } from '../../../i18n';
import { toast } from '../../../lib/toast';
import { sameEmail } from '../utils/chatLogic';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import EmptyState from '../../../components/EmptyState';

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
      // Komunikat pokazał już wątek (err.handled); okno zostaje otwarte, żeby spróbować ponownie.
      if (!err?.handled) toast.error(err, { fallback: tr('Nie udało się przekazać wiadomości.') });
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
      const otherParticipant = conv.participants?.find(p => !sameEmail(p.user_email, currentUserEmail));
      return (
        <UserAvatar
          user={otherParticipant || { full_name: conv.displayName }}
          size="sm"
        />
      );
    }

    if (conv.type === 'ministry') {
      return (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-accent-primary-light flex items-center justify-center text-white">
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
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      closeOnBackdrop={false}
      title={tr('Przekaż wiadomość')}
      icon={Forward}
      size="sm"
      footer={<>
        <Button variant="secondary" onClick={handleClose}>{tr('Anuluj')}</Button>
        <Button
          icon={Forward}
          onClick={handleForward}
          disabled={selectedConversations.length === 0}
          loading={sending}
        >
          {tr('Przekaż')} {selectedConversations.length > 0 && `(${selectedConversations.length})`}
        </Button>
      </>}
    >
      {/* Podgląd wiadomości */}
      {message && (
        <div className="px-6 py-4 border-b border-gray-200/50 dark:border-gray-700/50 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800/50 dark:to-gray-900/50">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            {tr('Przekazujesz:')}
          </p>
          <div className="flex items-start gap-3 p-3 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-100/50 dark:border-gray-700/50">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-primary-lighter to-accent-secondary-lighter dark:from-accent-primary-darkest/30 dark:to-accent-secondary-darkest/30 flex items-center justify-center flex-shrink-0">
              <MessageSquare size={14} className="text-accent-primary-light" />
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3">
              {message.content || (message.attachments?.length > 0 ? tr('{n} załącznik(ów)', { n: message.attachments.length }) : '')}
            </p>
          </div>
        </div>
      )}

      {/* Wyszukiwarka */}
      <div className="px-6 py-4 border-b border-gray-200/50 dark:border-gray-700/50">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={tr('Szukaj konwersacji...')}
            aria-label={tr('Szukaj rozmowy')}
            className="w-full pl-10 pr-4 py-2.5 bg-white/70 dark:bg-gray-800/70 border border-gray-200/50 dark:border-gray-700/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary-light/50 text-gray-900 dark:text-gray-100 placeholder-gray-400 transition-all duration-200"
          />
        </div>
      </div>

      {/* Lista konwersacji */}
      <div className="max-h-64 overflow-y-auto px-4 py-2 custom-scrollbar">
        {filteredConversations.length === 0 ? (
          <EmptyState compact icon={Search} title={tr('Nie znaleziono konwersacji')} />
        ) : (
          filteredConversations.map(conv => {
            const isSelected = selectedConversations.includes(conv.id);
            const displayName = conv.type === 'ministry'
              ? getMinistryName(conv.ministry_key) || conv.name
              : conv.displayName || conv.name;

            return (
              <button
                key={conv.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => toggleConversation(conv.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-left mb-1 ${
                  isSelected
                    ? 'bg-gradient-to-r from-accent-primary-lightest to-accent-secondary-lightest dark:from-accent-primary-darkest/30 dark:to-accent-secondary-darkest/30 ring-2 ring-accent-primary-light/50 shadow-sm'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }`}
              >
                {getConversationIcon(conv)}
                <span className="flex-1 font-medium text-gray-900 dark:text-white truncate">
                  {displayName}
                </span>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                  isSelected
                    ? 'border-accent-primary-light bg-gradient-to-r from-accent-primary-light to-accent-secondary-light shadow-sm shadow-accent-primary-light/30'
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
    </Modal>
  );
}
