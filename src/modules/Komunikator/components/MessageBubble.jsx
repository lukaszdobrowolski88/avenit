import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical, Edit2, Trash2, Check, X, FileText, Image, Table, File, Download, CheckCheck, Reply, Smile, Forward, Pin, Copy, Plus, Eye, Languages, Flag, Ban, Loader } from 'lucide-react';
import UserAvatar from './UserAvatar';
import { formatMessageTime, formatFileSize, isImageFile, getFileIcon } from '../utils/messageHelpers';
import { REACTION_EMOJIS } from '../hooks/useReactions';
import EmojiPicker from './EmojiPicker';
import PollCard from './PollCard';
import PrayerCard from './PrayerCard';
import EventCard from './EventCard';
import MessageText from './MessageText';
import LinkPreviewCard from './LinkPreviewCard';
import { SignedImage, SignedLink, SignedAudio } from './SignedAttachment';
import { tr, useI18n } from '../../../i18n';
import { confirmDialog } from '../../../lib/dialog';
import { isVoiceAttachment, voiceDurationMs, previewText, mentionsMe, attachmentsOf } from '../utils/chatLogic';
import { firstLink } from '../utils/linkify';
import { translateMessage, cachedTranslation, languageName } from '../utils/translate';
import { toast } from '../../../lib/toast';

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
  replyToMessage: replyToProp,    // cytowana wiadomość (także spoza wczytanej części)
  currentUserEmail = null,
  // Bogate typy wiadomości
  pollResults = null,
  prayerState = null,
  onVote,
  onTogglePraying,
  nameOf,
  // Kanały ogłoszeń: „Przeczytało N z M” (K6)
  showReadCount = false,
  readCount = 0,
  readTotal = null,
  // Grupy/kanały: „Widziane przez N” (K6)
  seenCount = 0,
  onShowSeenBy,
  // Zgłoś / zablokuj (K10)
  onReport,
  onBlockSender,
  hiddenAsBlocked = false
}) {
  const { lang } = useI18n();
  const [showMenu, setShowMenu] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showFullEmoji, setShowFullEmoji] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [copied, setCopied] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const [revealed, setRevealed] = useState(false);
  // Tłumaczenie (K3): { text, source_lang } + przełącznik „Pokaż oryginał”.
  const [translation, setTranslation] = useState(() => cachedTranslation(message.id, lang));
  const [showOriginal, setShowOriginal] = useState(false);
  const [translating, setTranslating] = useState(false);
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

  // Edycja treści unieważnia tłumaczenie.
  useEffect(() => { setTranslation(cachedTranslation(message.id, lang)); setShowOriginal(false); }, [message.content, message.id, lang]);

  const messageType = message.message_type || 'text';
  const isRich = messageType === 'poll' || messageType === 'prayer' || messageType === 'event';
  const mentionedMe = mentionsMe(message, currentUserEmail);
  const attachments = attachmentsOf(message); // API bywa zwraca {} zamiast []
  const previewUrl = !isRich && message.content ? firstLink(message.content) : null;
  const canTranslate = !isRich && !isOwn && !!message.content && message.content.trim().length > 1;
  const showTranslated = !!translation?.text && !showOriginal;
  const shownText = showTranslated ? translation.text : message.content;

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

  // „Przetłumacz” na język interfejsu.
  const handleTranslate = async () => {
    setShowMenu(false);
    if (translation?.text) { setShowOriginal(false); return; }
    setTranslating(true);
    try {
      const res = await translateMessage(message.id, lang);
      if (res.same) {
        toast.info(tr('Ta wiadomość jest już w Twoim języku.'));
        return;
      }
      setTranslation(res);
      setShowOriginal(false);
    } catch (err) {
      toast.error(err?.friendly || err, { fallback: tr('Nie udało się przetłumaczyć wiadomości. Spróbuj ponownie.') });
    } finally {
      setTranslating(false);
    }
  };

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

  const replyToMessage = replyToProp !== undefined
    ? replyToProp
    : (message.reply_to_id ? allMessages.find(m => m.id === message.reply_to_id) : null);

  const renderAttachment = (attachment, idx) => {
    const iconMap = { 'image': Image, 'file-text': FileText, 'table': Table, 'file': File };
    const IconComponent = iconMap[getFileIcon(attachment.type)] || File;

    if (isVoiceAttachment(attachment)) {
      const ms = voiceDurationMs(attachment);
      return <SignedAudio key={idx} url={attachment.url} duration={ms ? ms / 1000 : undefined} isOwn={isOwn} />;
    }
    if (isImageFile(attachment.type)) {
      return (
        <SignedLink key={idx} url={attachment.url} className="block group/img relative overflow-hidden rounded-xl" aria-label={attachment.name || tr('Zdjęcie')}>
          <SignedImage url={attachment.url} alt={attachment.name} className="max-w-xs max-h-48 rounded-xl object-cover transition-all duration-300 group-hover/img:scale-105" placeholderClassName="w-48 h-32 rounded-xl" />
        </SignedLink>
      );
    }
    return (
      <SignedLink key={idx} url={attachment.url}
        className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-200 group/file ${isOwn ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-100 dark:bg-gray-700/50 hover:bg-gray-200 dark:hover:bg-gray-600/50'}`}>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isOwn ? 'bg-white/20' : 'bg-white dark:bg-gray-800'}`}>
          <IconComponent size={20} className={isOwn ? 'text-white' : 'text-gray-600 dark:text-gray-300'} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{attachment.name}</p>
          <p className="text-xs opacity-70">{formatFileSize(attachment.size)}</p>
        </div>
        <div className={`p-2 rounded-lg transition-all duration-200 ${isOwn ? 'bg-white/10 group-hover/file:bg-white/20' : 'bg-gray-200/50 dark:bg-gray-600/50'}`}>
          <Download size={16} className="opacity-70 group-hover/file:opacity-100" />
        </div>
      </SignedLink>
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

  // Wiadomość od zablokowanej osoby (K10) — schowana, z możliwością podejrzenia.
  if (hiddenAsBlocked && !revealed) {
    return (
      <div className="flex gap-2">
        <div className="w-8 flex-shrink-0" />
        <div className="px-3 py-2 rounded-2xl bg-gray-100 dark:bg-gray-800 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <Ban size={12} aria-hidden="true" />
          <span>{tr('Wiadomość od zablokowanej osoby')}</span>
          <button type="button" onClick={() => setRevealed(true)} className="font-semibold text-gray-700 dark:text-gray-200 hover:underline">
            {tr('pokaż')}
          </button>
        </div>
      </div>
    );
  }

  const quickReactions = REACTION_EMOJIS;
  const menuItem = 'flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/30 transition';
  const status = deliveryStatus || (isRead ? 'read' : 'sent');

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
                <button type="button" onClick={handleSaveEdit} disabled={savingEdit} aria-label={tr('Zapisz zmiany')} title={tr('Zapisz zmiany')} className="p-2 rounded-xl bg-accent-primary text-white shadow-lg disabled:opacity-60"><Check size={16} /></button>
              </div>
            </div>
          ) : isRich ? (
            // Bogate typy: karta bez kolorowego dymka
            <div className={mentionedMe ? 'ring-2 ring-accent-primary-light/50 rounded-2xl' : ''}>
              {messageType === 'poll' && <PollCard message={message} results={pollResults} onVote={onVote} nameOf={nameOf} />}
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
                } ${isPinned ? 'ring-2 ring-yellow-400/50 ring-offset-2 ring-offset-white dark:ring-offset-gray-900' : ''} ${mentionedMe ? 'ring-2 ring-accent-primary-light/50' : ''}`}>
                {message.forwarded_from && (
                  <div className={`flex items-center gap-1.5 mb-2 text-xs ${isOwn ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'}`}>
                    <Forward size={12} className="opacity-70" />
                    <span className="italic">{tr('Przekazana wiadomość')}</span>
                  </div>
                )}

                {message.reply_to_id && (
                  <button type="button" onClick={() => onScrollToMessage?.(message.reply_to_id, replyToMessage?.created_at || null)}
                    className={`block w-full text-left mb-2.5 p-2.5 rounded-xl cursor-pointer transition-all duration-200 ${isOwn ? 'bg-white/10 hover:bg-white/15' : 'bg-gray-50 dark:bg-gray-700/40 hover:bg-gray-100 dark:hover:bg-gray-700/60'}`}>
                    <p className={`text-xs font-semibold mb-0.5 ${isOwn ? 'text-white/90' : 'text-gray-800 dark:text-gray-100'}`}>
                      <Reply size={10} className="inline mr-1" />
                      {replyToMessage ? (replyToMessage.sender?.full_name || replyToMessage.sender_email) : tr('Odpowiedź na wcześniejszą wiadomość')}
                    </p>
                    {replyToMessage && (
                      <p className={`text-xs line-clamp-2 ${isOwn ? 'text-white/70' : 'text-gray-600 dark:text-gray-400'}`}>
                        {replyToMessage.deleted_at ? tr('(wiadomość usunięta)') : previewText(replyToMessage, tr)}
                      </p>
                    )}
                  </button>
                )}

                {shownText && (
                  <p className="whitespace-pre-wrap break-words"><MessageText text={shownText} isOwn={isOwn} /></p>
                )}

                {(translating || translation?.text) && (
                  <div className={`mt-1.5 flex items-center gap-1.5 text-[11px] ${isOwn ? 'text-white/60' : 'text-gray-400 dark:text-gray-500'}`}>
                    {translating ? (
                      <><Loader size={11} className="animate-spin" /> {tr('Tłumaczenie…')}</>
                    ) : (
                      <>
                        <Languages size={11} aria-hidden="true" />
                        <span>{showTranslated
                          ? (translation.source_lang ? tr('Przetłumaczono z: {lang}', { lang: languageName(translation.source_lang) }) : tr('Przetłumaczono'))
                          : tr('Oryginał')}</span>
                        <button type="button" onClick={() => setShowOriginal(v => !v)} className="font-semibold underline underline-offset-2">
                          {showTranslated ? tr('Pokaż oryginał') : tr('Pokaż tłumaczenie')}
                        </button>
                      </>
                    )}
                  </div>
                )}

                {previewUrl && <LinkPreviewCard url={previewUrl} isOwn={isOwn} />}

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
                <div ref={menuRef} role="menu" className={`absolute top-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl shadow-xl py-1.5 z-10 min-w-[170px] ${isOwn ? '-left-44' : '-right-44'}`}>
                  {onReply && <button type="button" role="menuitem" onClick={handleReply} className={menuItem}><Reply size={14} className="text-gray-400" />{tr('Odpowiedz')}</button>}
                  {!isRich && <button type="button" role="menuitem" onClick={handleForward} className={menuItem}><Forward size={14} className="text-gray-400" />{tr('Przekaż')}</button>}
                  {!isRich && message.content && <button type="button" role="menuitem" onClick={handleCopy} className={menuItem}>{copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} className="text-gray-400" />}{copied ? tr('Skopiowano!') : tr('Kopiuj')}</button>}
                  {canTranslate && (
                    <button type="button" role="menuitem" onClick={handleTranslate} disabled={translating} className={menuItem}>
                      <Languages size={14} className="text-gray-400" />{translation?.text && showOriginal ? tr('Pokaż tłumaczenie') : tr('Przetłumacz')}
                    </button>
                  )}
                  {canPin && (
                    <button type="button" role="menuitem" onClick={handleTogglePin} className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm transition ${isPinned ? 'text-yellow-700 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-900/30' : 'text-gray-700 dark:text-gray-300 hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/30'}`}>
                      <Pin size={14} className={isPinned ? 'fill-current text-yellow-500' : 'text-gray-400'} />{isPinned ? tr('Odepnij') : tr('Przypnij')}
                    </button>
                  )}
                  {onToggleReaction && (
                    <button type="button" role="menuitem" onClick={() => { setShowMenu(false); setShowReactionPicker(true); setShowFullEmoji(false); }} className={menuItem}><Smile size={14} className="text-gray-400" />{tr('Zareaguj')}</button>
                  )}
                  {isOwn && onShowSeenBy && (
                    <button type="button" role="menuitem" onClick={() => { setShowMenu(false); onShowSeenBy(message); }} className={menuItem}><Eye size={14} className="text-gray-400" />{tr('Widziane przez')}</button>
                  )}
                  {!isOwn && (onReport || onBlockSender) && <div className="my-1 border-t border-gray-200/50 dark:border-gray-700/50" />}
                  {!isOwn && onReport && (
                    <button type="button" role="menuitem" onClick={() => { setShowMenu(false); onReport(message); }} className={menuItem}><Flag size={14} className="text-gray-400" />{tr('Zgłoś')}</button>
                  )}
                  {!isOwn && onBlockSender && (
                    <button type="button" role="menuitem" onClick={() => { setShowMenu(false); onBlockSender(message); }} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition"><Ban size={14} />{tr('Zablokuj osobę')}</button>
                  )}
                  {isOwn && (onEdit || onDelete) && <div className="my-1 border-t border-gray-200/50 dark:border-gray-700/50" />}
                  {isOwn && onEdit && !isRich && message.content && (
                    <button type="button" role="menuitem" onClick={() => { setIsEditing(true); setShowMenu(false); }} className={menuItem}><Edit2 size={14} className="text-gray-400" />{tr('Edytuj')}</button>
                  )}
                  {isOwn && onDelete && (
                    <button type="button" role="menuitem" onClick={handleDelete} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition"><Trash2 size={14} />{tr('Usuń')}</button>
                  )}
                </div>
              )}

              {/* Przycisk reakcji */}
              <button type="button" onClick={() => { setShowReactionPicker(!showReactionPicker); setShowFullEmoji(false); }}
                aria-label={tr('Dodaj reakcję')} title={tr('Dodaj reakcję')}
                className={`absolute top-1/2 -translate-y-1/2 p-1.5 rounded-xl opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:hidden bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm hover:bg-white dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-accent-primary transition-all duration-200 shadow-sm ${isOwn ? '-left-[4.5rem]' : '-right-[4.5rem]'}`}>
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
              <button type="button" key={emoji} onClick={() => onToggleReaction?.(message.id, emoji)}
                aria-pressed={!!hasUserReacted}
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-all duration-200 ${hasUserReacted ? 'bg-accent-primary-lighter dark:bg-accent-primary-darkest/40 border border-accent-primary-light/50' : 'bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                <span className="text-sm">{emoji}</span>
                <span className={`font-medium ${hasUserReacted ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>{count}</span>
              </button>
            ))}
          </div>
        )}

        <div className={`flex items-center gap-1.5 mt-1.5 ${isOwn ? 'flex-row-reverse' : ''}`}>
          <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">{formatMessageTime(message.created_at)}</span>
          {message.edited_at && <span className="text-[10px] text-gray-400 dark:text-gray-500 italic">{tr('(edytowano)')}</span>}
          {isPinned && <Pin size={10} className="text-yellow-500 fill-yellow-500" />}

          {/* Kanał ogłoszeń: „Przeczytało N z M” (K6) */}
          {showReadCount && isOwn && (
            <button type="button" onClick={() => onShowSeenBy?.(message)} disabled={!onShowSeenBy}
              className="flex items-center gap-0.5 text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:underline"
              title={tr('Kto przeczytał')}>
              <Eye size={11} aria-hidden="true" />
              {readTotal != null ? tr('Przeczytało {n} z {m}', { n: readCount, m: readTotal }) : readCount}
            </button>
          )}

          {/* Ptaszki: ✓ wysłane, ✓✓ doręczone, ✓✓ w kolorze — przeczytali wszyscy (K6) */}
          {isOwn && !showReadCount && (
            status === 'read'
              ? <CheckCheck size={14} className="text-accent-primary-dark dark:text-accent-primary-light" aria-label={tr('Przeczytane')} />
              : status === 'delivered'
                ? <CheckCheck size={14} className="text-gray-400" aria-label={tr('Doręczone')} />
                : <Check size={14} className="text-gray-400" aria-label={tr('Wysłane')} />
          )}

          {/* Grupy i kanały: „Widziane przez N” */}
          {isOwn && !showReadCount && seenCount > 0 && onShowSeenBy && (
            <button type="button" onClick={() => onShowSeenBy(message)} className="text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:underline">
              {tr('Widziane przez {n}', { n: seenCount })}
            </button>
          )}
        </div>
      </div>

      {showAvatar && isOwn && <div className="w-8 flex-shrink-0" />}
    </div>
  );
}
