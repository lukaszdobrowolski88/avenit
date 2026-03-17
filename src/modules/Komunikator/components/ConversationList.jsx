import React, { useState, useMemo } from 'react';
import { Search, Plus, MessageSquare, Users, Music, Heart, Baby, Zap, UserCheck, Home, Shield, Sparkles, Star, Archive, Filter } from 'lucide-react';
import UserAvatar from './UserAvatar';
import { formatMessageDate, truncateText, getMinistryName } from '../utils/messageHelpers';
import { usePresence } from '../../../hooks/usePresence';

const ministryIcons = {
  worship_team: Music,
  media_team: Zap,
  atmosfera_team: Sparkles,
  kids_ministry: Baby,
  home_groups: Home,
  youth_ministry: Users,
  prayer_team: Heart,
  welcome_team: UserCheck,
  small_groups: Home,
  admin_team: Shield,
};

export default function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onNewConversation,
  onToggleStar,
  onToggleArchive,
  loading,
  currentUserEmail
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'starred' | 'archived'

  // Zbierz emaile wszystkich uczestników konwersacji direct
  const participantEmails = useMemo(() => {
    const emails = new Set();
    conversations
      .filter(c => c.type === 'direct')
      .forEach(c => {
        c.participants?.forEach(p => {
          if (p.user_email !== currentUserEmail) {
            emails.add(p.user_email);
          }
        });
      });
    return Array.from(emails);
  }, [conversations, currentUserEmail]);

  // Pobierz statusy presence
  const { getStatus } = usePresence(participantEmails);

  // Filtruj konwersacje po wyszukiwaniu i filtrze
  const filteredConversations = useMemo(() => {
    return conversations.filter(conv => {
      // Filtr archiwizacji/gwiazdek
      if (activeFilter === 'starred' && !conv.starred) return false;
      if (activeFilter === 'archived' && !conv.archived) return false;
      if (activeFilter === 'all' && conv.archived) return false; // Ukryj zarchiwizowane w widoku "wszystkie"

      // Filtr wyszukiwania
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        conv.displayName?.toLowerCase().includes(query) ||
        conv.name?.toLowerCase().includes(query) ||
        conv.lastMessage?.content?.toLowerCase().includes(query)
      );
    });
  }, [conversations, activeFilter, searchQuery]);

  // Grupuj konwersacje po typie
  const directConversations = filteredConversations.filter(c => c.type === 'direct');
  const groupConversations = filteredConversations.filter(c => c.type === 'group');
  const ministryConversations = filteredConversations.filter(c => c.type === 'ministry');

  const handleStarClick = (e, convId) => {
    e.stopPropagation();
    onToggleStar?.(convId);
  };

  const handleArchiveClick = (e, convId) => {
    e.stopPropagation();
    onToggleArchive?.(convId);
  };

  const renderConversationItem = (conv) => {
    const isSelected = conv.id === selectedId;
    const hasUnread = conv.unreadCount > 0;

    const getIcon = () => {
      if (conv.type === 'direct') {
        const otherParticipant = conv.participants?.find(p => p.user_email !== currentUserEmail);
        const otherEmail = otherParticipant?.user_email;
        const status = otherEmail ? getStatus(otherEmail) : 'offline';
        return (
          <UserAvatar
            user={otherParticipant || { full_name: conv.displayName }}
            size="md"
            showStatus={true}
            status={status}
          />
        );
      }

      if (conv.type === 'ministry') {
        const IconComponent = ministryIcons[conv.ministry_key] || Users;
        return (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white">
            <IconComponent size={20} />
          </div>
        );
      }

      // Group
      return (
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white">
          <Users size={20} />
        </div>
      );
    };

    const displayName = conv.type === 'ministry'
      ? getMinistryName(conv.ministry_key) || conv.name
      : conv.displayName || conv.name;

    return (
      <div
        key={conv.id}
        onClick={() => onSelect(conv)}
        className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 text-left cursor-pointer group relative
          ${isSelected
            ? 'bg-gradient-to-r from-pink-50 to-orange-50 dark:from-pink-900/30 dark:to-orange-900/20 shadow-sm border border-pink-200/50 dark:border-pink-800/30'
            : 'hover:bg-white/80 dark:hover:bg-gray-800/60 hover:shadow-sm border border-transparent'
          }
        `}
      >
        {/* Wskaźnik zaznaczenia */}
        {isSelected && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-gradient-to-b from-pink-500 to-orange-500 rounded-r-full" />
        )}

        <div className="relative flex-shrink-0">
          {getIcon()}
          {hasUnread && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-gradient-to-r from-pink-500 to-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-md shadow-pink-500/30 animate-pulse">
              {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`font-medium truncate transition-colors ${hasUnread ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                {displayName}
              </span>
              {conv.starred && (
                <Star size={12} className="text-yellow-500 fill-yellow-500 flex-shrink-0 drop-shadow-sm" />
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {conv.lastMessage && (
                <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">
                  {formatMessageDate(conv.lastMessage.created_at)}
                </span>
              )}
            </div>
          </div>

          {conv.lastMessage ? (
            <p className={`text-xs truncate mt-0.5 ${hasUnread ? 'text-gray-600 dark:text-gray-300 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
              {conv.lastMessage.sender_email === currentUserEmail ? 'Ty: ' : ''}
              {truncateText(conv.lastMessage.content, 40)}
            </p>
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 italic">
              Brak wiadomości
            </p>
          )}
        </div>

        {/* Akcje - widoczne przy hover */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all duration-200 flex-shrink-0">
          <button
            onClick={(e) => handleStarClick(e, conv.id)}
            className={`p-1.5 rounded-lg hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-all duration-200 ${
              conv.starred ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-500'
            }`}
            title={conv.starred ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
          >
            <Star size={14} className={conv.starred ? 'fill-current' : ''} />
          </button>
          <button
            onClick={(e) => handleArchiveClick(e, conv.id)}
            className={`p-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-all duration-200 ${
              conv.archived ? 'text-blue-500' : 'text-gray-400 hover:text-blue-500'
            }`}
            title={conv.archived ? 'Przywróć z archiwum' : 'Archiwizuj'}
          >
            <Archive size={14} />
          </button>
        </div>
      </div>
    );
  };

  const renderSection = (title, items) => {
    if (items.length === 0) return null;

    return (
      <div className="mb-4">
        <h3 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-3 mb-1">
          {title}
        </h3>
        <div className="space-y-0.5">
          {items.map(renderConversationItem)}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-white/80 dark:bg-gray-900/90 backdrop-blur-sm border-r border-gray-200/50 dark:border-gray-700/50">
      {/* Header */}
      <div className="p-4 border-b border-gray-200/50 dark:border-gray-700/50 bg-gradient-to-r from-pink-50/50 to-orange-50/50 dark:from-gray-800/50 dark:to-gray-800/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-pink-500 to-orange-500 flex items-center justify-center shadow-lg shadow-pink-500/20">
              <MessageSquare size={16} className="text-white" />
            </div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-pink-600 to-orange-500 bg-clip-text text-transparent">
              Komunikator
            </h1>
          </div>
          <button
            onClick={onNewConversation}
            className="p-2.5 bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 text-white rounded-xl transition-all duration-200 shadow-lg shadow-pink-500/30 hover:shadow-pink-500/40 hover:scale-105"
            title="Nowa rozmowa"
          >
            <Plus size={18} />
          </button>
        </div>

        {/* Wyszukiwarka */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Szukaj rozmów..."
            className="w-full pl-10 pr-4 py-2.5 bg-white/70 dark:bg-gray-800/70 border border-gray-200/50 dark:border-gray-700/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 backdrop-blur-sm transition-all duration-200"
          />
        </div>

        {/* Filtry */}
        <div className="flex gap-1.5 mt-3">
          <button
            onClick={() => setActiveFilter('all')}
            className={`flex-1 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200 ${
              activeFilter === 'all'
                ? 'bg-gradient-to-r from-pink-500 to-orange-500 text-white shadow-md shadow-pink-500/30'
                : 'bg-white/70 dark:bg-gray-800/70 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 border border-gray-200/50 dark:border-gray-700/50'
            }`}
          >
            Wszystkie
          </button>
          <button
            onClick={() => setActiveFilter('starred')}
            className={`flex-1 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200 flex items-center justify-center gap-1.5 ${
              activeFilter === 'starred'
                ? 'bg-gradient-to-r from-yellow-400 to-orange-400 text-white shadow-md shadow-yellow-500/30'
                : 'bg-white/70 dark:bg-gray-800/70 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 border border-gray-200/50 dark:border-gray-700/50'
            }`}
          >
            <Star size={12} className={activeFilter === 'starred' ? 'fill-current' : ''} />
            Ulubione
          </button>
          <button
            onClick={() => setActiveFilter('archived')}
            className={`flex-1 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200 flex items-center justify-center gap-1.5 ${
              activeFilter === 'archived'
                ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-md shadow-blue-500/30'
                : 'bg-white/70 dark:bg-gray-800/70 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 border border-gray-200/50 dark:border-gray-700/50'
            }`}
          >
            <Archive size={12} />
            Archiwum
          </button>
        </div>
      </div>

      {/* Lista konwersacji */}
      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-10 h-10 border-3 border-pink-200 dark:border-pink-900 border-t-pink-500 rounded-full animate-spin" />
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-3">Ładowanie rozmów...</p>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-100 to-orange-100 dark:from-pink-900/30 dark:to-orange-900/30 flex items-center justify-center mb-4">
              {activeFilter === 'starred' ? (
                <Star size={28} className="text-yellow-500" />
              ) : activeFilter === 'archived' ? (
                <Archive size={28} className="text-blue-500" />
              ) : searchQuery ? (
                <Search size={28} className="text-gray-400" />
              ) : (
                <MessageSquare size={28} className="text-pink-500" />
              )}
            </div>
            <p className="text-gray-700 dark:text-gray-300 font-medium mb-1">
              {searchQuery ? 'Brak wyników' : activeFilter === 'starred' ? 'Brak ulubionych' : activeFilter === 'archived' ? 'Brak archiwum' : 'Brak rozmów'}
            </p>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
              {searchQuery
                ? `Nie znaleziono rozmów dla "${searchQuery}"`
                : activeFilter === 'starred'
                  ? 'Oznacz rozmowę gwiazdką, by ją tu zobaczyć'
                  : activeFilter === 'archived'
                    ? 'Zarchiwizowane rozmowy pojawią się tutaj'
                    : 'Rozpocznij pierwszą rozmowę'
              }
            </p>
            {!searchQuery && activeFilter === 'all' && (
              <button
                onClick={onNewConversation}
                className="px-4 py-2 bg-gradient-to-r from-pink-500 to-orange-500 text-white text-sm font-medium rounded-xl shadow-lg shadow-pink-500/30 hover:shadow-pink-500/40 hover:scale-105 transition-all duration-200"
              >
                Rozpocznij nową rozmowę
              </button>
            )}
          </div>
        ) : (
          <>
            {renderSection('Prywatne', directConversations)}
            {renderSection('Grupy', groupConversations)}
            {renderSection('Kanały służb', ministryConversations)}
          </>
        )}
      </div>
    </div>
  );
}
