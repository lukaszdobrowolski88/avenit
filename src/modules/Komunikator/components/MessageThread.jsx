import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { Loader, MessageSquare, Upload } from 'lucide-react';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import ConversationHeader from './ConversationHeader';
import TypingIndicator from './TypingIndicator';
import ForwardMessageModal from './ForwardMessageModal';
import PinnedMessagesPanel from './PinnedMessagesPanel';
import MediaGalleryModal from './MediaGalleryModal';
import SearchModal from './SearchModal';
import useMessages from '../hooks/useMessages';
import useRealtimeMessages from '../hooks/useRealtimeMessages';
import useTypingStatus from '../hooks/useTypingStatus';
import useReadReceipts from '../hooks/useReadReceipts';
import useReactions from '../hooks/useReactions';
import usePinnedMessages from '../hooks/usePinnedMessages';
import useMediaGallery from '../hooks/useMediaGallery';
import useMessageSearch from '../hooks/useMessageSearch';
import { usePresence } from '../../../hooks/usePresence';
import { groupMessagesByDate } from '../utils/messageHelpers';

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

  // Drag & drop state
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  // Reply state
  const [replyingTo, setReplyingTo] = useState(null);

  // Forward state
  const [forwardingMessage, setForwardingMessage] = useState(null);

  // Pinned messages panel state
  const [showPinnedPanel, setShowPinnedPanel] = useState(false);

  // Media gallery state
  const [showMediaGallery, setShowMediaGallery] = useState(false);

  // Search state
  const [showSearch, setShowSearch] = useState(false);

  const {
    messages,
    loading,
    hasMore,
    sendMessage,
    editMessage,
    deleteMessage,
    loadMore,
    addMessage,
    forwardMessage
  } = useMessages(conversation?.id, userEmail);

  // Typing status
  const { typingUsers, startTyping, stopTyping } = useTypingStatus(conversation?.id, userEmail);

  // Read receipts
  const { isMessageRead, getReadBy, markMessagesAsRead } = useReadReceipts(conversation?.id, userEmail);

  // Reactions
  const { fetchReactions, toggleReaction, getReactionsForMessage } = useReactions(conversation?.id, userEmail);

  // Pinned messages
  const { pinnedMessages, togglePin, isMessagePinned } = usePinnedMessages(conversation?.id, userEmail);

  // Sprawdź czy użytkownik jest adminem
  const isAdmin = conversation?.myRole === 'admin';

  // Media gallery
  const { images, files, loading: mediaLoading } = useMediaGallery(conversation?.id);

  // Message search
  const { results: searchResults, loading: searchLoading, search } = useMessageSearch(conversation?.id);

  // Zbierz emaile nadawców wiadomości dla statusów presence
  const senderEmails = useMemo(() => {
    const emails = new Set();
    messages.forEach(msg => {
      if (msg.sender_email && msg.sender_email !== userEmail) {
        emails.add(msg.sender_email);
      }
    });
    return Array.from(emails);
  }, [messages, userEmail]);

  // Pobierz statusy presence nadawców
  const { getStatus } = usePresence(senderEmails);

  // Pobierz nazwy piszących użytkowników z uczestników konwersacji
  const typingUserNames = useMemo(() => {
    if (!typingUsers.length || !conversation?.participants) return [];
    return typingUsers.map(email => {
      const participant = conversation.participants.find(p => p.user_email === email);
      return participant?.full_name || email.split('@')[0];
    });
  }, [typingUsers, conversation?.participants]);

  // Real-time subscriptions
  const handleNewMessage = useCallback(async (newMessage) => {
    if (newMessage.sender_email !== userEmail) {
      await addMessage(newMessage);
      onMarkAsRead?.(conversation?.id);
    }
  }, [addMessage, userEmail, onMarkAsRead, conversation?.id]);

  const handleMessageUpdate = useCallback((updatedMessage) => {
    // Obsłużone przez hook useMessages
  }, []);

  const handleMessageDelete = useCallback((messageId) => {
    // Obsłużone przez hook useMessages
  }, []);

  useRealtimeMessages(
    conversation?.id,
    handleNewMessage,
    handleMessageUpdate,
    handleMessageDelete
  );

  // Scroll do najnowszych wiadomości
  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto'
    });
  }, []);

  // Scroll przy nowych wiadomościach
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages.length, scrollToBottom]);

  // Oznacz jako przeczytane przy otwarciu
  useEffect(() => {
    if (conversation?.id && conversation.unreadCount > 0) {
      onMarkAsRead?.(conversation.id);
    }
  }, [conversation?.id, conversation?.unreadCount, onMarkAsRead]);

  // Oznacz wiadomości jako przeczytane (dla read receipts)
  useEffect(() => {
    if (messages.length > 0 && userEmail) {
      // Oznacz wszystkie wiadomości od innych jako przeczytane
      const unreadMessageIds = messages
        .filter(m => m.sender_email !== userEmail)
        .map(m => m.id);
      if (unreadMessageIds.length > 0) {
        markMessagesAsRead(unreadMessageIds);
      }
    }
  }, [messages, userEmail, markMessagesAsRead]);

  // Pobierz reakcje dla wiadomości
  useEffect(() => {
    if (messages.length > 0) {
      const messageIds = messages.map(m => m.id);
      fetchReactions(messageIds);
    }
  }, [messages, fetchReactions]);

  // Infinite scroll - ładowanie starszych wiadomości
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container || loading || !hasMore) return;

    if (container.scrollTop < 100) {
      loadMore();
    }
  }, [loading, hasMore, loadMore]);

  // Wysyłanie wiadomości
  const handleSendMessage = async (content, attachments, replyToId = null) => {
    stopTyping(); // Zatrzymaj wskaźnik pisania
    await sendMessage(content, attachments, replyToId);
    setReplyingTo(null); // Wyczyść stan reply po wysłaniu
    scrollToBottom();
  };

  // Reply handlers
  const handleReply = useCallback((message) => {
    setReplyingTo(message);
  }, []);

  const handleCancelReply = useCallback(() => {
    setReplyingTo(null);
  }, []);

  // Forward handlers
  const handleForward = useCallback((message) => {
    setForwardingMessage(message);
  }, []);

  const handleForwardSubmit = useCallback(async (message, targetConversationIds) => {
    await forwardMessage(message, targetConversationIds);
  }, [forwardMessage]);

  // Scroll do konkretnej wiadomości
  const scrollToMessage = useCallback((messageId) => {
    const element = document.getElementById(`message-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Podświetl wiadomość na chwilę
      element.classList.add('bg-pink-100', 'dark:bg-pink-900/30');
      setTimeout(() => {
        element.classList.remove('bg-pink-100', 'dark:bg-pink-900/30');
      }, 2000);
    }
  }, []);

  // Obsługa pisania
  const handleTyping = useCallback(() => {
    startTyping();
  }, [startTyping]);

  // Toggle mute
  const handleToggleMute = async () => {
    // TODO: Implementacja mute
  };

  // Drag & drop handlers
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    const files = e.dataTransfer.files;
    if (files && files.length > 0 && messageInputRef.current) {
      messageInputRef.current.addFilesFromDrop(files);
    }
  }, []);

  if (!conversation) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 via-pink-50/30 to-orange-50/30 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800/50 text-center px-4">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-pink-100 to-orange-100 dark:from-pink-900/30 dark:to-orange-900/30 flex items-center justify-center mb-6 shadow-lg shadow-pink-500/10">
          <MessageSquare size={40} className="text-pink-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">
          Wybierz rozmowę
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
          Wybierz rozmowę z listy po lewej stronie lub rozpocznij nową konwersację
        </p>
      </div>
    );
  }

  const groupedMessages = groupMessagesByDate(messages);
  const dateGroups = Object.entries(groupedMessages);

  return (
    <div
      className="h-full flex flex-col bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800/50 relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag & drop overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-gradient-to-br from-pink-500/20 to-orange-500/20 backdrop-blur-sm flex items-center justify-center border-2 border-dashed border-pink-500 rounded-xl m-2 pointer-events-none animate-pulse">
          <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm rounded-2xl p-8 shadow-2xl flex flex-col items-center gap-4 border border-pink-200/50 dark:border-pink-800/50">
            <div className="w-20 h-20 bg-gradient-to-br from-pink-100 to-orange-100 dark:from-pink-900/40 dark:to-orange-900/40 rounded-2xl flex items-center justify-center shadow-lg shadow-pink-500/20">
              <Upload size={36} className="text-pink-600" />
            </div>
            <p className="text-xl font-bold bg-gradient-to-r from-pink-600 to-orange-500 bg-clip-text text-transparent">Upuść pliki tutaj</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Maksymalnie 10 plików, do 10MB każdy</p>
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

      {/* Przypięte wiadomości */}
      <PinnedMessagesPanel
        pinnedMessages={pinnedMessages}
        isExpanded={showPinnedPanel}
        onToggleExpand={() => setShowPinnedPanel(!showPinnedPanel)}
        onScrollToMessage={scrollToMessage}
        onUnpin={togglePin}
        canUnpin={isAdmin}
      />

      {/* Wiadomości */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 custom-scrollbar"
      >
        {loading && messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-100 to-orange-100 dark:from-pink-900/30 dark:to-orange-900/30 flex items-center justify-center">
              <Loader size={24} className="animate-spin text-pink-600" />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Ładowanie wiadomości...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-pink-100 to-orange-100 dark:from-pink-900/30 dark:to-orange-900/30 flex items-center justify-center mb-4 shadow-lg shadow-pink-500/10">
              <MessageSquare size={32} className="text-pink-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Brak wiadomości
            </h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm max-w-xs">
              Rozpocznij konwersację wysyłając pierwszą wiadomość
            </p>
          </div>
        ) : (
          <>
            {/* Loader dla ładowania starszych wiadomości */}
            {hasMore && (
              <div className="flex justify-center py-3 mb-4">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-pink-600 dark:text-pink-400 hover:text-pink-700 dark:hover:text-pink-300 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-pink-200/50 dark:border-pink-800/50 shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader size={14} className="animate-spin" />
                      Ładowanie...
                    </span>
                  ) : (
                    'Załaduj starsze wiadomości'
                  )}
                </button>
              </div>
            )}

            {/* Wiadomości pogrupowane po datach */}
            {dateGroups.map(([date, msgs]) => (
              <div key={date}>
                {/* Separator daty */}
                <div className="flex items-center justify-center my-6">
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-600 to-transparent" />
                  <div className="mx-4 px-4 py-1.5 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-full border border-gray-200/50 dark:border-gray-700/50 shadow-sm">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                      {date}
                    </span>
                  </div>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-600 to-transparent" />
                </div>

                {/* Wiadomości z danego dnia */}
                <div className="space-y-3">
                  {msgs.map((message, idx) => {
                    const isOwn = message.sender_email === userEmail;
                    const prevMessage = msgs[idx - 1];
                    const showAvatar = !prevMessage ||
                      prevMessage.sender_email !== message.sender_email ||
                      new Date(message.created_at) - new Date(prevMessage.created_at) > 5 * 60 * 1000;

                    return (
                      <div key={message.id} id={`message-${message.id}`} className="transition-colors duration-500">
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
                          allMessages={messages}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Wskaźnik pisania */}
            {typingUserNames.length > 0 && (
              <TypingIndicator userNames={typingUserNames} />
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <MessageInput
        ref={messageInputRef}
        onSend={handleSendMessage}
        onTyping={handleTyping}
        replyingTo={replyingTo}
        onCancelReply={handleCancelReply}
      />

      {/* Forward Modal */}
      <ForwardMessageModal
        isOpen={!!forwardingMessage}
        onClose={() => setForwardingMessage(null)}
        message={forwardingMessage}
        conversations={allConversations}
        currentUserEmail={userEmail}
        onForward={handleForwardSubmit}
      />

      {/* Media Gallery Modal */}
      <MediaGalleryModal
        isOpen={showMediaGallery}
        onClose={() => setShowMediaGallery(false)}
        images={images}
        files={files}
        loading={mediaLoading}
      />

      {/* Search Modal */}
      <SearchModal
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        onSearch={search}
        results={searchResults}
        loading={searchLoading}
        onScrollToMessage={scrollToMessage}
      />
    </div>
  );
}
