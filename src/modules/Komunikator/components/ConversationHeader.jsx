import React, { useState } from 'react';
import { ArrowLeft, Users, Settings, Bell, BellOff, Trash2, Image, Search, MoreVertical, Music, Heart, Baby, Zap, UserCheck, Home, Shield, Sparkles } from 'lucide-react';
import UserAvatar from './UserAvatar';
import { getMinistryName } from '../utils/messageHelpers';

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

export default function ConversationHeader({
  conversation,
  onBack,
  onOpenSettings,
  onToggleMute,
  onDelete,
  onOpenMediaGallery,
  onOpenSearch,
  showBackButton = false
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  if (!conversation) return null;

  const getConversationIcon = () => {
    if (conversation.type === 'direct') {
      const otherParticipant = conversation.participants?.find(p => p.user_email !== conversation.created_by);
      return <UserAvatar user={otherParticipant || { full_name: conversation.displayName }} size="md" />;
    }

    if (conversation.type === 'ministry') {
      const IconComponent = ministryIcons[conversation.ministry_key] || Users;
      return (
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white shadow-lg shadow-purple-500/20">
          <IconComponent size={20} />
        </div>
      );
    }

    // Group
    return (
      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
        <Users size={20} />
      </div>
    );
  };

  const getSubtitle = () => {
    if (conversation.type === 'direct') {
      return 'Prywatna rozmowa';
    }

    if (conversation.type === 'ministry') {
      return `Kanał służby • ${conversation.participants?.length || 0} członków`;
    }

    return `${conversation.participants?.length || 0} uczestników`;
  };

  const displayName = conversation.type === 'ministry'
    ? getMinistryName(conversation.ministry_key) || conversation.name
    : conversation.displayName || conversation.name;

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200/50 dark:border-gray-700/50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
      {showBackButton && (
        <button
          onClick={onBack}
          className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all duration-200 lg:hidden"
        >
          <ArrowLeft size={20} className="text-gray-600 dark:text-gray-400" />
        </button>
      )}

      <div className="flex-shrink-0">
        {getConversationIcon()}
      </div>

      <div className="flex-1 min-w-0">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
          {displayName}
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          {getSubtitle()}
        </p>
      </div>

      {/* Akcje - duży ekran */}
      <div className="hidden sm:flex items-center gap-0.5">
        {onOpenSearch && (
          <button
            onClick={onOpenSearch}
            className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all duration-200 group"
            title="Szukaj w rozmowie"
          >
            <Search size={18} className="text-gray-500 group-hover:text-pink-500 transition-colors" />
          </button>
        )}

        {onOpenMediaGallery && (
          <button
            onClick={onOpenMediaGallery}
            className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all duration-200 group"
            title="Galeria mediów"
          >
            <Image size={18} className="text-gray-500 group-hover:text-pink-500 transition-colors" />
          </button>
        )}

        {onToggleMute && (
          <button
            onClick={onToggleMute}
            className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all duration-200 group"
            title={conversation.muted ? 'Włącz powiadomienia' : 'Wycisz powiadomienia'}
          >
            {conversation.muted ? (
              <BellOff size={18} className="text-orange-500" />
            ) : (
              <Bell size={18} className="text-gray-500 group-hover:text-pink-500 transition-colors" />
            )}
          </button>
        )}

        {conversation.type !== 'direct' && onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all duration-200 group"
            title="Ustawienia grupy"
          >
            <Settings size={18} className="text-gray-500 group-hover:text-pink-500 transition-colors" />
          </button>
        )}

        {conversation.type === 'direct' && onDelete && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-2.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-all duration-200 group"
            title="Usuń rozmowę"
          >
            <Trash2 size={18} className="text-gray-500 group-hover:text-red-500 transition-colors" />
          </button>
        )}
      </div>

      {/* Menu - mały ekran */}
      <div className="sm:hidden relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all duration-200"
        >
          <MoreVertical size={18} className="text-gray-500" />
        </button>

        {showMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
            <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-900 border border-gray-200/50 dark:border-gray-700/50 rounded-xl shadow-xl py-1 z-50">
              {onOpenSearch && (
                <button
                  onClick={() => { onOpenSearch(); setShowMenu(false); }}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <Search size={16} />
                  Szukaj
                </button>
              )}
              {onOpenMediaGallery && (
                <button
                  onClick={() => { onOpenMediaGallery(); setShowMenu(false); }}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <Image size={16} />
                  Galeria
                </button>
              )}
              {onToggleMute && (
                <button
                  onClick={() => { onToggleMute(); setShowMenu(false); }}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  {conversation.muted ? <Bell size={16} /> : <BellOff size={16} />}
                  {conversation.muted ? 'Włącz powiadomienia' : 'Wycisz'}
                </button>
              )}
              {conversation.type !== 'direct' && onOpenSettings && (
                <button
                  onClick={() => { onOpenSettings(); setShowMenu(false); }}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <Settings size={16} />
                  Ustawienia
                </button>
              )}
              {conversation.type === 'direct' && onDelete && (
                <button
                  onClick={() => { setShowDeleteConfirm(true); setShowMenu(false); }}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                >
                  <Trash2 size={16} />
                  Usuń rozmowę
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modal potwierdzenia usunięcia */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-sm mx-4 shadow-2xl border border-gray-200/50 dark:border-gray-700/50">
            <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
              <Trash2 size={24} className="text-red-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Usuń rozmowę
            </h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-6">
              Czy na pewno chcesz usunąć tę rozmowę? Wszystkie wiadomości zostaną trwale usunięte.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all duration-200 font-medium"
              >
                Anuluj
              </button>
              <button
                onClick={() => {
                  onDelete(conversation.id);
                  setShowDeleteConfirm(false);
                }}
                className="px-4 py-2.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl transition-all duration-200 font-medium shadow-lg shadow-red-500/30"
              >
                Usuń
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
