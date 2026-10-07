import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical, Edit2, Trash2, Check, X, FileText, Image, Table, File, Download, CheckCheck, Reply, Smile, Forward, Pin, Copy, Plus, Eye } from 'lucide-react';
import UserAvatar from './UserAvatar';
import { formatMessageTime, formatFileSize, isImageFile, getFileIcon } from '../utils/messageHelpers';
import { REACTION_EMOJIS } from '../hooks/useReactions';
import AudioPlayer from './AudioPlayer';
import EmojiPicker from './EmojiPicker';
import PollCard from './PollCard';
import PrayerCard from './PrayerCard';
import EventCard from './EventCard';
import { tr } from '../../../i18n';
import { confirmDialog } from '../../../lib/dialog';
import { isVoiceAttachment, voiceDurationMs, previewText, mentionsUser, attachmentsOf } from '../utils/chatLogic';
import { toast } from '../../../lib/toast';

// Podświetl @wzmianki w tekście (w moim — ciemnym — dymku jasno, żeby było czytelne)
function renderTextWithMentions(text, isOwn = false) {
  if (!text) return null;
  const parts = text.split(/(@[\p{L}0-9._-]+)/u);
  return parts.map((part, i) => {
    if (part.startsWith('@') && part.length > 1) {
      return (
        <span key={i} className={isOwn
          ? 'font-semibold text-white underline decoration-white/40 underline-offset-2'
          : 'font-semibold text-accent-primary dark:text-accent-primary-light bg-accent-primary-lightest/60 dark:bg-accent-primary-darkest/30 rounded px-0.5'}>
          {part}
        </span>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

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
  deliveryStatus = null,          // 'sent' | 'delivered' | 'read'
  allMessages = [],
  currentUserEmail = null,
  // Bogate typy wiadomości
  pollResults = null,
  prayerState = null,
  onVote,
  onTogglePraying,
  // Kanały ogłoszeń
  showReadCount = false,
  readCount = 0
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showFullEmoji, setShowFullEmoji] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [copied, setCopied] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const menuRef = useRef(null);
  const reactionRef = useRef(null);
  const touchStart = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false);
      if (reactionRef.current && !reactionRef.current.contains(e.target)) {
        setShowReactionPicker(false);
        setShowFullEmoji(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const messageType = message.message_type || 'text';
  const isRich = messageType === 'poll' || messageType === 'prayer' || messageType === 'event';
  const mentionedMe = mentionsUser(message, currentUserEmail);
  const attachments = attachmentsOf(message); // API bywa zwraca {} zamiast []

  const handleCopy = async () => {
    setShowMenu(false);
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(tr('Nie udało się skopiować tekstu.'));
    }
  };
  // Edycja zamyka się dopiero po udanym zapisie (błąd pokazuje wątek, tekst zostaje w polu).
  const handleSaveEdit = async () => {
    const next = editContent.trim();
    setShowMenu(false);
    if (!next || next === message.content) { setIsEditing(false); return; }
    setSavingEdit(true);
    try {
      await onEdit?.(message.id, next);
      setIsEditing(false);
    } catch { /* komunikat już pokazany */ } finally {
      setSavingEdit(false);
    }
  };
  const handleCancelEdit = () => { setEditContent(message.content); setIsEditing(false); };
  const handleDelete = async () => {
    setShowMenu(false);
    const ok = await confirmDialog({
      title: tr('Usunąć wiadomość?'),
      message: tr('Wiadomość zniknie z rozmowy u wszystkich uczestników.'),
      confirmLabel: tr('Usuń wiadomość'),
      danger: true,
    });
    if (!ok) return;
    try { await onDelete?.(message.id); } catch { /* komunikat już pokazany */ }
  };
  const handleReply = () => { onReply?.(message); setShowMenu(false); };
  const handleForward = () => { onForward?.(message); setShowMenu(false); };
  const handleTogglePin = () => { onTogglePin?.(message.id); setShowMenu(false); };

  // Swipe-to-reply (mobile)
  const onTouchStart = (e) => { touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchMove = (e) => {
    if (!touchStart.current) return;
    const dx = e.touches[0].clientX - touchStart.current.x;
    const dy = e.touches[0].clientY - touchStart.current.y;
    if (Math.abs(dx) > Math.abs(dy) && dx > 0) {
      setSwipeX(Math.min(dx, 80));
    }
  };
  const onTouchEnd = () => {
    if (swipeX > 55) onReply?.(message);
    setSwipeX(0);
    touchStart.current = null;
  };

  const replyToMessage = message.reply_to_id ? allMessages.find(m => m.id === message.reply_to_id) : null;

  const renderAttachment = (attachment, idx) => {
    const iconMap = { 'image': Image, 'file-text': FileText, 'table': Table, 'file': File };
    const IconComponent = iconMap[getFileIcon(attachment.type)] || File;

    if (isVoiceAttachment(attachment)) {
      const ms = voiceDurationMs(attachment);
      return <AudioPlayer key={idx} url={attachment.url} duration={ms ? ms / 1000 : undefined} isOwn={isOwn} />;
    }
    if (isImageFile(attachment.type)) {
      return (
        <a key={idx} href={attachment.url} target="_blank" rel="noopener noreferrer" className="block group/img relative overflow-hidden rounded-xl">
          <img src={attachment.url} alt={attachment.name} className="max-w-xs max-h-48 rounded-xl object-cover transition-all duration-300 group-hover/img:scale-105" />
        </a>
      );
    }
    return (
      <a key={idx} href={attachment.url} target="_blank" rel="noopener noreferrer"
        className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-200 group/file ${isOwn ? 'bg-white/10 hover:bg-white/20 backdrop-blur-sm' : 'bg-gray-100 dark:bg-gray-700/50 hover:bg-gray-200 dark:hover:bg-gray-600/50'}`}>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isOwn ? 'bg-white/20' : 'bg-gradient-to-br from-accent-primary-light/20 to-accent-secondary-light/20'}`}>
          <IconComponent size={20} className={isOwn ? 'text-white' : 'text-accent-primary-light'} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{attachment.name}</p>
          <p className="text-xs opacity-70">{formatFileSize(attachment.size)}</p>
        </div>
        <div className={`p-2 rounded-lg transition-all duration-200 ${isOwn ? 'bg-white/10 group-hover/file:bg-white/20' : 'bg-gray-200/50 dark:bg-gray-600/50'}`}>
          <Download size={16} className="opacity-70 group-hover/file:opacity-100" />
        </div>
      </a>
    );
  };

  // Wiadomość systemowa – wyśrodkowana pastylka
  if (messageType === 'system') {
    return (
      <div className="flex justify-center my-2">
        <span className="px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-xs text-gray-500 dark:text-gray-400">
          {message.content}
        </span>
      </div>
    );
  }

  const quickReactions = REACTION_EMOJIS;

  return (
    <div className={`relative flex gap-2 ${isOwn ? 'flex-row-reverse' : ''} group`}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {/* Wskaźnik swipe-to-reply */}
      {swipeX > 0 && (
        <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center" style={{ opacity: Math.min(swipeX / 55, 1) }}>
          <Reply size={18} className="text-accent-primary" />
        </div>
      )}

      {!isOwn && (
        showAvatar
          ? <UserAvatar user={message.sender} size="sm" className="flex-shrink-0 mt-1" showStatus={!!senderStatus} status={senderStatus} />
          : <div className="w-8 flex-shrink-0" />
      )}

      <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} max-w-[85%] sm:max-w-[70%]`}
        style={{ transform: swipeX ? `translateX(${swipeX}px)` : undefined, transition: swipeX ? 'none' : 'transform 0.2s' }}>
        {!isOwn && showAvatar && (
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5 ml-1">
            {message.sender?.full_name || message.sender_email}
          </span>
        )}

        <div className="relative">
          {isEditing ? (
            <div className="flex flex-col gap-2">
              <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} aria-label={tr('Treść wiadomości')}
                onKeyDown={(e) => { if (e.key === 'Escape') handleCancelEdit(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); } }}
                className="w-full min-w-[200px] px-4 py-3 rounded-xl border border-gray-200/50 dark:border-gray-700/50 bg-white/90 dark:bg-gray-800/90 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-primary-light/50 resize-none shadow-lg" rows={2} autoFocus />
              <div className="flex gap-1.5 justify-end">
                <button type="button" onClick={handleCancelEdit} disabled={savingEdit} aria-label={tr('Anuluj edycję')} title={tr('Anuluj edycję')} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"><X size={16} /></button>
                <button type="button" onClick={handleSaveEdit} disabled={savingEdit} aria-label={tr('Zapisz zmiany')} title={tr('Zapisz zmiany')} className="p-2 rounded-xl bg-gradient-to-r from-accent-primary-light to-accent-secondary-light text-white shadow-lg disabled:opacity-60"><Check size={16} /></button>
              </div>
            </div>
          ) : isRich ? (
            // Bogate typy: karta bez kolorowego dymka
            <div className={mentionedMe ? 'ring-2 ring-accent-primary-light/50 rounded-2xl' : ''}>
              {messageType === 'poll' && <PollCard message={message} results={pollResults} onVote={onVote} />}
              {messageType === 'prayer' && <PrayerCard message={message} prayer={prayerState} onTogglePraying={onTogglePraying} />}
              {messageType === 'event' && <EventCard message={message} />}
            </div>
          ) : (
            <>
              <div className={`px-4 py-2.5 rounded-2xl transition-all duration-200 ${
                // Jak w aplikacji: moje — słód z białym tekstem, cudze — biała karta na papierze.
                isOwn
                  ? 'bg-gray-800 dark:bg-gray-700 text-white rounded-br-md shadow-sm'
                  : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-md shadow-sm border border-gray-100 dark:border-gray-700/50'
                } ${isPinned ? 'ring-2 ring-yellow-400/50 ring-offset-2 ring-offset-white dark:ring-offset-gray-900' : ''} ${mentionedMe && !isOwn ? 'ring-2 ring-accent-primary-light/50' : ''}`}>
                {message.forwarded_from && (
                  <div className={`flex items-center gap-1.5 mb-2 text-xs ${isOwn ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'}`}>
                    <Forward size={12} className="opacity-70" />
                    <span className="italic">{tr('Przekazana wiadomość')}</span>
                  </div>
                )}

                {replyToMessage && (
                  <div onClick={() => onScrollToMessage?.(replyToMessage.id)}
                    className={`mb-2.5 p-2.5 rounded-xl cursor-pointer transition-all duration-200 ${isOwn ? 'bg-white/10 hover:bg-white/15' : 'bg-gradient-to-r from-accent-primary-lightest to-accent-secondary-lightest dark:from-accent-primary-darkest/20 dark:to-accent-secondary-darkest/20'}`}>
                    <p className={`text-xs font-semibold mb-0.5 ${isOwn ? 'text-white/90' : 'text-accent-primary dark:text-accent-primary-light'}`}>
                      <Reply size={10} className="inline mr-1" />
                      {replyToMessage.sender?.full_name || replyToMessage.sender_email}
                    </p>
                    <p className={`text-xs line-clamp-2 ${isOwn ? 'text-white/70' : 'text-gray-600 dark:text-gray-400'}`}>
                      {previewText(replyToMessage, tr)}
                    </p>
                  </div>
                )}

                {message.content && (
                  <p className="whitespace-pre-wrap break-words">{renderTextWithMentions(message.content, isOwn)}</p>
                )}

                {attachments.length > 0 && (
                  <div className={`${message.content ? 'mt-2' : ''} space-y-2`}>
                    {attachments.map((att, idx) => renderAttachment(att, idx))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Menu i reakcje – tylko poza edycją */}
          {!isEditing && (
            <>
              <button type="button" onClick={() => setShowMenu(!showMenu)}
                aria-label={tr('Więcej działań')} title={tr('Więcej działań')} aria-expanded={showMenu}
                className={`absolute top-1/2 -translate-y-1/2 p-1.5 rounded-xl opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm hover:bg-white dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-all duration-200 shadow-sm ${isOwn ? '-left-9' : '-right-9'}`}>
                <MoreVertical size={14} />
              </button>

              {showMenu && (
                <div ref={menuRef} className={`absolute top-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl shadow-xl py-1.5 z-10 min-w-[140px] ${isOwn ? '-left-36' : '-right-36'}`}>
                  <button onClick={handleReply} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/30 transition"><Reply size={14} className="text-gray-400" />{tr('Odpowiedz')}</button>
                  {!isRich && <button onClick={handleForward} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/30 transition"><Forward size={14} className="text-gray-400" />{tr('Przekaż')}</button>}
                  {!isRich && message.content && <button onClick={handleCopy} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/30 transition">{copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} className="text-gray-400" />}{copied ? tr('Skopiowano!') : tr('Kopiuj')}</button>}
                  {canPin && (
                    <button onClick={handleTogglePin} className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm transition ${isPinned ? 'text-yellow-600 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-900/30' : 'text-gray-700 dark:text-gray-300 hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/30'}`}>
                      <Pin size={14} className={isPinned ? 'fill-current text-yellow-500' : 'text-gray-400'} />{isPinned ? tr('Odepnij') : tr('Przypnij')}
                    </button>
                  )}
                  {onToggleReaction && (
                    <button onClick={() => { setShowMenu(false); setShowReactionPicker(true); setShowFullEmoji(false); }} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/30 transition"><Smile size={14} className="text-gray-400" />{tr('Zareaguj')}</button>
                  )}
                  {isOwn && (onEdit || onDelete) && <div className="my-1 border-t border-gray-200/50 dark:border-gray-700/50" />}
                  {isOwn && onEdit && !isRich && message.content && (
                    <button onClick={() => { setIsEditing(true); setShowMenu(false); }} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/30 transition"><Edit2 size={14} className="text-gray-400" />{tr('Edytuj')}</button>
                  )}
                  {isOwn && onDelete && (
                    <button onClick={handleDelete} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition"><Trash2 size={14} />{tr('Usuń')}</button>
                  )}
                </div>
              )}

              {/* Przycisk reakcji */}
              <button type="button" onClick={() => { setShowReactionPicker(!showReactionPicker); setShowFullEmoji(false); }}
                aria-label={tr('Dodaj reakcję')} title={tr('Dodaj reakcję')}
                className={`absolute top-1/2 -translate-y-1/2 p-1.5 rounded-xl opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:hidden bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm hover:bg-white dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-accent-primary-light transition-all duration-200 shadow-sm ${isOwn ? '-left-[4.5rem]' : '-right-[4.5rem]'}`}>
                <Smile size={14} />
              </button>

              {showReactionPicker && (
                <div ref={reactionRef} className={`absolute bottom-full mb-2 z-20 ${isOwn ? 'right-0' : 'left-0'}`}>
                  {showFullEmoji ? (
                    <EmojiPicker onSelect={(emoji) => { onToggleReaction?.(message.id, emoji); setShowReactionPicker(false); setShowFullEmoji(false); }} onClose={() => setShowFullEmoji(false)} />
                  ) : (
                    <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-2xl shadow-xl px-2 py-2 flex gap-0.5 items-center">
                      {quickReactions.map(emoji => (
                        <button key={emoji} type="button" aria-label={tr('Reakcja {emoji}', { emoji })} onClick={() => { onToggleReaction?.(message.id, emoji); setShowReactionPicker(false); }}
                          className="text-xl hover:scale-125 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all duration-200 p-1.5">{emoji}</button>
                      ))}
                      <button type="button" onClick={() => setShowFullEmoji(true)} title={tr('Więcej')} aria-label={tr('Więcej emoji')}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-all"><Plus size={16} /></button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Reakcje pod wiadomością */}
        {reactions.length > 0 && (
          <div className={`flex flex-wrap gap-1.5 mt-1.5 ${isOwn ? 'justify-end' : 'justify-start'}`}>
            {reactions.map(({ emoji, count, hasUserReacted }) => (
              <button key={emoji} onClick={() => onToggleReaction?.(message.id, emoji)}
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-all duration-200 ${hasUserReacted ? 'bg-gradient-to-r from-accent-primary-lighter to-accent-secondary-lighter dark:from-accent-primary-darkest/40 dark:to-accent-secondary-darkest/40 border border-accent-primary-light/50' : 'bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                <span className="text-sm">{emoji}</span>
                <span className={`font-medium ${hasUserReacted ? 'text-accent-primary dark:text-accent-primary-light' : 'text-gray-600 dark:text-gray-400'}`}>{count}</span>
              </button>
            ))}
          </div>
        )}

        <div className={`flex items-center gap-1.5 mt-1.5 ${isOwn ? 'flex-row-reverse' : ''}`}>
          <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">{formatMessageTime(message.created_at)}</span>
          {message.edited_at && <span className="text-[10px] text-gray-400 dark:text-gray-500 italic">{tr('(edytowano)')}</span>}
          {isPinned && <Pin size={10} className="text-yellow-500 fill-yellow-500" />}

          {/* Licznik zapoznań (kanały ogłoszeń) */}
          {showReadCount && isOwn && (
            <span className="flex items-center gap-0.5 text-[10px] text-gray-400 dark:text-gray-500" title={tr('Liczba osób, które przeczytały')}>
              <Eye size={11} /> {readCount}
            </span>
          )}

          {/* Ptaszki doręczenia */}
          {isOwn && !showReadCount && (
            (() => {
              const status = deliveryStatus || (isRead ? 'read' : 'sent');
              if (status === 'read') return <CheckCheck size={14} className="text-blue-500" title={tr('Przeczytane')} />;
              if (status === 'delivered') return <CheckCheck size={14} className="text-gray-400" title={tr('Doręczone')} />;
              return <Check size={14} className="text-gray-400" title={tr('Wysłane')} />;
            })()
          )}
        </div>
      </div>

      {showAvatar && isOwn && <div className="w-8 flex-shrink-0" />}
    </div>
  );
}
