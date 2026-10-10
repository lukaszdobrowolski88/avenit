import React, { useState } from 'react';
import { ArrowLeft, Users, Settings, Bell, BellOff, Trash2, Image, Search, MoreVertical, Music, Heart, Baby, Zap, UserCheck, Home, Shield, Sparkles, Megaphone, Ban, Link2, CalendarClock } from 'lucide-react';
import UserAvatar from './UserAvatar';
import CallButtons from '../calls/CallButtons';
import { useCalls } from '../calls/callContext';
import { canInviteGuests } from '../calls/guestLogic';
import MuteMenu, { muteUntilLabel } from './MuteMenu';
import { getMinistryName } from '../utils/messageHelpers';
import { channelName, isHomeGroupChannel, muteState } from '../utils/chatLogic';
import { useT } from '../../../i18n';
import { tr } from '../../../i18n';
import { confirmDialog } from '../../../lib/dialog';
import { toast } from '../../../lib/toast';
import { statusColors, statusLabels } from '../../../hooks/usePresence';

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

// Ikona kanału na neutralnym papierze ze słodem (bez „tęczy” kolorów — marka Avenit).
export function ChannelIcon({ conversation, size = 'md' }) {
  const box = size === 'lg' ? 'w-14 h-14 rounded-full' : size === 'md' ? 'w-11 h-11 rounded-xl' : 'w-10 h-10 rounded-full';
  const icon = size === 'lg' ? 28 : 20;
  let Icon = Users;
  if (conversation?.type === 'announcement') Icon = Megaphone;
  else if (conversation?.type === 'meeting') Icon = CalendarClock;
  else if (isHomeGroupChannel(conversation)) Icon = Home;
  else if (conversation?.type === 'ministry') Icon = ministryIcons[conversation.ministry_key] || Users;
  return (
    <div className={`${box} bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-200 flex-shrink-0`}>
      <Icon size={icon} aria-hidden="true" />
    </div>
  );
}

export default function ConversationHeader({
  conversation,
  onBack,
  onOpenSettings,
  onSetMute,
  onDelete,
  onOpenMediaGallery,
  onOpenSearch,
  showBackButton = false,
  peerStatus = null, // obecność drugiej osoby (rozmowa 1:1)
  peerBlocked = false,
  onToggleBlock,
  isAppAdmin = false,
}) {
  const t = useT();
  const calls = useCalls();
  const [showMenu, setShowMenu] = useState(false);
  const [muteOpen, setMuteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!conversation) return null;

  const mute = muteState(conversation);
  const isDirect = conversation.type === 'direct';
  const isHomeGroup = isHomeGroupChannel(conversation);

  const getConversationIcon = () => {
    if (isDirect) {
      // Druga osoba rozmowy (nazwa i awatar policzone na liście rozmów)
      return <UserAvatar user={{ full_name: conversation.displayName, avatar_url: conversation.displayAvatar }} size="md" showStatus={!!peerStatus} status={peerStatus} />;
    }
    return <ChannelIcon conversation={conversation} size="md" />;
  };

  const getSubtitle = () => {
    // Jak w aplikacji: status obecności, a gdy osoba jest poza aplikacją — „Prywatna rozmowa”.
    if (isDirect) {
      if (peerBlocked) return t('Zablokowana osoba');
      return peerStatus && peerStatus !== 'offline' ? t(statusLabels[peerStatus]) : t('Prywatna rozmowa');
    }
    const n = conversation.participants?.length || 0;
    if (isHomeGroup) return tr('Kanał grupy domowej • {n} członków', { n });
    if (conversation.type === 'ministry') return tr('Kanał służby • {n} członków', { n });
    if (conversation.type === 'announcement') return tr('Kanał ogłoszeń • {n} uczestników', { n });
    if (conversation.type === 'meeting') return tr('Spotkanie online • {n} uczestników', { n });
    return tr('{n} uczestników', { n });
  };

  const displayName = conversation.type === 'ministry'
    ? channelName(conversation, getMinistryName)
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
  const muteTitle = mute.muted
    ? (mute.until ? t('Wyciszona {until}', { until: muteUntilLabel(mute.until) }) : t('Wyciszona na stałe'))
    : t('Wycisz powiadomienia');
  const blockLabel = peerBlocked ? t('Odblokuj osobę') : t('Zablokuj osobę');
  const iconBtn = 'p-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all duration-200 group';
  // „Zaproś gościa (link)” — gdy połączenia są włączone; serwer i tak sprawdza prawo i ochronę dzieci.
  const canInvite = !!calls?.openGuestInvite && calls.callsEnabled !== false && !peerBlocked
    && canInviteGuests(conversation, { isAppAdmin });
  const inviteLabel = t('Zaproś gościa (link)');
  const openInvite = () => calls.openGuestInvite({ ...conversation, displayName });
  const menuItem = 'flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800';

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
          {isDirect && !peerBlocked && peerStatus && peerStatus !== 'offline' && (
            <span className={`w-1.5 h-1.5 rounded-full ${statusColors[peerStatus]}`} aria-hidden="true" />
          )}
          {getSubtitle()}
          {mute.muted && (
            <span className="inline-flex items-center gap-0.5 ml-1 text-gray-400">
              · <BellOff size={11} aria-hidden="true" /> {mute.until ? muteUntilLabel(mute.until) : t('wyciszona')}
            </span>
          )}
        </p>
      </div>

      <div className="relative flex items-center">
        {/* Połączenia audio/wideo — widoczne na każdym ekranie (ukryte, gdy wyłączone na serwerze) */}
        <CallButtons conversation={conversation} peerBlocked={peerBlocked} />

        {/* Akcje - duży ekran */}
        <div className="hidden sm:flex items-center gap-0.5">
          {onOpenSearch && (
            <button type="button" onClick={onOpenSearch} className={iconBtn} title={t('Szukaj w rozmowie')} aria-label={t('Szukaj w rozmowie')}>
              <Search size={18} className="text-gray-500 group-hover:text-accent-primary transition-colors" />
            </button>
          )}

          {onOpenMediaGallery && (
            <button type="button" onClick={onOpenMediaGallery} className={iconBtn} title={t('Galeria mediów')} aria-label={t('Galeria mediów')}>
              <Image size={18} className="text-gray-500 group-hover:text-accent-primary transition-colors" />
            </button>
          )}

          {canInvite && (
            <button type="button" onClick={openInvite} className={iconBtn} title={inviteLabel} aria-label={inviteLabel}>
              <Link2 size={18} className="text-gray-500 group-hover:text-accent-primary transition-colors" />
            </button>
          )}

          {onSetMute && (
            <button
              type="button"
              onClick={() => setMuteOpen(v => !v)}
              // Otwarte menu: kliknięcie w dzwonek zamyka (bez zamknięcia „z zewnątrz” i ponownego otwarcia).
              onMouseDown={(e) => { if (muteOpen) e.stopPropagation(); }}
              onTouchStart={(e) => { if (muteOpen) e.stopPropagation(); }}
              className={iconBtn}
              title={muteTitle}
              aria-label={muteTitle}
              aria-haspopup="menu"
              aria-expanded={muteOpen}
            >
              {mute.muted ? (
                <BellOff size={18} className="text-gray-700 dark:text-gray-200" />
              ) : (
                <Bell size={18} className="text-gray-500 group-hover:text-accent-primary transition-colors" />
              )}
            </button>
          )}

          {isDirect && onToggleBlock && (
            <button type="button" onClick={onToggleBlock} className={iconBtn} title={blockLabel} aria-label={blockLabel} aria-pressed={peerBlocked}>
              <Ban size={18} className={peerBlocked ? 'text-red-600 dark:text-red-400' : 'text-gray-500 group-hover:text-red-500 transition-colors'} />
            </button>
          )}

          {!isDirect && onOpenSettings && (
            <button type="button" onClick={onOpenSettings} className={iconBtn} title={settingsLabel} aria-label={settingsLabel}>
              <Settings size={18} className="text-gray-500 group-hover:text-accent-primary transition-colors" />
            </button>
          )}

          {isDirect && onDelete && (
            <button
              type="button"
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
              <div role="menu" className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-gray-900 border border-gray-200/50 dark:border-gray-700/50 rounded-xl shadow-xl py-1 z-50">
                {onOpenSearch && (
                  <button type="button" role="menuitem" onClick={() => { onOpenSearch(); setShowMenu(false); }} className={menuItem}>
                    <Search size={16} />
                    {tr('Szukaj')}
                  </button>
                )}
                {onOpenMediaGallery && (
                  <button type="button" role="menuitem" onClick={() => { onOpenMediaGallery(); setShowMenu(false); }} className={menuItem}>
                    <Image size={16} />
                    {tr('Galeria')}
                  </button>
                )}
                {canInvite && (
                  <button type="button" role="menuitem" onClick={() => { setShowMenu(false); openInvite(); }} className={menuItem}>
                    <Link2 size={16} />
                    {inviteLabel}
                  </button>
                )}
                {onSetMute && (
                  <button type="button" role="menuitem" onClick={() => { setShowMenu(false); setMuteOpen(true); }} className={menuItem}>
                    {mute.muted ? <Bell size={16} /> : <BellOff size={16} />}
                    {mute.muted ? t('Powiadomienia…') : t('Wycisz…')}
                  </button>
                )}
                {isDirect && onToggleBlock && (
                  <button type="button" role="menuitem" onClick={() => { setShowMenu(false); onToggleBlock(); }} className={menuItem}>
                    <Ban size={16} />
                    {blockLabel}
                  </button>
                )}
                {!isDirect && onOpenSettings && (
                  <button type="button" role="menuitem" onClick={() => { onOpenSettings(); setShowMenu(false); }} className={menuItem}>
                    <Settings size={16} />
                    {tr('Ustawienia')}
                  </button>
                )}
                {isDirect && onDelete && (
                  <button
                    type="button"
                    role="menuitem"
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

        {onSetMute && (
          <MuteMenu
            open={muteOpen}
            onClose={() => setMuteOpen(false)}
            conversation={conversation}
            onSelect={(opt) => onSetMute(opt)}
          />
        )}
      </div>
    </div>
  );
}
