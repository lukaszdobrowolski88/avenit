import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical, Edit2, Trash2, Check, X, FileText, Image, Table, File, Download, CheckCheck, Reply, Smile, Forward, Pin, Copy } from 'lucide-react';
import UserAvatar from './UserAvatar';
import { formatMessageTime, formatFileSize, isImageFile, getFileIcon } from '../utils/messageHelpers';
import { REACTION_EMOJIS } from '../hooks/useReactions';
import AudioPlayer from './AudioPlayer';

export default function MessageBubble({
  message,
  isOwn,
  showAvatar = true,
  senderStatus = null,
  onEdit,
  onDelete,
  onReply,
  onForward,
  onTogglePin,
  isPinned = false,
  canPin = false,
  onScrollToMessage,
  onToggleReaction,
  reactions = [],
  isRead = false,
  readBy = [],
  allMessages = []
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef(null);
  const reactionRef = useRef(null);

  // Zamknij menu po kliknięciu poza nim
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
      }
      if (reactionRef.current && !reactionRef.current.contains(e.target)) {
        setShowReactionPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    setShowMenu(false);
  };

  const handleSaveEdit = () => {
    if (editContent.trim() && editContent !== message.content) {
      onEdit?.(message.id, editContent.trim());
    }
    setIsEditing(false);
    setShowMenu(false);
  };

  const handleCancelEdit = () => {
    setEditContent(message.content);
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (window.confirm('Czy na pewno chcesz usunąć tę wiadomość?')) {
      onDelete?.(message.id);
    }
    setShowMenu(false);
  };

  const handleReply = () => {
    onReply?.(message);
    setShowMenu(false);
  };

  const handleForward = () => {
    onForward?.(message);
    setShowMenu(false);
  };

  const handleTogglePin = () => {
    onTogglePin?.(message.id);
    setShowMenu(false);
  };

  // Znajdź wiadomość, na którą odpowiadamy
  const replyToMessage = message.reply_to_id
    ? allMessages.find(m => m.id === message.reply_to_id)
    : null;

  // Sprawdź czy załącznik to audio
  const isAudioFile = (type) => {
    return type?.startsWith('audio/') || false;
  };

  const renderAttachment = (attachment, idx) => {
    const iconMap = {
      'image': Image,
      'file-text': FileText,
      'table': Table,
      'file': File
    };
    const IconComponent = iconMap[getFileIcon(attachment.type)] || File;

    // Wiadomość głosowa lub plik audio
    if (isAudioFile(attachment.type) || attachment.isVoiceMessage) {
      return (
        <AudioPlayer
          key={idx}
          url={attachment.url}
          duration={attachment.duration}
          isOwn={isOwn}
        />
      );
    }

    if (isImageFile(attachment.type)) {
      return (
        <a
          key={idx}
          href={attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block group/img relative overflow-hidden rounded-xl"
        >
          <img
            src={attachment.url}
            alt={attachment.name}
            className="max-w-xs max-h-48 rounded-xl object-cover transition-all duration-300 group-hover/img:scale-105"
          />
          <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 transition-all duration-300 rounded-xl flex items-center justify-center">
            <div className="opacity-0 group-hover/img:opacity-100 transition-all duration-300 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm rounded-full p-2 shadow-lg">
              <Image size={18} className="text-pink-500" />
            </div>
          </div>
        </a>
      );
    }

    return (
      <a
        key={idx}
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-200 group/file ${
          isOwn
            ? 'bg-white/10 hover:bg-white/20 backdrop-blur-sm'
            : 'bg-gray-100 dark:bg-gray-700/50 hover:bg-gray-200 dark:hover:bg-gray-600/50'
        }`}
      >
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
          isOwn
            ? 'bg-white/20'
            : 'bg-gradient-to-br from-pink-500/20 to-orange-500/20'
        }`}>
          <IconComponent size={20} className={isOwn ? 'text-white' : 'text-pink-500'} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{attachment.name}</p>
          <p className="text-xs opacity-70">{formatFileSize(attachment.size)}</p>
        </div>
        <div className={`p-2 rounded-lg transition-all duration-200 ${
          isOwn
            ? 'bg-white/10 group-hover/file:bg-white/20'
            : 'bg-gray-200/50 dark:bg-gray-600/50 group-hover/file:bg-gray-300/50 dark:group-hover/file:bg-gray-500/50'
        }`}>
          <Download size={16} className="opacity-70 group-hover/file:opacity-100" />
        </div>
      </a>
    );
  };

  return (
    <div className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : ''} group`}>
      {/* Avatar lub placeholder dla wyrównania */}
      {!isOwn && (
        showAvatar ? (
          <UserAvatar
            user={message.sender}
            size="sm"
            className="flex-shrink-0 mt-1"
            showStatus={!!senderStatus}
            status={senderStatus}
          />
        ) : (
          <div className="w-8 flex-shrink-0" />
        )
      )}

      <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} max-w-[70%]`}>
        {!isOwn && showAvatar && (
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5 ml-1">
            {message.sender?.full_name || message.sender_email}
          </span>
        )}

        <div className="relative">
          {isEditing ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full min-w-[200px] px-4 py-3 rounded-xl border border-gray-200/50 dark:border-gray-700/50 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-pink-500/50 resize-none shadow-lg"
                rows={2}
                autoFocus
              />
              <div className="flex gap-1.5 justify-end">
                <button
                  onClick={handleCancelEdit}
                  className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-all duration-200"
                >
                  <X size={16} />
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="p-2 rounded-xl bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 text-white shadow-lg shadow-pink-500/30 transition-all duration-200"
                >
                  <Check size={16} />
                </button>
              </div>
            </div>
          ) : (
            <>
              <div
                className={`px-4 py-2.5 rounded-2xl transition-all duration-200 ${
                  isOwn
                    ? 'bg-gradient-to-br from-pink-500 to-pink-600 text-white rounded-br-md shadow-lg shadow-pink-500/20'
                    : 'bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm text-gray-900 dark:text-gray-100 rounded-bl-md shadow-md border border-gray-100/50 dark:border-gray-700/50'
                } ${isPinned ? 'ring-2 ring-yellow-400/50 ring-offset-2 ring-offset-white dark:ring-offset-gray-900' : ''}`}
              >
                {/* Wskaźnik przekazanej wiadomości */}
                {message.forwarded_from && (
                  <div className={`flex items-center gap-1.5 mb-2 text-xs ${isOwn ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'}`}>
                    <Forward size={12} className="opacity-70" />
                    <span className="italic">Przekazana wiadomość</span>
                  </div>
                )}

                {/* Cytat odpowiadanej wiadomości */}
                {replyToMessage && (
                  <div
                    onClick={() => onScrollToMessage?.(replyToMessage.id)}
                    className={`mb-2.5 p-2.5 rounded-xl cursor-pointer border-l-3 transition-all duration-200 ${
                      isOwn
                        ? 'bg-white/10 border-white/50 hover:bg-white/15'
                        : 'bg-gradient-to-r from-pink-50 to-orange-50 dark:from-pink-900/20 dark:to-orange-900/20 border-pink-400 hover:from-pink-100 hover:to-orange-100 dark:hover:from-pink-900/30 dark:hover:to-orange-900/30'
                    }`}
                  >
                    <p className={`text-xs font-semibold mb-0.5 ${isOwn ? 'text-white/90' : 'text-pink-600 dark:text-pink-400'}`}>
                      <Reply size={10} className="inline mr-1" />
                      {replyToMessage.sender?.full_name || replyToMessage.sender_email}
                    </p>
                    <p className={`text-xs line-clamp-2 ${isOwn ? 'text-white/70' : 'text-gray-600 dark:text-gray-400'}`}>
                      {replyToMessage.content || (replyToMessage.attachments?.length > 0 ? '📎 Załącznik' : '')}
                    </p>
                  </div>
                )}

                <p className="whitespace-pre-wrap break-words">{message.content}</p>

                {message.attachments && message.attachments.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {message.attachments.map((att, idx) => renderAttachment(att, idx))}
                  </div>
                )}
              </div>

              {/* Menu kontekstowe - przycisk */}
              <button
                onClick={() => setShowMenu(!showMenu)}
                className={`absolute top-1/2 -translate-y-1/2 p-1.5 rounded-xl opacity-0 group-hover:opacity-100 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm hover:bg-white dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-all duration-200 shadow-sm ${
                  isOwn ? '-left-9' : '-right-9'
                }`}
              >
                <MoreVertical size={14} />
              </button>

              {/* Menu kontekstowe - dropdown */}
              {showMenu && (
                <div
                  ref={menuRef}
                  className={`absolute top-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl shadow-xl py-1.5 z-10 min-w-[140px] ${
                    isOwn ? '-left-36' : '-right-36'
                  }`}
                >
                  {/* Odpowiedz */}
                  <button
                    onClick={handleReply}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gradient-to-r hover:from-pink-50 hover:to-orange-50 dark:hover:from-pink-900/30 dark:hover:to-orange-900/30 transition-all duration-200"
                  >
                    <Reply size={14} className="text-gray-400" />
                    Odpowiedz
                  </button>
                  {/* Przekaż */}
                  <button
                    onClick={handleForward}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gradient-to-r hover:from-pink-50 hover:to-orange-50 dark:hover:from-pink-900/30 dark:hover:to-orange-900/30 transition-all duration-200"
                  >
                    <Forward size={14} className="text-gray-400" />
                    Przekaż
                  </button>
                  {/* Kopiuj */}
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gradient-to-r hover:from-pink-50 hover:to-orange-50 dark:hover:from-pink-900/30 dark:hover:to-orange-900/30 transition-all duration-200"
                  >
                    {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} className="text-gray-400" />}
                    {copied ? 'Skopiowano!' : 'Kopiuj'}
                  </button>
                  {/* Przypnij - tylko dla adminów */}
                  {canPin && (
                    <button
                      onClick={handleTogglePin}
                      className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm transition-all duration-200 ${
                        isPinned
                          ? 'text-yellow-600 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-900/30'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gradient-to-r hover:from-pink-50 hover:to-orange-50 dark:hover:from-pink-900/30 dark:hover:to-orange-900/30'
                      }`}
                    >
                      <Pin size={14} className={isPinned ? 'fill-current text-yellow-500' : 'text-gray-400'} />
                      {isPinned ? 'Odepnij' : 'Przypnij'}
                    </button>
                  )}
                  {/* Separator */}
                  {isOwn && <div className="my-1 border-t border-gray-200/50 dark:border-gray-700/50" />}
                  {/* Edytuj - tylko dla własnych */}
                  {isOwn && (
                    <button
                      onClick={() => {
                        setIsEditing(true);
                        setShowMenu(false);
                      }}
                      className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gradient-to-r hover:from-pink-50 hover:to-orange-50 dark:hover:from-pink-900/30 dark:hover:to-orange-900/30 transition-all duration-200"
                    >
                      <Edit2 size={14} className="text-gray-400" />
                      Edytuj
                    </button>
                  )}
                  {/* Usuń - tylko dla własnych */}
                  {isOwn && (
                    <button
                      onClick={handleDelete}
                      className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all duration-200"
                    >
                      <Trash2 size={14} />
                      Usuń
                    </button>
                  )}
                </div>
              )}
              {/* Przycisk reakcji - widoczny przy hover */}
              <button
                onClick={() => setShowReactionPicker(!showReactionPicker)}
                className={`absolute top-1/2 -translate-y-1/2 p-1.5 rounded-xl opacity-0 group-hover:opacity-100 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm hover:bg-white dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-pink-500 transition-all duration-200 shadow-sm ${
                  isOwn ? '-left-[4.5rem]' : '-right-[4.5rem]'
                }`}
              >
                <Smile size={14} />
              </button>

              {/* Reaction picker */}
              {showReactionPicker && (
                <div
                  ref={reactionRef}
                  className={`absolute bottom-full mb-2 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-2xl shadow-xl px-2 py-2 flex gap-0.5 z-20 ${
                    isOwn ? 'right-0' : 'left-0'
                  }`}
                >
                  {REACTION_EMOJIS.map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => {
                        onToggleReaction?.(message.id, emoji);
                        setShowReactionPicker(false);
                      }}
                      className="text-xl hover:scale-125 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all duration-200 p-1.5"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Wyświetlanie reakcji pod wiadomością */}
        {reactions.length > 0 && (
          <div className={`flex flex-wrap gap-1.5 mt-1.5 ${isOwn ? 'justify-end' : 'justify-start'}`}>
            {reactions.map(({ emoji, count, hasUserReacted }) => (
              <button
                key={emoji}
                onClick={() => onToggleReaction?.(message.id, emoji)}
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-all duration-200 ${
                  hasUserReacted
                    ? 'bg-gradient-to-r from-pink-100 to-orange-100 dark:from-pink-900/40 dark:to-orange-900/40 border border-pink-300/50 dark:border-pink-700/50 shadow-sm'
                    : 'bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 hover:scale-105'
                }`}
              >
                <span className="text-sm">{emoji}</span>
                <span className={`font-medium ${hasUserReacted ? 'text-pink-600 dark:text-pink-400' : 'text-gray-600 dark:text-gray-400'}`}>
                  {count}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className={`flex items-center gap-1.5 mt-1.5 ${isOwn ? 'flex-row-reverse' : ''}`}>
          <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">
            {formatMessageTime(message.created_at)}
          </span>
          {message.edited_at && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500 italic">
              (edytowano)
            </span>
          )}
          {/* Wskaźnik przypięcia */}
          {isPinned && (
            <Pin size={10} className="text-yellow-500 fill-yellow-500" />
          )}
          {/* Status przeczytania - tylko dla własnych wiadomości */}
          {isOwn && (
            <span className="flex items-center" title={isRead ? `Przeczytane${readBy.length > 0 ? ` przez ${readBy.map(r => r.user_email).join(', ')}` : ''}` : 'Wysłane'}>
              {isRead ? (
                <CheckCheck size={14} className="text-blue-500" />
              ) : (
                <Check size={14} className="text-gray-400" />
              )}
            </span>
          )}
        </div>
      </div>

      {showAvatar && isOwn && <div className="w-8 flex-shrink-0" />}
    </div>
  );
}
