import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import ConversationList from './components/ConversationList';
import MessageThread from './components/MessageThread';
import NewConversationModal from './components/NewConversationModal';
import GroupSettingsModal from './components/GroupSettingsModal';
import ReportsPanel, { countOpenReports } from './components/ReportsPanel';
import MeetingModal from './meetings/MeetingModal';
import { useCalls } from './calls/callContext';
import useConversations from './hooks/useConversations';
import useMinistryChannels from './hooks/useMinistryChannels';
import useChatPolicy from './hooks/useChatPolicy';
import { useNotificationContext } from '../../contexts/NotificationContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { toast } from '../../lib/toast';
import { tr } from '../../i18n';

// Cache userEmail - współdzielony
const USER_EMAIL_CACHE_KEY = 'user_email_cache';

export default function KomunikatorModule() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { can, subject, ready } = usePermissions();
  const isAppAdmin = !!subject?.isAdmin;
  // Moderacja zgłoszeń (K10): administrator aplikacji albo akcja „Rozpatruj zgłoszenia wiadomości”
  // (action:komunikator:moderate). Serwer i tak sprawdza.
  const canModerate = !!ready && !!subject && (isAppAdmin || can('action:komunikator:moderate'));

  // Co rola pozwala zapisać (serwer i tak egzekwuje; tu tylko nie pokazujemy martwych przycisków).
  const perms = useMemo(() => ({
    manageOwn: can('res:conversation_participants:update'),        // przeczytane, gwiazdka, przypięcie, archiwum, wyciszenie, role
    addParticipants: can('res:conversation_participants:create'),
    removeParticipants: can('res:conversation_participants:delete'), // usuwanie osób, opuszczanie rozmowy
    editConversation: can('res:conversations:update'),             // nazwa rozmowy
    deleteConversation: can('res:conversations:delete'),
    editMessages: can('res:messages:update'),                      // edycja i usuwanie własnych wiadomości
    typing: can('res:typing_status:create'),
    pin: can('res:pinned_messages:create'),
  }), [can]);

  // Inicjalizuj z cache od razu
  const [userEmail, setUserEmail] = useState(() => {
    try { return localStorage.getItem(USER_EMAIL_CACHE_KEY) || null; } catch { return null; }
  });

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        setUserEmail(user.email);
        try { localStorage.setItem(USER_EMAIL_CACHE_KEY, user.email); } catch { /* ignoruj */ }
      }
    };
    // Pobierz w tle nawet jeśli mamy cache (dla weryfikacji)
    getUser();
  }, []);

  const [selectedConversation, setSelectedConversation] = useState(null);

  const {
    conversations,
    loading,
    refetch,
    createDirectConversation,
    createGroupConversation,
    createAnnouncementChannel,
    markAsRead,
    deleteConversation,
    leaveConversation,
    toggleStar,
    toggleArchive,
    togglePin,
    setMute
  } = useConversations(userEmail, { canManageOwn: perms.manageOwn, openConversationId: selectedConversation?.id ?? null });

  // Polityka rozmów prywatnych (K9) — do objaśnienia w „Nowej rozmowie”; serwer egzekwuje.
  const chatPolicy = useChatPolicy(!!userEmail);

  // Hook powiadomień - używamy wspólnego kontekstu
  const { notifications, markAsRead: markNotificationAsRead } = useNotificationContext();

  // Kanały służb i grup domowych: skład utrzymuje serwer (K8). Administrator może wymusić
  // odświeżenie składów od razu.
  const { syncNow: syncChannels, syncing: syncingChannels } = useMinistryChannels(userEmail);
  const handleSyncChannels = useCallback(async () => {
    try {
      await syncChannels();
      await refetch();
      toast.success(tr('Składy kanałów odświeżone'));
    } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się odświeżyć kanałów. Spróbuj ponownie później.') });
    }
  }, [syncChannels, refetch]);

  // Zgłoszenia (K10): licznik otwartych przy przycisku panelu.
  const [showReports, setShowReports] = useState(false);
  const [openReports, setOpenReports] = useState(0);
  const refreshReportsCount = useCallback(() => {
    if (!canModerate) return;
    countOpenReports().then((n) => setOpenReports(n || 0), () => {});
  }, [canModerate]);
  useEffect(() => { refreshReportsCount(); }, [refreshReportsCount]);

  const [pendingOpenId, setPendingOpenId] = useState(null);
  const urlRefetchRef = useRef(null); // rozmowa z linku, dla której już odświeżyliśmy listę
  const [showNewModal, setShowNewModal] = useState(false);
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  // Spotkania wymagają połączeń (LiveKit) — bez nich przycisk „Zaplanuj spotkanie” jest ukryty.
  const calls = useCalls();
  const meetingsOn = !!calls && calls.callsEnabled !== false;
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);
  const [showList, setShowList] = useState(true);

  // Wykrywanie mobile view
  useEffect(() => {
    const checkMobile = () => {
      setIsMobileView(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Aktualizuj selected conversation gdy lista się zmieni (np. nowe osoby, zmiana nazwy).
  // Rozmowa, której już nie ma na liście (usunięta, opuszczona, usunięto mnie) — zamknij.
  useEffect(() => {
    if (!selectedConversation) return;
    const updated = conversations.find(c => c.id === selectedConversation.id);
    if (updated) {
      if (updated !== selectedConversation) setSelectedConversation(updated);
    } else if (!loading && pendingOpenId !== selectedConversation.id) {
      setSelectedConversation(null);
      setShowSettingsModal(false);
      if (isMobileView) setShowList(true);
    }
  }, [conversations]); // eslint-disable-line react-hooks/exhaustive-deps

  // Oznacz powiadomienia jako przeczytane dla danej konwersacji
  const markConversationNotificationsAsRead = useCallback((conversationId) => {
    if (!conversationId || !notifications || notifications.length === 0) return;
    const convIdStr = String(conversationId);
    notifications
      .filter(n => !n.read && (n.type === 'message' || n.type === 'mention' || n.type === 'meeting') && n.data?.conversation_id && String(n.data.conversation_id) === convIdStr)
      .forEach(n => markNotificationAsRead(n.id));
  }, [notifications, markNotificationAsRead]);

  // Wybierz konwersację
  const handleSelectConversation = useCallback((conv) => {
    setSelectedConversation(conv);
    if (isMobileView) setShowList(false);
    if (conv?.id) markConversationNotificationsAsRead(conv.id);
  }, [isMobileView, markConversationNotificationsAsRead]);

  // Obsłuż parametr conversation z URL (np. z powiadomienia). Rozmowy, której jeszcze nie ma na
  // liście (nowa, albo lista z pamięci podręcznej sprzed chwili) — odśwież listę raz i otwórz po wczytaniu.
  useEffect(() => {
    const conversationId = searchParams.get('conversation');
    if (!conversationId || !userEmail) return;
    const conv = conversations.find(c => String(c.id) === conversationId);
    if (conv) {
      handleSelectConversation(conv);
      // Wyczyść parametr z URL po otwarciu konwersacji
      setSearchParams({}, { replace: true });
    } else if (!loading && urlRefetchRef.current !== conversationId) {
      urlRefetchRef.current = conversationId;
      refetch();
    }
  }, [searchParams, conversations, handleSelectConversation, setSearchParams, loading, refetch, userEmail]);

  // Oznacz powiadomienia jako przeczytane gdy użytkownik wejdzie w konwersację
  useEffect(() => {
    if (selectedConversation?.id) {
      markConversationNotificationsAsRead(selectedConversation.id);
    }
  }, [selectedConversation?.id, markConversationNotificationsAsRead]);

  // Otwórz rozmowę po id — od razu, a jeśli jeszcze jej nie ma na liście, gdy się pojawi.
  const openConversationById = useCallback((id) => {
    if (!id) return;
    const conv = conversations.find(c => c.id === id);
    if (conv) {
      setPendingOpenId(null);
      handleSelectConversation(conv);
    } else {
      setPendingOpenId(id);
    }
  }, [conversations, handleSelectConversation]);

  useEffect(() => {
    if (!pendingOpenId) return;
    const conv = conversations.find(c => c.id === pendingOpenId);
    if (conv) {
      setPendingOpenId(null);
      handleSelectConversation(conv);
    }
  }, [pendingOpenId, conversations, handleSelectConversation]);

  // Wróć do listy (mobile)
  const handleBack = () => {
    setShowList(true);
    setSelectedConversation(null);
  };

  // Utwórz rozmowę prywatną (albo otwórz istniejącą). Błąd obsługuje modal (zostaje otwarty).
  const handleCreateDirect = async (email) => {
    const { id, created } = await createDirectConversation(email);
    openConversationById(id);
    if (created) toast.success(tr('Rozmowa utworzona'));
  };

  // Utwórz grupę
  const handleCreateGroup = async (name, emails) => {
    const { id } = await createGroupConversation(name, emails);
    openConversationById(id);
    toast.success(tr('Grupa „{name}” utworzona', { name }));
  };

  // Utwórz kanał ogłoszeń
  const handleCreateAnnouncement = async (name, emails) => {
    const { id } = await createAnnouncementChannel(name, emails);
    openConversationById(id);
    toast.success(tr('Kanał „{name}” utworzony', { name }));
  };

  // Po aktualizacji ustawień grupy — lekki refetch (skład, nazwa), bez paczki wiadomości.
  const handleSettingsUpdate = async () => {
    await refetch({ light: true });
  };

  const closeSelected = () => {
    setSelectedConversation(null);
    setShowSettingsModal(false);
    if (isMobileView) setShowList(true);
  };

  // Usuń rozmowę prywatną (dla obu osób). Rzuca błąd — nagłówek go pokazuje.
  const handleDeleteConversation = async (conversationId) => {
    await deleteConversation(conversationId);
    closeSelected();
    toast.success(tr('Rozmowa usunięta'));
  };

  // Opuść rozmowę (z ustawień grupy). Rzuca błąd — modal go pokazuje.
  const handleLeaveConversation = async (conversationId) => {
    const name = selectedConversation?.displayName || selectedConversation?.name || '';
    await leaveConversation(conversationId);
    closeSelected();
    toast.success(name ? tr('Opuszczono rozmowę „{name}”', { name }) : tr('Opuszczono rozmowę'));
  };

  return (
    <div className="h-[calc(100vh-3.5rem)] lg:h-[calc(100vh-7rem)] -m-4 lg:-m-6 flex relative bg-gray-50 dark:bg-gray-900 rounded-xl lg:rounded-xl overflow-hidden shadow-lg border border-gray-200/50 dark:border-gray-700">
      {/* Lista konwersacji */}
      <div
        className={`
          ${isMobileView ? 'absolute inset-0 z-10' : 'w-80 flex-shrink-0'}
          ${isMobileView && !showList ? 'hidden' : ''}
        `}
      >
        <ConversationList
          conversations={conversations}
          selectedId={selectedConversation?.id}
          onSelect={handleSelectConversation}
          onNewConversation={() => setShowNewModal(true)}
          onToggleStar={toggleStar}
          onToggleArchive={toggleArchive}
          onTogglePin={togglePin}
          canManage={perms.manageOwn}
          loading={loading}
          currentUserEmail={userEmail}
          onOpenReports={canModerate ? () => setShowReports(true) : undefined}
          onNewMeeting={meetingsOn ? () => setShowMeetingModal(true) : undefined}
          openReportsCount={openReports}
          onSyncChannels={isAppAdmin ? handleSyncChannels : undefined}
          syncingChannels={syncingChannels}
        />
      </div>

      {/* Wątek wiadomości — key: osobny stan (szkic, odpowiedź, załączniki, paginacja) dla każdej rozmowy */}
      <div
        className={`
          flex-1 flex flex-col min-w-0
          ${isMobileView ? 'absolute inset-0 z-10' : ''}
          ${isMobileView && showList ? 'hidden' : ''}
        `}
      >
        <MessageThread
          key={selectedConversation?.id || 'none'}
          conversation={selectedConversation}
          userEmail={userEmail}
          onBack={handleBack}
          onOpenSettings={() => setShowSettingsModal(true)}
          onMarkAsRead={markAsRead}
          onSetMute={perms.manageOwn ? setMute : undefined}
          onDeleteConversation={perms.deleteConversation ? handleDeleteConversation : undefined}
          allConversations={conversations}
          perms={perms}
          isAppAdmin={isAppAdmin}
        />
      </div>

      {/* Modal nowej rozmowy */}
      <NewConversationModal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreateDirect={handleCreateDirect}
        onCreateGroup={handleCreateGroup}
        onCreateAnnouncement={handleCreateAnnouncement}
        currentUserEmail={userEmail}
        dmPolicy={chatPolicy}
      />

      {/* Zaplanuj spotkanie online — po zapisaniu otwieramy rozmowę spotkania */}
      {showMeetingModal && (
        <MeetingModal
          isOpen
          onClose={() => setShowMeetingModal(false)}
          currentUserEmail={userEmail}
          onSaved={(m) => { if (m?.conversation_id) { refetch({ light: true }); openConversationById(m.conversation_id); } }}
        />
      )}

      {/* Modal ustawień grupy */}
      <GroupSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        conversation={selectedConversation}
        currentUserEmail={userEmail}
        onUpdate={handleSettingsUpdate}
        onLeave={perms.removeParticipants ? handleLeaveConversation : undefined}
        perms={perms}
      />

      {/* Panel zgłoszeń (moderacja) */}
      {canModerate && (
        <ReportsPanel
          isOpen={showReports}
          onClose={() => { setShowReports(false); refreshReportsCount(); }}
          currentUserEmail={userEmail}
          onOpenConversation={openConversationById}
          onChanged={refreshReportsCount}
        />
      )}
    </div>
  );
}
