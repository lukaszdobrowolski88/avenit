import React, { useEffect, useLayoutEffect, useRef, useCallback, useMemo, useState } from 'react';
import { Loader, MessageSquare, Upload, ChevronDown, Megaphone, Ban, AlertTriangle, RefreshCw } from 'lucide-react';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import ConversationHeader from './ConversationHeader';
import TypingIndicator from './TypingIndicator';
import ForwardMessageModal from './ForwardMessageModal';
import PinnedMessagesPanel from './PinnedMessagesPanel';
import MediaGalleryModal from './MediaGalleryModal';
import SearchModal from './SearchModal';
import PollComposerModal from './PollComposerModal';
import EventShareModal from './EventShareModal';
import SeenByModal from './SeenByModal';
import ActiveCallBanner from '../calls/ActiveCallBanner';
import useMessages from '../hooks/useMessages';
import useRealtimeMessages from '../hooks/useRealtimeMessages';
import useTypingStatus from '../hooks/useTypingStatus';
import useReadReceipts from '../hooks/useReadReceipts';
import useReactions from '../hooks/useReactions';
import usePolls from '../hooks/usePolls';
import usePrayer from '../hooks/usePrayer';
import usePinnedMessages from '../hooks/usePinnedMessages';
import useMediaGallery from '../hooks/useMediaGallery';
import useMessageSearch from '../hooks/useMessageSearch';
import useBlocks from '../hooks/useBlocks';
import { usePresence } from '../../../hooks/usePresence';
import { supabase } from '../../../lib/supabase';
import { groupMessagesByDate, formatDateSeparator } from '../utils/messageHelpers';
import { canPostIn, sameEmail, canMentionAll as canMentionAllIn, isFromBlocked, readSince } from '../utils/chatLogic';
import { tr } from '../../../i18n';
import { toast } from '../../../lib/toast';
import { confirmDialog, promptDialog } from '../../../lib/dialog';

// Błąd już pokazany użytkownikowi (żeby wywołujący nie pokazywał drugiego komunikatu).
const handled = (err) => {
  const e = err && typeof err === 'object' ? err : new Error(String(err));
  try { e.handled = true; } catch { /* zamrożony obiekt */ }
  return e;
};

const HIGHLIGHT = ['bg-accent-primary-lighter', 'dark:bg-accent-primary-darkest/30'];

export default function MessageThread({
  conversation,
  userEmail,
  onBack,
  onOpenSettings,
  onMarkAsRead,
  onSetMute,
  onDeleteConversation,
  allConversations = [],
  perms = {},
  isAppAdmin = false
}) {
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const messageInputRef = useRef(null);
  const unreadSeparatorRef = useRef(null);

  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const [replyingTo, setReplyingTo] = useState(null);
  const [forwardingMessage, setForwardingMessage] = useState(null);
  const [showPinnedPanel, setShowPinnedPanel] = useState(false);
  const [showMediaGallery, setShowMediaGallery] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showPollComposer, setShowPollComposer] = useState(false);
  const [showEventShare, setShowEventShare] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [seenByMessage, setSeenByMessage] = useState(null);
  const [jumping, setJumping] = useState(false);
  const [pendingJump, setPendingJump] = useState(null);
  // „Przeczytane” z chwili wejścia (separator „Nowe wiadomości” i otwarcie przy pierwszej nieprzeczytanej).
  const [initialLastRead] = useState(() => readSince({ last_read_at: conversation?.lastReadAt, joined_at: conversation?.joinedAt }));
  const initialUnreadRef = useRef(conversation?.unreadCount || 0);

  const {
    messages, loading, loadingMore, hasMore, quoted, error: loadError, refetch,
    sendMessage, editMessage, deleteMessage, loadMore, loadSince, loadUntil,
    addMessage, applyRemoteUpdate, removeMessageLocal, forwardMessage
  } = useMessages(conversation?.id, userEmail);

  const { typingUsers, startTyping, stopTyping } = useTypingStatus(conversation?.id, userEmail, { canWrite: perms.typing !== false });
  const { getDeliveryStatus, getSeenBy, markMessagesAsRead, fetchReadReceipts } = useReadReceipts(conversation?.id, userEmail);
  const { fetchReactions, toggleReaction, getReactionsForMessage } = useReactions(conversation?.id, userEmail);
  const { fetchVotes, castVote, getResults } = usePolls(conversation?.id, userEmail);
  const { fetchResponses, togglePraying, getForMessage } = usePrayer(conversation?.id, userEmail);
  const { pinnedMessages, togglePin, isMessagePinned } = usePinnedMessages(conversation?.id, userEmail);
  const gallery = useMediaGallery(conversation?.id, showMediaGallery);
  const { results: searchResults, loading: searchLoading, search } = useMessageSearch(conversation?.id);
  const { blocked, isBlocked, block, unblock } = useBlocks(userEmail);

  const isAdmin = conversation?.myRole === 'admin';
  const isDirect = conversation?.type === 'direct';
  const postingPolicy = conversation?.posting_policy || 'everyone';
  const isAnnouncement = conversation?.type === 'announcement' || postingPolicy === 'admins';
  const canPost = canPostIn(conversation);
  const canEditOwn = perms.editMessages !== false;
  const canPin = isAdmin && perms.pin !== false;
  const mentionAllAllowed = canMentionAllIn(conversation, isAppAdmin);
  // Do przekazania: tylko rozmowy, w których mogę pisać (kanał ogłoszeń — gdy jestem administratorem).
  const forwardTargets = useMemo(() => allConversations.filter(canPostIn), [allConversations]);
  const participants = useMemo(() => conversation?.participants || [], [conversation?.participants]);
  const participantEmails = useMemo(() => participants.map(p => p.user_email).filter(Boolean), [participants]);
  const nameOf = useCallback((email) => participants.find(p => sameEmail(p.user_email, email))?.full_name || email, [participants]);

  const firstUnreadId = useMemo(() => {
    const boundary = initialLastRead ? new Date(initialLastRead) : null;
    const firstOther = messages.find(m =>
      !sameEmail(m.sender_email, userEmail) && m.message_type !== 'system' && (!boundary || new Date(m.created_at) > boundary)
    );
    // Nie pokazuj separatora, jeśli to pierwsza wiadomość całej rozmowy
    if (firstOther && messages[0] && firstOther.id === messages[0].id && !boundary) return null;
    return firstOther?.id || null;
  }, [messages, initialLastRead, userEmail]);

  // Druga osoba rozmowy 1:1 (status w nagłówku) + nadawcy wiadomości (status przy awatarze).
  const peerEmail = isDirect
    ? participants.find(p => !sameEmail(p.user_email, userEmail))?.user_email || null
    : null;
  const peerBlocked = !!peerEmail && isBlocked(peerEmail);
  const senderEmails = useMemo(() => {
    const emails = new Set();
    messages.forEach(msg => { if (msg.sender_email && !sameEmail(msg.sender_email, userEmail)) emails.add(msg.sender_email); });
    if (peerEmail) emails.add(peerEmail);
    return Array.from(emails);
  }, [messages, userEmail, peerEmail]);
  const { getStatus } = usePresence(senderEmails);

  const typingUserNames = useMemo(() => {
    if (!typingUsers.length || !participants.length) return [];
    return typingUsers
      .filter(email => !blocked.has(String(email).toLowerCase()))
      .map(email => {
        const participant = participants.find(p => sameEmail(p.user_email, email));
        return participant?.full_name || email.split('@')[0];
      });
  }, [typingUsers, participants, blocked]);

  const handleNewMessage = useCallback(async (newMessage) => {
    if (!sameEmail(newMessage.sender_email, userEmail)) {
      await addMessage(newMessage);
      onMarkAsRead?.(conversation?.id, newMessage.created_at);
    }
  }, [addMessage, userEmail, onMarkAsRead, conversation?.id]);

  // Edycja i usunięcie (soft delete) przychodzą z realtime jako UPDATE.
  const handleMessageUpdate = useCallback((row) => applyRemoteUpdate(row), [applyRemoteUpdate]);
  const handleMessageDelete = useCallback((id) => removeMessageLocal(id), [removeMessageLocal]);

  useRealtimeMessages(conversation?.id, handleNewMessage, handleMessageUpdate, handleMessageDelete);

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // Podświetl i przewiń do wiadomości, która jest już w DOM.
  const highlightMessage = useCallback((messageId) => {
    const element = document.getElementById(`message-${messageId}`);
    if (!element) return false;
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element.classList.add(...HIGHLIGHT);
    setTimeout(() => element.classList.remove(...HIGHLIGHT), 2000);
    return true;
  }, []);

  // Pierwsze wejście: przy nieprzeczytanych — przy separatorze „Nowe wiadomości” (doczytaj, jeśli
  // pierwsza nieprzeczytana jest starsza niż wczytana paczka); bez nich — na dół (K11).
  const lastMessage = messages[messages.length - 1];
  const didInitialScrollRef = useRef(false);
  useEffect(() => {
    if (!lastMessage || didInitialScrollRef.current || loading) return;
    didInitialScrollRef.current = true;
    const boundaryTs = initialLastRead ? new Date(initialLastRead).getTime() : 0;
    if (initialUnreadRef.current > 0 && boundaryTs) {
      const oldestTs = messages[0] ? new Date(messages[0].created_at).getTime() : 0;
      if (oldestTs > boundaryTs && hasMore) {
        loadSince(initialLastRead)
          .then(() => setPendingJump('__unread__'), () => scrollToBottom(false));
        return;
      }
      setPendingJump('__unread__');
      return;
    }
    scrollToBottom(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessage?.id, loading]);

  // Przewiń na dół, gdy przyszła NOWA wiadomość na końcu (doczytanie starszych nie przewija).
  const prevLastIdRef = useRef(null);
  useEffect(() => {
    const id = lastMessage?.id || null;
    const prev = prevLastIdRef.current;
    prevLastIdRef.current = id;
    if (!id || !prev || prev === id || !didInitialScrollRef.current) return;
    if (!showScrollBtn || sameEmail(lastMessage.sender_email, userEmail)) scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessage?.id]);

  // Skok czeka, aż wiadomość (albo separator) pojawi się w DOM.
  useEffect(() => {
    if (!pendingJump) return;
    const t = setTimeout(() => {
      if (pendingJump === '__unread__') {
        if (unreadSeparatorRef.current) unreadSeparatorRef.current.scrollIntoView({ block: 'start' });
        else scrollToBottom(false);
        setPendingJump(null);
        return;
      }
      if (highlightMessage(pendingJump)) setPendingJump(null);
    }, 30);
    return () => clearTimeout(t);
  }, [pendingJump, messages, highlightMessage, scrollToBottom]);

  // Skok do wiadomości (wyszukiwarka, cytat, przypięte) — doczytaj starsze aż się znajdzie (K11).
  const jumpToMessage = useCallback(async (messageId, createdAt = null) => {
    if (!messageId) return;
    if (highlightMessage(messageId)) return;
    setJumping(true);
    try {
      const found = await loadUntil(messageId, createdAt);
      if (found) setPendingJump(messageId);
      else toast.info(tr('Nie znaleziono tej wiadomości — mogła zostać usunięta.'));
    } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się wczytać starszych wiadomości.') });
    } finally {
      setJumping(false);
    }
  }, [highlightMessage, loadUntil]);

  // Po doczytaniu starszych wiadomości zachowaj miejsce, które użytkownik czytał.
  const restoreScrollRef = useRef(null);
  useLayoutEffect(() => {
    const r = restoreScrollRef.current;
    const container = messagesContainerRef.current;
    if (!r || !container || messages[0]?.id === r.firstId) return;
    container.scrollTop = container.scrollHeight - r.height + r.top;
    restoreScrollRef.current = null;
  }, [messages]);

  const handleLoadMore = useCallback(async () => {
    const container = messagesContainerRef.current;
    if (container) restoreScrollRef.current = { height: container.scrollHeight, top: container.scrollTop, firstId: messages[0]?.id };
    try {
      await loadMore();
    } catch (err) {
      restoreScrollRef.current = null;
      toast.error(err, { fallback: tr('Nie udało się wczytać starszych wiadomości.') });
    }
  }, [loadMore, messages]);

  // Wejście w rozmowę = przeczytane (znacznik nie wcześniejszy niż ostatnia wiadomość w wątku).
  const newestCreatedAt = messages[messages.length - 1]?.created_at || null;
  useEffect(() => {
    if (conversation?.id && conversation.unreadCount > 0) onMarkAsRead?.(conversation.id, newestCreatedAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id, conversation?.unreadCount, onMarkAsRead]);

  // Potwierdzenia: pobierz dla wczytanych wiadomości i oznacz cudze jako przeczytane (każdą raz).
  useEffect(() => {
    if (messages.length === 0 || !userEmail) return;
    fetchReadReceipts(messages.map(m => m.id));
    markMessagesAsRead(messages);
  }, [messages, userEmail, markMessagesAsRead, fetchReadReceipts]);

  // Pobierz reakcje / głosy / modlitwy dla wiadomości
  useEffect(() => {
    if (messages.length === 0) return;
    const ids = messages.map(m => m.id);
    fetchReactions(ids);
    const pollIds = messages.filter(m => m.message_type === 'poll').map(m => m.id);
    if (pollIds.length) fetchVotes(pollIds);
    const prayerIds = messages.filter(m => m.message_type === 'prayer').map(m => m.id);
    if (prayerIds.length) fetchResponses(prayerIds);
  }, [messages, fetchReactions, fetchVotes, fetchResponses]);

  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    if (!loading && !loadingMore && !jumping && hasMore && container.scrollTop < 100 && didInitialScrollRef.current) handleLoadMore();
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    setShowScrollBtn(distanceFromBottom > 300);
  }, [loading, loadingMore, jumping, hasMore, handleLoadMore]);

  // Wysyłka: błąd (np. „W tym kanale piszą tylko administratorzy”, blokada, brak sieci) pokazujemy
  // od razu, a wpisany tekst i załączniki zostają w polu (MessageInput czyści je dopiero po sukcesie).
  const handleSendMessage = async (content, attachments, replyToId = null, extra = {}) => {
    stopTyping();
    try {
      await sendMessage(content, attachments, replyToId, extra);
    } catch (err) {
      console.error('Error sending message:', err);
      const fallback = err?.code === 'BLOCKED'
        ? tr('Nie możesz wysłać wiadomości tej osobie.')
        : tr('Nie udało się wysłać wiadomości. Spróbuj ponownie.');
      toast.error(err, { fallback });
      throw handled(err);
    }
    setReplyingTo(null);
    scrollToBottom();
  };

  const handleCreatePoll = async (pollMeta) => {
    await handleSendMessage(pollMeta.question, [], null, { messageType: 'poll', metadata: pollMeta });
  };

  const handleShareEvent = async (eventMeta) => {
    await handleSendMessage(eventMeta.title || tr('Wydarzenie'), [], null, { messageType: 'event', metadata: eventMeta });
  };

  const handleEditMessage = useCallback(async (messageId, content) => {
    try {
      await editMessage(messageId, content);
    } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się zapisać zmian w wiadomości.') });
      throw handled(err);
    }
  }, [editMessage]);

  const handleDeleteMessage = useCallback(async (messageId) => {
    try {
      await deleteMessage(messageId);
      toast.success(tr('Wiadomość usunięta'));
    } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się usunąć wiadomości.') });
      throw handled(err);
    }
  }, [deleteMessage]);

  const handleTogglePin = useCallback(async (messageId) => {
    try {
      await togglePin(messageId);
    } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się zmienić przypięcia wiadomości.') });
    }
  }, [togglePin]);

  // Zgłoś wiadomość (K10) — trafia do administratorów; treść zgłoszenia opcjonalna.
  const handleReport = useCallback(async (message) => {
    const reason = await promptDialog({
      title: tr('Zgłoś wiadomość'),
      message: tr('Zgłoszenie trafi do administratorów kościoła. Napisz krótko, co jest nie tak (opcjonalnie).'),
      placeholder: tr('np. obraźliwe treści, spam'),
      confirmLabel: tr('Wyślij zgłoszenie'),
      defaultValue: '',
    });
    if (reason === null || reason === undefined) return;
    const { error } = await supabase
      .from('message_reports')
      .insert({
        message_id: message.id,
        conversation_id: conversation?.id,
        reporter_email: userEmail,
        reason: String(reason).trim() || null,
        status: 'open',
      })
      .select('id');
    if (error) {
      toast.error(error, { fallback: tr('Nie udało się wysłać zgłoszenia. Spróbuj ponownie.') });
      return;
    }
    toast.success(tr('Dziękujemy. Zgłoszenie trafiło do administratorów.'));
  }, [conversation?.id, userEmail]);

  // Zablokuj / odblokuj osobę (K10).
  const blockPerson = useCallback(async (email) => {
    if (!email) return;
    const name = nameOf(email);
    const ok = await confirmDialog({
      title: tr('Zablokować: {name}?', { name }),
      message: tr('Nie dostaniesz od tej osoby wiadomości prywatnych, a jej wiadomości w grupach będą schowane. Ta osoba nie zobaczy, że ją zablokowano. Możesz to cofnąć w każdej chwili.'),
      confirmLabel: tr('Zablokuj'),
      danger: true,
      isDelete: false,
    });
    if (!ok) return;
    try {
      await block(email);
      toast.success(tr('Zablokowano: {name}', { name }));
    } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się zablokować osoby. Spróbuj ponownie.') });
    }
  }, [block, nameOf]);

  const unblockPerson = useCallback(async (email) => {
    if (!email) return;
    const name = nameOf(email);
    try {
      await unblock(email);
      toast.success(tr('Odblokowano: {name}', { name }));
    } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się odblokować osoby. Spróbuj ponownie.') });
    }
  }, [unblock, nameOf]);

  const handleBlockSender = useCallback((message) => blockPerson(message?.sender_email), [blockPerson]);
  const handleToggleBlockPeer = useCallback(() => {
    if (!peerEmail) return;
    if (peerBlocked) unblockPerson(peerEmail); else blockPerson(peerEmail);
  }, [peerEmail, peerBlocked, blockPerson, unblockPerson]);

  const handleReply = useCallback((message) => setReplyingTo(message), []);
  const handleCancelReply = useCallback(() => setReplyingTo(null), []);
  const handleForward = useCallback((message) => setForwardingMessage(message), []);
  // Przekazanie: każda rozmowa osobno; modal zamyka się tylko, gdy coś się udało.
  const handleForwardSubmit = useCallback(async (message, targetConversationIds) => {
    const results = await forwardMessage(message, targetConversationIds);
    const failed = results.filter(r => !r.success);
    const okCount = results.length - failed.length;
    if (failed.length === 0) {
      toast.success(okCount === 1 ? tr('Wiadomość przekazana') : tr('Wiadomość przekazana do {n} rozmów', { n: okCount }));
      return;
    }
    if (okCount === 0) {
      toast.error(failed[0].error, { fallback: tr('Nie udało się przekazać wiadomości.') });
      throw handled(failed[0].error);
    }
    toast.error(tr('Przekazano do {ok} z {total} rozmów. Do pozostałych nie udało się wysłać.', { ok: okCount, total: results.length }));
  }, [forwardMessage]);

  const handleShowSeenBy = useCallback((message) => setSeenByMessage(message), []);
  const handleTyping = useCallback(() => startTyping(), [startTyping]);
  const handleSetMute = onSetMute && conversation?.id ? (opt) => onSetMute(conversation.id, opt) : undefined;

  const handleDragEnter = useCallback((e) => {
    e.preventDefault(); e.stopPropagation(); dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) setIsDragging(true);
  }, []);
  const handleDragLeave = useCallback((e) => {
    e.preventDefault(); e.stopPropagation(); dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  }, []);
  const handleDragOver = useCallback((e) => { e.preventDefault(); e.stopPropagation(); }, []);
  const handleDrop = useCallback((e) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false); dragCounter.current = 0;
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0 && messageInputRef.current && canPost && !peerBlocked) {
      messageInputRef.current.addFilesFromDrop(droppedFiles);
    }
  }, [canPost, peerBlocked]);

  if (!conversation) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 text-center px-4">
        <div className="w-24 h-24 rounded-3xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-6">
          <MessageSquare size={40} className="text-gray-500 dark:text-gray-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">{tr('Wybierz rozmowę')}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">{tr('Wybierz rozmowę z listy po lewej stronie lub rozpocznij nową konwersację')}</p>
      </div>
    );
  }

  const groupedMessages = groupMessagesByDate(messages);
  const dateGroups = Object.entries(groupedMessages);
  // Liczba odbiorców (bez nadawcy) — „Przeczytało N z M” w kanale ogłoszeń.
  const recipientsCount = Math.max(0, participantEmails.length - 1);

  return (
    <div
      className="h-full flex flex-col bg-gray-50 dark:bg-gray-900 relative"
      onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-white/40 dark:bg-gray-900/40 backdrop-blur-sm flex items-center justify-center border-2 border-dashed border-accent-primary-light rounded-xl m-2 pointer-events-none">
          <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm rounded-2xl p-8 shadow-2xl flex flex-col items-center gap-4 border border-gray-200/60 dark:border-gray-700/60">
            <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center">
              <Upload size={36} className="text-gray-700 dark:text-gray-200" />
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{tr('Upuść pliki tutaj')}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{tr('Maksymalnie 10 plików, do 10MB każdy')}</p>
          </div>
        </div>
      )}

      <ConversationHeader
        conversation={conversation}
        onBack={onBack}
        onOpenSettings={onOpenSettings}
        onSetMute={handleSetMute}
        onDelete={isDirect && isAdmin ? onDeleteConversation : undefined}
        onOpenMediaGallery={() => setShowMediaGallery(true)}
        onOpenSearch={() => setShowSearch(true)}
        showBackButton={true}
        peerStatus={peerEmail && !peerBlocked ? getStatus(peerEmail) : null}
        peerBlocked={peerBlocked}
        onToggleBlock={isDirect && peerEmail ? handleToggleBlockPeer : undefined}
        isAppAdmin={isAppAdmin}
      />

      {/* Trwa rozmowa audio/wideo — dołącz */}
      <ActiveCallBanner conversation={conversation} />

      {/* Baner kanału ogłoszeń */}
      {isAnnouncement && (
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-100/80 dark:bg-gray-800/60 border-b border-gray-200/60 dark:border-gray-700/60 text-xs text-gray-700 dark:text-gray-300">
          <Megaphone size={14} />
          {tr('Kanał ogłoszeń – piszą tylko administratorzy')}
        </div>
      )}

      <PinnedMessagesPanel
        pinnedMessages={pinnedMessages}
        isExpanded={showPinnedPanel}
        onToggleExpand={() => setShowPinnedPanel(!showPinnedPanel)}
        onScrollToMessage={jumpToMessage}
        onUnpin={handleTogglePin}
        canUnpin={canPin}
      />

      {jumping && (
        <div className="absolute left-1/2 -translate-x-1/2 top-20 z-30 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white dark:bg-gray-800 shadow-lg text-xs text-gray-700 dark:text-gray-200" role="status">
          <Loader size={13} className="animate-spin" /> {tr('Wczytuję starsze wiadomości…')}
        </div>
      )}

      <div ref={messagesContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 custom-scrollbar [overflow-anchor:none]">
        {loading && messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <Loader size={24} className="animate-spin text-gray-600 dark:text-gray-300" />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{tr('Ładowanie wiadomości...')}</p>
          </div>
        ) : messages.length === 0 && loadError ? (
          // Nieudane wczytanie (np. chwilowy restart serwera) — wcześniej wyglądało jak „Brak wiadomości”.
          <div className="flex flex-col items-center justify-center h-full text-center" role="alert">
            <div className="w-20 h-20 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
              <AlertTriangle size={32} className="text-gray-500 dark:text-gray-400" aria-hidden="true" />
            </div>
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">{tr('Nie udało się wczytać wiadomości')}</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm max-w-xs mb-4">{tr('Sprawdź internet i spróbuj ponownie.')}</p>
            <button type="button" onClick={() => refetch()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400">
              <RefreshCw size={15} aria-hidden="true" /> {tr('Spróbuj ponownie')}
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-20 h-20 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
              <MessageSquare size={32} className="text-gray-500 dark:text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">{tr('Brak wiadomości')}</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm max-w-xs">{tr('Rozpocznij konwersację wysyłając pierwszą wiadomość')}</p>
          </div>
        ) : (
          <>
            {hasMore && (
              <div className="flex justify-center py-3 mb-4">
                <button type="button" onClick={handleLoadMore} disabled={loadingMore}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white/80 dark:bg-gray-800/80 rounded-xl border border-gray-200/60 dark:border-gray-700/60 shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50">
                  {loadingMore ? <span className="flex items-center gap-2"><Loader size={14} className="animate-spin" />{tr('Ładowanie...')}</span> : tr('Załaduj starsze wiadomości')}
                </button>
              </div>
            )}

            {dateGroups.map(([date, msgs]) => (
              <div key={date}>
                <div className="flex items-center justify-center my-6">
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                  <div className="mx-4 px-4 py-1.5 bg-white/90 dark:bg-gray-800/90 rounded-full border border-gray-200/50 dark:border-gray-700/50 shadow-sm">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{formatDateSeparator(msgs[0]?.created_at) || date}</span>
                  </div>
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                </div>

                <div className="space-y-3">
                  {msgs.map((message, idx) => {
                    const isOwn = sameEmail(message.sender_email, userEmail);
                    const prevMessage = msgs[idx - 1];
                    const showAvatar = !prevMessage ||
                      !sameEmail(prevMessage.sender_email, message.sender_email) ||
                      new Date(message.created_at) - new Date(prevMessage.created_at) > 5 * 60 * 1000;
                    const replyTo = message.reply_to_id
                      ? (messages.find(m => m.id === message.reply_to_id) || quoted[message.reply_to_id] || null)
                      : null;
                    const seen = isOwn ? getSeenBy(message.id, userEmail) : [];

                    return (
                      <React.Fragment key={message.id}>
                        {firstUnreadId === message.id && (
                          <div ref={unreadSeparatorRef} className="flex items-center justify-center my-4 scroll-mt-16">
                            <div className="flex-1 h-px bg-gray-300 dark:bg-gray-600" />
                            <span className="mx-3 px-3 py-1 rounded-full bg-accent-primary text-white text-[11px] font-semibold shadow-sm">
                              {tr('Nowe wiadomości')}
                            </span>
                            <div className="flex-1 h-px bg-gray-300 dark:bg-gray-600" />
                          </div>
                        )}
                        <div id={`message-${message.id}`} className="transition-colors duration-500 rounded-2xl">
                          <MessageBubble
                            message={message}
                            isOwn={isOwn}
                            showAvatar={showAvatar}
                            senderStatus={!isOwn ? getStatus(message.sender_email) : null}
                            onEdit={isOwn && canEditOwn ? handleEditMessage : undefined}
                            onDelete={isOwn && canEditOwn ? handleDeleteMessage : undefined}
                            onReply={canPost && !peerBlocked ? handleReply : undefined}
                            onForward={handleForward}
                            onTogglePin={handleTogglePin}
                            isPinned={isMessagePinned(message.id)}
                            canPin={canPin}
                            onScrollToMessage={jumpToMessage}
                            onToggleReaction={toggleReaction}
                            reactions={getReactionsForMessage(message.id)}
                            deliveryStatus={isOwn ? getDeliveryStatus(message.id, userEmail, participantEmails) : null}
                            replyToMessage={replyTo}
                            currentUserEmail={userEmail}
                            pollResults={message.message_type === 'poll' ? getResults(message) : null}
                            prayerState={message.message_type === 'prayer' ? getForMessage(message.id) : null}
                            onVote={castVote}
                            onTogglePraying={togglePraying}
                            nameOf={nameOf}
                            showReadCount={isAnnouncement && isOwn}
                            readCount={seen.length}
                            readTotal={isAnnouncement ? recipientsCount : null}
                            seenCount={!isDirect ? seen.length : 0}
                            onShowSeenBy={!isDirect ? handleShowSeenBy : undefined}
                            onReport={!isOwn ? handleReport : undefined}
                            onBlockSender={!isOwn && !isDirect ? handleBlockSender : undefined}
                            hiddenAsBlocked={!isDirect && isFromBlocked(message, blocked, userEmail)}
                            isGroupConversation={!isDirect}
                          />
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            ))}

            {typingUserNames.length > 0 && <TypingIndicator userNames={typingUserNames} />}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Przycisk scroll-to-bottom */}
      {showScrollBtn && (
        <button
          type="button"
          onClick={() => { scrollToBottom(); setShowScrollBtn(false); }}
          className="absolute right-4 bottom-24 z-20 w-10 h-10 flex items-center justify-center bg-white dark:bg-gray-800 border border-gray-200/70 dark:border-gray-700/70 rounded-full shadow-lg hover:scale-105 transition-all text-gray-600 dark:text-gray-300"
          title={tr('Przewiń na dół')}
          aria-label={tr('Przewiń na dół')}
        >
          <ChevronDown size={20} />
        </button>
      )}

      {peerBlocked ? (
        <div className="border-t border-gray-200/50 dark:border-gray-700/50 p-4 bg-white/80 dark:bg-gray-900/80">
          <div className="flex flex-wrap items-center justify-center gap-3 py-1 text-sm text-gray-600 dark:text-gray-300">
            <Ban size={16} aria-hidden="true" />
            <span>{tr('Ta osoba jest zablokowana. Nie dostaniesz od niej wiadomości.')}</span>
            <button type="button" onClick={() => unblockPerson(peerEmail)} className="font-semibold underline underline-offset-2 hover:text-gray-900 dark:hover:text-white">
              {tr('Odblokuj')}
            </button>
          </div>
        </div>
      ) : (
        <MessageInput
          ref={messageInputRef}
          onSend={handleSendMessage}
          onTyping={handleTyping}
          replyingTo={replyingTo}
          onCancelReply={handleCancelReply}
          conversationId={conversation.id}
          participants={participants}
          currentUserEmail={userEmail}
          canPost={canPost}
          canMentionAll={mentionAllAllowed}
          onOpenPoll={() => setShowPollComposer(true)}
          onOpenEventShare={() => setShowEventShare(true)}
        />
      )}

      <ForwardMessageModal
        isOpen={!!forwardingMessage}
        onClose={() => setForwardingMessage(null)}
        message={forwardingMessage}
        conversations={forwardTargets}
        currentUserEmail={userEmail}
        onForward={handleForwardSubmit}
      />

      <MediaGalleryModal
        isOpen={showMediaGallery}
        onClose={() => setShowMediaGallery(false)}
        images={gallery.images}
        files={gallery.files}
        loading={gallery.loading}
        hasMore={gallery.hasMore}
        loadingMore={gallery.loadingMore}
        onLoadMore={gallery.loadMore}
      />

      <SearchModal isOpen={showSearch} onClose={() => setShowSearch(false)} onSearch={search} results={searchResults} loading={searchLoading} onScrollToMessage={jumpToMessage} />

      <PollComposerModal isOpen={showPollComposer} onClose={() => setShowPollComposer(false)} onSubmit={handleCreatePoll} />

      <EventShareModal isOpen={showEventShare} onClose={() => setShowEventShare(false)} onShare={handleShareEvent} />

      <SeenByModal
        isOpen={!!seenByMessage}
        onClose={() => setSeenByMessage(null)}
        seen={seenByMessage ? getSeenBy(seenByMessage.id, userEmail) : []}
        participants={participants}
        senderEmail={userEmail}
      />
    </div>
  );
}
