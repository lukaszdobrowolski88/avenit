import React, { useState } from 'react';
import { ArrowLeft, Users, Settings, Bell, BellOff, Trash2, Image, Search, MoreVertical, Music, Heart, Baby, Zap, UserCheck, Home, Shield, Sparkles, Megaphone } from 'lucide-react';
import UserAvatar from './UserAvatar';
import { getMinistryName } from '../utils/messageHelpers';
import { useT } from '../../../i18n';
import { tr } from '../../../i18n';
import { confirmDialog } from '../../../lib/dialog';
import { toast } from '../../../lib/toast';

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
  const t = useT();
  const [showMenu, setShowMenu] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!conversation) return null;

  const getConversationIcon = () => {
    if (conversation.type === 'direct') {
      // Druga osoba rozmowy (nazwa i awatar policzone na liście rozmów)
      return <UserAvatar user={{ full_name: conversation.displayName, avatar_url: conversation.displayAvatar }} size="md" />;
    }

    if (conversation.type === 'announcement') {
      return (
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/20">
          <Megaphone size={20} />
        </div>
      );
    }

    if (conversation.type === 'ministry') {
      const IconComponent = ministryIcons[conversation.ministry_key] || Users;
      return (
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-500 to-accent-primary-light flex items-center justify-center text-white shadow-lg shadow-purple-500/20">
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
      return t('Prywatna rozmowa');
    }

    if (conversation.type === 'ministry') {
      return tr('Kanał służby • {n} członków', { n: conversation.participants?.length || 0 });
    }

    if (conversation.type === 'announcement') {
      return tr('Kanał ogłoszeń • {n} uczestników', { n: conversation.participants?.length || 0 });
    }

    return tr('{n} uczestników', { n: conversation.participants?.length || 0 });
  };

  const displayName = conversation.type === 'ministry'
    ? getMinistryName(conversation.ministry_key) || conversation.name
    : conversation.displayName || conversation.name;

  // Usunięcie rozmowy prywatnej: potwierdzenie z nazwą i skutkiem, komunikat o wyniku.
  const handleDelete = async () => {
    setShowMenu(false);
    const ok = await confirmDialog({
      title: tr('Usunąć rozmowę z {name}?', { name: displayName }),
      message: tr('Rozmowa i wszystkie wiadomości zostaną trwale usunięte u obu osób.'),
      confirmLabel: tr('Usuń rozmowę'),
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await onDelete(conversation.id);
    } catch (err) {
      console.error('Error deleting conversation:', err);
      toast.error(err, { fallback: tr('Nie udało się usunąć rozmowy.') });
    } finally {
      setDeleting(false);
    }
  };
  const settingsLabel = conversation.type === 'group' ? t('Ustawienia grupy') : t('Ustawienia kanału');

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200/50 dark:border-gray-700/50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
      {showBackButton && (
        <button
          type="button"
          onClick={onBack}
          aria-label={t('Wróć do listy rozmów')}
          title={t('Wróć do listy rozmów')}
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
            title={t('Szukaj w rozmowie')}
            aria-label={t('Szukaj w rozmowie')}
          >
            <Search size={18} className="text-gray-500 group-hover:text-accent-primary-light transition-colors" />
          </button>
        )}

        {onOpenMediaGallery && (
          <button
            onClick={onOpenMediaGallery}
            className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all duration-200 group"
            title={t('Galeria mediów')}
            aria-label={t('Galeria mediów')}
          >
            <Image size={18} className="text-gray-500 group-hover:text-accent-primary-light transition-colors" />
          </button>
        )}

        {onToggleMute && (
          <button
            onClick={onToggleMute}
            className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all duration-200 group"
            title={conversation.muted ? t('Włącz powiadomienia') : t('Wycisz powiadomienia')}
            aria-label={conversation.muted ? t('Włącz powiadomienia') : t('Wycisz powiadomienia')}
            aria-pressed={!!conversation.muted}
          >
            {conversation.muted ? (
              <BellOff size={18} className="text-accent-secondary-light" />
            ) : (
              <Bell size={18} className="text-gray-500 group-hover:text-accent-primary-light transition-colors" />
            )}
          </button>
        )}

        {conversation.type !== 'direct' && onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all duration-200 group"
            title={settingsLabel}
            aria-label={settingsLabel}
          >
            <Settings size={18} className="text-gray-500 group-hover:text-accent-primary-light transition-colors" />
          </button>
        )}

        {conversation.type === 'direct' && onDelete && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-2.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-all duration-200 group disabled:opacity-50"
            title={t('Usuń rozmowę')}
            aria-label={t('Usuń rozmowę')}
          >
            <Trash2 size={18} className="text-gray-500 group-hover:text-red-500 transition-colors" />
          </button>
        )}
      </div>

      {/* Menu - mały ekran */}
      <div className="sm:hidden relative">
        <button
          type="button"
          onClick={() => setShowMenu(!showMenu)}
          aria-label={t('Więcej działań')}
          aria-haspopup="menu"
          aria-expanded={showMenu}
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
                  {tr('Szukaj')}
                </button>
              )}
              {onOpenMediaGallery && (
                <button
                  onClick={() => { onOpenMediaGallery(); setShowMenu(false); }}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <Image size={16} />
                  {tr('Galeria')}
                </button>
              )}
              {onToggleMute && (
                <button
                  onClick={() => { onToggleMute(); setShowMenu(false); }}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  {conversation.muted ? <Bell size={16} /> : <BellOff size={16} />}
                  {conversation.muted ? t('Włącz powiadomienia') : t('Wycisz')}
                </button>
              )}
              {conversation.type !== 'direct' && onOpenSettings && (
                <button
                  onClick={() => { onOpenSettings(); setShowMenu(false); }}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <Settings size={16} />
                  {tr('Ustawienia')}
                </button>
              )}
              {conversation.type === 'direct' && onDelete && (
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                >
                  <Trash2 size={16} />
                  {tr('Usuń rozmowę')}
                </button>
              )}
            </div>
          </>
        )}
      </div>

    </div>
  );
}
