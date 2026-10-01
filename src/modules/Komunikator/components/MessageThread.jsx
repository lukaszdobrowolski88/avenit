import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { Loader, MessageSquare, Upload, ChevronDown, Megaphone } from 'lucide-react';
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
import { usePresence } from '../../../hooks/usePresence';
import { groupMessagesByDate } from '../utils/messageHelpers';
import { tr } from '../../../i18n';

export default function MessageThread({
  conversation,
  userEmail,
  onBack,
  onOpenSettings,
  onMarkAsRead,
  onDeleteConversation,
  allConversations = []
}) {
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const messageInputRef = useRef(null);

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
  const [initialLastRead, setInitialLastRead] = useState(null);

  const {
    messages, loading, hasMore,
    sendMessage, editMessage, deleteMessage, loadMore, addMessage, forwardMessage
  } = useMessages(conversation?.id, userEmail);

  const { typingUsers, startTyping, stopTyping } = useTypingStatus(conversation?.id, userEmail);
  const { isMessageRead, getReadBy, getDeliveryStatus, markMessagesAsRead } = useReadReceipts(conversation?.id, userEmail);
  const { fetchReactions, toggleReaction, getReactionsForMessage } = useReactions(conversation?.id, userEmail);
  const { fetchVotes, castVote, getResults } = usePolls(conversation?.id, userEmail);
  const { fetchResponses, togglePraying, getForMessage } = usePrayer(conversation?.id, userEmail);
  const { pinnedMessages, togglePin, isMessagePinned } = usePinnedMessages(conversation?.id, userEmail);
  const { images, files, loading: mediaLoading } = useMediaGallery(conversation?.id);
  const { results: searchResults, loading: searchLoading, search } = useMessageSearch(conversation?.id);

  const isAdmin = conversation?.myRole === 'admin';
  const postingPolicy = conversation?.posting_policy || 'everyone';
  const isAnnouncement = conversation?.type === 'announcement' || postingPolicy === 'admins';
  const canPost = postingPolicy !== 'admins' || isAdmin;

  // Zapamiętaj last_read_at przy wejściu (do separatora nieprzeczytanych)
  useEffect(() => {
    setInitialLastRead(conversation?.lastReadAt || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id]);

  const firstUnreadId = useMemo(() => {
    const boundary = initialLastRead ? new Date(initialLastRead) : null;
    const firstOther = messages.find(m =>
      m.sender_email !== userEmail && (!boundary || new Date(m.created_at) > boundary)
    );
    // Nie pokazuj separatora, jeśli to pierwsza wiadomość całej rozmowy
    if (firstOther && messages[0] && firstOther.id === messages[0].id && !boundary) return null;
    return firstOther?.id || null;
  }, [messages, initialLastRead, userEmail]);

  const senderEmails = useMemo(() => {
    const emails = new Set();
    messages.forEach(msg => { if (msg.sender_email && msg.sender_email !== userEmail) emails.add(msg.sender_email); });
    return Array.from(emails);
  }, [messages, userEmail]);
  const { getStatus } = usePresence(senderEmails);

  const typingUserNames = useMemo(() => {
    if (!typingUsers.length || !conversation?.participants) return [];
    return typingUsers.map(email => {
      const participant = conversation.participants.find(p => p.user_email === email);
      return participant?.full_name || email.split('@')[0];
    });
  }, [typingUsers, conversation?.participants]);

  const handleNewMessage = useCallback(async (newMessage) => {
    if (newMessage.sender_email !== userEmail) {
      await addMessage(newMessage);
      onMarkAsRead?.(conversation?.id);
    }
  }, [addMessage, userEmail, onMarkAsRead, conversation?.id]);

  const handleMessageUpdate = useCallback(() => {}, []);
  const handleMessageDelete = useCallback(() => {}, []);

  useRealtimeMessages(conversation?.id, handleNewMessage, handleMessageUpdate, handleMessageDelete);

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  useEffect(() => {
    if (messages.length > 0 && !showScrollBtn) scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  useEffect(() => {
    if (conversation?.id && conversation.unreadCount > 0) onMarkAsRead?.(conversation.id);
  }, [conversation?.id, conversation?.unreadCount, onMarkAsRead]);

  useEffect(() => {
    if (messages.length > 0 && userEmail) {
      const unreadMessageIds = messages.filter(m => m.sender_email !== userEmail).map(m => m.id);
      if (unreadMessageIds.length > 0) markMessagesAsRead(unreadMessageIds);
    }
  }, [messages, userEmail, markMessagesAsRead]);

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
    if (!loading && hasMore && container.scrollTop < 100) loadMore();
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    setShowScrollBtn(distanceFromBottom > 300);
  }, [loading, hasMore, loadMore]);

  const handleSendMessage = async (content, attachments, replyToId = null, extra = {}) => {
    stopTyping();
    await sendMessage(content, attachments, replyToId, extra);
    setReplyingTo(null);
    scrollToBottom();
  };

  const handleCreatePoll = async (pollMeta) => {
    await sendMessage(pollMeta.question, [], null, { messageType: 'poll', metadata: pollMeta });
    scrollToBottom();
  };

  const handleShareEvent = async (eventMeta) => {
    await sendMessage(eventMeta.title || tr('Wydarzenie'), [], null, { messageType: 'event', metadata: eventMeta });
    scrollToBottom();
  };

  const handleReply = useCallback((message) => setReplyingTo(message), []);
  const handleCancelReply = useCallback(() => setReplyingTo(null), []);
  const handleForward = useCallback((message) => setForwardingMessage(message), []);
  const handleForwardSubmit = useCallback(async (message, targetConversationIds) => {
    await forwardMessage(message, targetConversationIds);
  }, [forwardMessage]);

  const scrollToMessage = useCallback((messageId) => {
    const element = document.getElementById(`message-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('bg-accent-primary-lighter', 'dark:bg-accent-primary-darkest/30');
      setTimeout(() => element.classList.remove('bg-accent-primary-lighter', 'dark:bg-accent-primary-darkest/30'), 2000);
    }
  }, []);

  const handleTyping = useCallback(() => startTyping(), [startTyping]);
  const handleToggleMute = async () => {};

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
    if (droppedFiles && droppedFiles.length > 0 && messageInputRef.current && canPost) {
      messageInputRef.current.addFilesFromDrop(droppedFiles);
    }
  }, [canPost]);

  if (!conversation) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 via-accent-primary-lightest/30 to-accent-secondary-lightest/30 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800/50 text-center px-4">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-accent-primary-lighter to-accent-secondary-lighter dark:from-accent-primary-darkest/30 dark:to-accent-secondary-darkest/30 flex items-center justify-center mb-6 shadow-lg shadow-accent-primary-light/10">
          <MessageSquare size={40} className="text-accent-primary-light" />
        </div>
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">{tr('Wybierz rozmowę')}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">{tr('Wybierz rozmowę z listy po lewej stronie lub rozpocznij nową konwersację')}</p>
      </div>
    );
  }

  const groupedMessages = groupMessagesByDate(messages);
  const dateGroups = Object.entries(groupedMessages);

  return (
    <div
      className="h-full flex flex-col bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800/50 relative"
      onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-gradient-to-br from-accent-primary-light/20 to-accent-secondary-light/20 backdrop-blur-sm flex items-center justify-center border-2 border-dashed border-accent-primary-light rounded-xl m-2 pointer-events-none animate-pulse">
          <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm rounded-2xl p-8 shadow-2xl flex flex-col items-center gap-4 border border-accent-primary-lighter/50 dark:border-accent-primary-dark/50">
            <div className="w-20 h-20 bg-gradient-to-br from-accent-primary-lighter to-accent-secondary-lighter dark:from-accent-primary-darkest/40 dark:to-accent-secondary-darkest/40 rounded-2xl flex items-center justify-center shadow-lg shadow-accent-primary-light/20">
              <Upload size={36} className="text-accent-primary" />
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
        onToggleMute={handleToggleMute}
        onDelete={onDeleteConversation}
        onOpenMediaGallery={() => setShowMediaGallery(true)}
        onOpenSearch={() => setShowSearch(true)}
        showBackButton={true}
      />

      {/* Baner kanału ogłoszeń */}
      {isAnnouncement && (
        <div className="flex items-center gap-2 px-4 py-2 bg-accent-primary-lightest/70 dark:bg-accent-primary-darkest/20 border-b border-accent-primary-lighter/50 dark:border-accent-primary-dark/30 text-xs text-accent-primary dark:text-accent-primary-light">
          <Megaphone size={14} />
          {tr('Kanał ogłoszeń – piszą tylko administratorzy')}
        </div>
      )}

      <PinnedMessagesPanel
        pinnedMessages={pinnedMessages}
        isExpanded={showPinnedPanel}
        onToggleExpand={() => setShowPinnedPanel(!showPinnedPanel)}
        onScrollToMessage={scrollToMessage}
        onUnpin={togglePin}
        canUnpin={isAdmin}
      />

      <div ref={messagesContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {loading && messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent-primary-lighter to-accent-secondary-lighter dark:from-accent-primary-darkest/30 dark:to-accent-secondary-darkest/30 flex items-center justify-center">
              <Loader size={24} className="animate-spin text-accent-primary" />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{tr('Ładowanie wiadomości...')}</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-accent-primary-lighter to-accent-secondary-lighter dark:from-accent-primary-darkest/30 dark:to-accent-secondary-darkest/30 flex items-center justify-center mb-4 shadow-lg shadow-accent-primary-light/10">
              <MessageSquare size={32} className="text-accent-primary-light" />
            </div>
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">{tr('Brak wiadomości')}</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm max-w-xs">{tr('Rozpocznij konwersację wysyłając pierwszą wiadomość')}</p>
          </div>
        ) : (
          <>
            {hasMore && (
              <div className="flex justify-center py-3 mb-4">
                <button onClick={loadMore} disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-accent-primary dark:text-accent-primary-light bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-accent-primary-lighter/50 dark:border-accent-primary-dark/50 shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50">
                  {loading ? <span className="flex items-center gap-2"><Loader size={14} className="animate-spin" />{tr('Ładowanie...')}</span> : tr('Załaduj starsze wiadomości')}
                </button>
              </div>
            )}

            {dateGroups.map(([date, msgs]) => (
              <div key={date}>
                <div className="flex items-center justify-center my-6">
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-600 to-transparent" />
                  <div className="mx-4 px-4 py-1.5 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-full border border-gray-200/50 dark:border-gray-700/50 shadow-sm">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{date}</span>
                  </div>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-600 to-transparent" />
                </div>

                <div className="space-y-3">
                  {msgs.map((message, idx) => {
                    const isOwn = message.sender_email === userEmail;
                    const prevMessage = msgs[idx - 1];
                    const showAvatar = !prevMessage ||
                      prevMessage.sender_email !== message.sender_email ||
                      new Date(message.created_at) - new Date(prevMessage.created_at) > 5 * 60 * 1000;

                    return (
                      <React.Fragment key={message.id}>
                        {firstUnreadId === message.id && (
                          <div className="flex items-center justify-center my-4">
                            <div className="flex-1 h-px bg-accent-primary-light/40" />
                            <span className="mx-3 px-3 py-1 rounded-full bg-accent-primary text-white text-[11px] font-semibold shadow-sm">
                              {tr('Nowe wiadomości')}
                            </span>
                            <div className="flex-1 h-px bg-accent-primary-light/40" />
                          </div>
                        )}
                        <div id={`message-${message.id}`} className="transition-colors duration-500">
                          <MessageBubble
                            message={message}
                            isOwn={isOwn}
                            showAvatar={showAvatar}
                            senderStatus={!isOwn ? getStatus(message.sender_email) : null}
                            onEdit={isOwn ? editMessage : undefined}
                            onDelete={isOwn ? deleteMessage : undefined}
                            onReply={handleReply}
                            onForward={handleForward}
                            onTogglePin={togglePin}
                            isPinned={isMessagePinned(message.id)}
                            canPin={isAdmin}
                            onScrollToMessage={scrollToMessage}
                            onToggleReaction={toggleReaction}
                            reactions={getReactionsForMessage(message.id)}
                            isRead={isOwn ? isMessageRead(message.id, userEmail) : false}
                            readBy={isOwn ? getReadBy(message.id, userEmail) : []}
                            deliveryStatus={isOwn ? getDeliveryStatus(message.id, userEmail) : null}
                            currentUserEmail={userEmail}
                            pollResults={message.message_type === 'poll' ? getResults(message) : null}
                            prayerState={message.message_type === 'prayer' ? getForMessage(message.id) : null}
                            onVote={castVote}
                            onTogglePraying={togglePraying}
                            showReadCount={isAnnouncement}
                            readCount={isOwn ? getReadBy(message.id, userEmail).length : 0}
                            allMessages={messages}
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
          onClick={() => { scrollToBottom(); setShowScrollBtn(false); }}
          className="absolute right-4 bottom-24 z-20 w-10 h-10 flex items-center justify-center bg-white dark:bg-gray-800 border border-gray-200/70 dark:border-gray-700/70 rounded-full shadow-lg hover:scale-105 transition-all text-gray-600 dark:text-gray-300"
          title={tr('Przewiń na dół')}
        >
          <ChevronDown size={20} />
        </button>
      )}

      <MessageInput
        ref={messageInputRef}
        onSend={handleSendMessage}
        onTyping={handleTyping}
        replyingTo={replyingTo}
        onCancelReply={handleCancelReply}
        conversationId={conversation.id}
        participants={conversation.participants || []}
        currentUserEmail={userEmail}
        canPost={canPost}
        onOpenPoll={() => setShowPollComposer(true)}
        onOpenEventShare={() => setShowEventShare(true)}
      />

      <ForwardMessageModal
        isOpen={!!forwardingMessage}
        onClose={() => setForwardingMessage(null)}
        message={forwardingMessage}
        conversations={allConversations}
        currentUserEmail={userEmail}
        onForward={handleForwardSubmit}
      />

      <MediaGalleryModal isOpen={showMediaGallery} onClose={() => setShowMediaGallery(false)} images={images} files={files} loading={mediaLoading} />

      <SearchModal isOpen={showSearch} onClose={() => setShowSearch(false)} onSearch={search} results={searchResults} loading={searchLoading} onScrollToMessage={scrollToMessage} />

      <PollComposerModal isOpen={showPollComposer} onClose={() => setShowPollComposer(false)} onSubmit={handleCreatePoll} />

      <EventShareModal isOpen={showEventShare} onClose={() => setShowEventShare(false)} onShare={handleShareEvent} />
    </div>
  );
}
