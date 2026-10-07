import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Plus, MessageSquare, Users, Music, Heart, Baby, Zap, UserCheck, Home, Shield, Sparkles, Star, Archive, Pin, Megaphone, MoreHorizontal, BellOff } from 'lucide-react';
import UserAvatar from './UserAvatar';
import { formatMessageDate, getMinistryName } from '../utils/messageHelpers';
import { usePresence } from '../../../hooks/usePresence';
import { sameEmail, matchesFilter, groupIntoSections, lastMessagePreview } from '../utils/chatLogic';
import { useT } from '../../../i18n';
import { tr } from '../../../i18n';
import Button from '../../../components/Button';
import EmptyState from '../../../components/EmptyState';
import Spinner from '../../../components/Spinner';

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
  onTogglePin,
  canManage = true, // uprawnienie do zmiany własnego wiersza uczestnika (przypięcie/ulubione/archiwum)
  loading,
  currentUserEmail
}) {
  const t = useT();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'unread' | 'starred' | 'archived' (jak w aplikacji)
  const [menuFor, setMenuFor] = useState(null); // id rozmowy z otwartym menu „⋯”
  const menuRef = useRef(null);

  // Zamknij menu „⋯” po kliknięciu poza nim albo klawiszem Escape
  useEffect(() => {
    if (!menuFor) return;
    const onDown = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuFor(null); };
    const onKey = (e) => { if (e.key === 'Escape') setMenuFor(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuFor]);

  // Filtry „Ulubione”/„Archiwum” mają sens, gdy można oznaczać rozmowy (albo już coś oznaczono).
  const showStarredFilter = canManage || conversations.some(c => c.starred);
  const showArchivedFilter = canManage || conversations.some(c => c.archived);
  const filters = [
    { key: 'all', label: t('Wszystkie') },
    { key: 'unread', label: t('Nieprzeczytane') },
    ...(showStarredFilter ? [{ key: 'starred', label: t('Ulubione'), Icon: Star }] : []),
    ...(showArchivedFilter ? [{ key: 'archived', label: t('Archiwum'), Icon: Archive }] : []),
  ];
  const totalUnread = conversations.reduce((sum, c) => sum + (c.archived ? 0 : (c.unreadCount || 0)), 0);

  // Zbierz emaile wszystkich uczestników konwersacji direct
  const participantEmails = useMemo(() => {
    const emails = new Set();
    conversations
      .filter(c => c.type === 'direct')
      .forEach(c => {
        c.participants?.forEach(p => {
          if (!sameEmail(p.user_email, currentUserEmail)) {
            emails.add(p.user_email);
          }
        });
      });
    return Array.from(emails);
  }, [conversations, currentUserEmail]);

  // Pobierz statusy presence
  const { getStatus } = usePresence(participantEmails);

  // Filtruj konwersacje po wyszukiwaniu i filtrze (zarchiwizowane tylko w „Archiwum” — jak w aplikacji).
  // Szukanie obejmuje też zarchiwizowane, żeby dało się znaleźć każdą rozmowę.
  const filteredConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return conversations.filter(conv => {
      if (!query) return matchesFilter(conv, activeFilter, currentUserEmail);
      if (activeFilter !== 'all' && !matchesFilter(conv, activeFilter, currentUserEmail)) return false;
      const ministryName = conv.type === 'ministry' ? getMinistryName(conv.ministry_key) : '';
      return [conv.displayName, conv.name, ministryName, conv.lastMessage?.content]
        .some(v => String(v || '').toLowerCase().includes(query));
    });
  }, [conversations, activeFilter, searchQuery, currentUserEmail]);

  // Sekcje (te same i w tej samej kolejności co w aplikacji): Przypięte, Ogłoszenia, Prywatne, Grupy, Kanały służb
  const sections = useMemo(() => groupIntoSections(filteredConversations), [filteredConversations]);

  // Akcja z menu „⋯”: zamknij menu i wykonaj
  const runMenuAction = (e, fn, convId) => {
    e.stopPropagation();
    setMenuFor(null);
    fn?.(convId);
  };

  const renderConversationItem = (conv) => {
    const isSelected = conv.id === selectedId;
    const unread = conv.unreadCount || 0;
    const hasUnread = unread > 0;
    const last = conv.lastMessage;
    const senderName = last
      ? conv.participants?.find(p => sameEmail(p.user_email, last.sender_email))?.full_name || last.sender_email
      : '';
    const preview = last
      ? lastMessagePreview(last, { myEmail: currentUserEmail, convType: conv.type, senderName, t })
      : '';

    const getIcon = () => {
      if (conv.type === 'direct') {
        const otherParticipant = conv.participants?.find(p => !sameEmail(p.user_email, currentUserEmail));
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
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-accent-primary-light flex items-center justify-center text-white">
            <IconComponent size={20} />
          </div>
        );
      }

      if (conv.type === 'announcement') {
        return (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white">
            <Megaphone size={20} />
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

    const menuOpen = menuFor === conv.id;
    const menuItemClass = 'flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 focus-visible:bg-gray-50 dark:focus-visible:bg-gray-800 outline-none transition text-left';

    return (
      <div key={conv.id} className="relative group">
        {/* Wiersz rozmowy = przycisk (klawiatura: Tab + Enter) */}
        <button
          type="button"
          onClick={() => onSelect(conv)}
          aria-current={isSelected ? 'true' : undefined}
          className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/60
            ${canManage ? 'pr-12 lg:pr-3' : ''}
            ${isSelected
              ? 'bg-gradient-to-r from-accent-primary-lightest to-accent-secondary-lightest dark:from-accent-primary-darkest/30 dark:to-accent-secondary-darkest/20 shadow-sm border border-accent-primary-lighter/50 dark:border-accent-primary-dark/30'
              : 'hover:bg-white/80 dark:hover:bg-gray-800/60 hover:shadow-sm border border-transparent'
            }
          `}
        >
          <div className="relative flex-shrink-0">
            {getIcon()}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={`truncate transition-colors ${hasUnread ? 'font-semibold text-gray-900 dark:text-white' : 'font-medium text-gray-700 dark:text-gray-300'}`}>
                  {displayName}
                </span>
                {conv.pinned && (
                  <Pin size={12} className="text-accent-primary fill-accent-primary flex-shrink-0" aria-label={t('Przypięta')} />
                )}
                {conv.starred && (
                  <Star size={12} className="text-yellow-500 fill-yellow-500 flex-shrink-0" aria-label={t('Ulubiona')} />
                )}
                {conv.muted && (
                  <BellOff size={12} className="text-gray-400 flex-shrink-0" aria-label={t('Wyciszona')} />
                )}
              </div>
              {last && (
                <span className={`text-[10px] flex-shrink-0 ${hasUnread ? 'text-gray-900 dark:text-white font-bold' : 'text-gray-400 dark:text-gray-500 font-medium'}`}>
                  {formatMessageDate(last.created_at)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-0.5">
              {last ? (
                <p className={`flex-1 min-w-0 text-xs truncate ${hasUnread ? 'text-gray-800 dark:text-gray-200 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                  {preview || t('Wiadomość')}
                </p>
              ) : (
                <p className="flex-1 min-w-0 text-xs text-gray-400 dark:text-gray-500 italic truncate">
                  {tr('Brak wiadomości')}
                </p>
              )}
              {hasUnread && (
                <span
                  className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-gray-800 text-white dark:bg-gray-100 dark:text-gray-900 text-[11px] font-bold leading-5 text-center"
                  aria-label={t('Nieprzeczytane: {n}', { n: unread })}
                >
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </div>
          </div>
        </button>

        {/* Menu „⋯”: na telefonie zawsze widoczne, na komputerze po najechaniu lub fokusie (bez rezerwowania miejsca) */}
        {canManage && (
          <div ref={menuOpen ? menuRef : undefined} className="absolute right-2 top-1/2 -translate-y-1/2">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setMenuFor(menuOpen ? null : conv.id); }}
              aria-label={t('Więcej działań: {name}', { name: displayName })}
              title={t('Więcej działań')}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className={`w-8 h-8 flex items-center justify-center rounded-lg bg-white/95 dark:bg-gray-800/95 border border-gray-200/60 dark:border-gray-700/60 text-gray-500 hover:text-accent-primary shadow-sm transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/60
                ${menuOpen ? 'opacity-100' : 'opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 focus-visible:opacity-100'}`}
            >
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && (
              <div role="menu" className="absolute right-0 top-full mt-1 z-30 w-56 bg-white dark:bg-gray-900 border border-gray-200/70 dark:border-gray-700/70 rounded-xl shadow-xl py-1">
                <button type="button" role="menuitem" onClick={(e) => runMenuAction(e, onTogglePin, conv.id)} className={menuItemClass}>
                  <Pin size={15} className={conv.pinned ? 'text-accent-primary fill-current' : 'text-gray-400'} />
                  {conv.pinned ? t('Odepnij') : t('Przypnij na górze')}
                </button>
                <button type="button" role="menuitem" onClick={(e) => runMenuAction(e, onToggleStar, conv.id)} className={menuItemClass}>
                  <Star size={15} className={conv.starred ? 'text-yellow-500 fill-current' : 'text-gray-400'} />
                  {conv.starred ? t('Usuń z ulubionych') : t('Dodaj do ulubionych')}
                </button>
                <button type="button" role="menuitem" onClick={(e) => runMenuAction(e, onToggleArchive, conv.id)} className={menuItemClass}>
                  <Archive size={15} className="text-gray-400" />
                  {conv.archived ? t('Przywróć z archiwum') : t('Archiwizuj')}
                </button>
              </div>
            )}
          </div>
        )}
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
      <div className="p-4 border-b border-gray-200/50 dark:border-gray-700/50 bg-gradient-to-r from-accent-primary-lightest/50 to-accent-secondary-lightest/50 dark:from-gray-800/50 dark:to-gray-800/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-accent-primary-light to-accent-secondary-light flex items-center justify-center shadow-lg shadow-accent-primary-light/20">
              <MessageSquare size={16} className="text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
                {tr('Komunikator')}
              </h1>
              {totalUnread > 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('Nieprzeczytane: {n}', { n: totalUnread })}</p>
              )}
            </div>
          </div>
          <button
            data-tour="komunikator-new"
            onClick={onNewConversation}
            aria-label={t('Nowa rozmowa')}
            className="p-2.5 bg-gradient-to-r from-accent-primary-light to-accent-secondary-light hover:from-accent-primary hover:to-accent-secondary text-white rounded-xl transition-all duration-200 shadow-lg shadow-accent-primary-light/30 hover:shadow-accent-primary-light/40 hover:scale-105"
            title={t('Nowa rozmowa')}
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
            placeholder={t('Szukaj rozmów...')}
            aria-label={t('Szukaj rozmów')}
            className="w-full pl-10 pr-4 py-2.5 bg-white/70 dark:bg-gray-800/70 border border-gray-200/50 dark:border-gray-700/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary-light/50 focus:border-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 backdrop-blur-sm transition-all duration-200"
          />
        </div>

        {/* Filtry — te same co w aplikacji: Wszystkie, Nieprzeczytane, Ulubione, Archiwum */}
        <div className="flex gap-1.5 mt-3 overflow-x-auto -mx-1 px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label={t('Filtr rozmów')}>
          {filters.map(({ key, label, Icon }) => {
            const active = activeFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveFilter(key)}
                aria-pressed={active}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 flex items-center gap-1.5 ${
                  active
                    ? 'bg-gradient-to-r from-accent-primary-light to-accent-secondary-light text-white shadow-md shadow-accent-primary-light/30'
                    : 'bg-white/70 dark:bg-gray-800/70 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 border border-gray-200/50 dark:border-gray-700/50'
                }`}
              >
                {Icon && <Icon size={12} className={active && key === 'starred' ? 'fill-current' : ''} />}
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Lista konwersacji */}
      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
        {loading ? (
          <Spinner center label={t('Ładowanie rozmów...')} />
        ) : filteredConversations.length === 0 ? (
          <EmptyState
            compact
            icon={activeFilter === 'starred' ? Star : activeFilter === 'archived' ? Archive : searchQuery ? Search : MessageSquare}
            title={searchQuery
              ? t('Brak wyników')
              : activeFilter === 'unread'
                ? t('Wszystko przeczytane')
                : activeFilter === 'starred' ? t('Brak ulubionych') : activeFilter === 'archived' ? t('Brak archiwum') : t('Brak rozmów')}
            subtitle={searchQuery
              ? t('Nie znaleziono rozmów dla „{q}”', { q: searchQuery.trim() })
              : activeFilter === 'unread'
                ? t('Nie masz nieprzeczytanych wiadomości')
                : activeFilter === 'starred'
                  ? t('Oznacz rozmowę gwiazdką, by ją tu zobaczyć')
                  : activeFilter === 'archived'
                    ? t('Zarchiwizowane rozmowy pojawią się tutaj')
                    : t('Rozpocznij pierwszą rozmowę')
            }
            action={!searchQuery && activeFilter === 'all' ? (
              <Button size="sm" icon={Plus} onClick={onNewConversation}>
                {t('Rozpocznij nową rozmowę')}
              </Button>
            ) : !searchQuery && activeFilter !== 'all' ? (
              <Button size="sm" variant="secondary" onClick={() => setActiveFilter('all')}>
                {t('Pokaż wszystkie')}
              </Button>
            ) : null}
          />
        ) : (
          sections.map(s => <React.Fragment key={s.key}>{renderSection(t(s.title), s.items)}</React.Fragment>)
        )}
      </div>
    </div>
  );
}
