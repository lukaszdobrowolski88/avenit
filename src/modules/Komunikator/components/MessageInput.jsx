import React, { useState, useRef, forwardRef, useImperativeHandle, useEffect } from 'react';
import { Send, Paperclip, X, FileText, Loader, Reply, Mic, Plus, BarChart3, Calendar, Lock, Smile, HeartHandshake } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatFileSize, isImageFile } from '../utils/messageHelpers';
import AudioRecorder from './AudioRecorder';
import EmojiPicker from './EmojiPicker';
import { useT } from '../../../i18n';
import { tr } from '../../../i18n';
import { toast } from '../../../lib/toast';
import { previewText, sameEmail } from '../utils/chatLogic';

const DRAFT_PREFIX = 'komunikator_draft_';

const MessageInput = forwardRef(function MessageInput({
  onSend,
  onTyping,
  disabled = false,
  placeholder = tr('Napisz wiadomość...'),
  replyingTo = null,
  onCancelReply,
  conversationId = null,
  participants = [],
  currentUserEmail = null,
  canPost = true,
  onOpenPoll,
  onOpenEventShare
}, ref) {
  const t = useT();
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [composerMode, setComposerMode] = useState('text'); // 'text' | 'prayer'
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [mention, setMention] = useState({ open: false, query: '', start: 0 });
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const attachMenuRef = useRef(null);
  const mentionMapRef = useRef(new Map()); // fullName -> email
  const sendingRef = useRef(false); // strażnik podwójnego Entera / kliknięcia
  const [sending, setSending] = useState(false);

  // Wczytaj wersję roboczą (draft) przy zmianie konwersacji
  useEffect(() => {
    if (!conversationId) return;
    try {
      const draft = localStorage.getItem(`${DRAFT_PREFIX}${conversationId}`);
      setContent(draft || '');
    } catch { setContent(''); }
    setComposerMode('text');
    setShowAttachMenu(false);
    mentionMapRef.current.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Zapisz draft
  useEffect(() => {
    if (!conversationId) return;
    try {
      if (content) localStorage.setItem(`${DRAFT_PREFIX}${conversationId}`, content);
      else localStorage.removeItem(`${DRAFT_PREFIX}${conversationId}`);
    } catch { /* ignoruj */ }
  }, [content, conversationId]);

  // Zamknij menu załączników po kliknięciu poza
  useEffect(() => {
    const handler = (e) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target)) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const clearDraft = () => {
    if (conversationId) {
      try { localStorage.removeItem(`${DRAFT_PREFIX}${conversationId}`); } catch { /* ignoruj */ }
    }
  };

  // Rozwiąż wzmianki @ z treści na listę e-maili
  const resolveMentions = (text) => {
    const emails = [];
    mentionMapRef.current.forEach((email, name) => {
      if (text.includes(`@${name}`)) emails.push(email);
    });
    return [...new Set(emails)];
  };

  const handleSendVoiceMessage = async (audioBlob, duration) => {
    try {
      setUploading(true);
      const mimeType = audioBlob.type || 'audio/webm';
      const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const fileName = `voice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${extension}`;
      const filePath = `voice-messages/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('messenger-attachments')
        .upload(filePath, audioBlob, { contentType: mimeType });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('messenger-attachments').getPublicUrl(filePath);
      const voiceAttachment = {
        url: urlData.publicUrl,
        name: t('Wiadomość głosowa'),
        type: mimeType,
        size: audioBlob.size,
        duration,
        isVoiceMessage: true
      };
      await onSend('', [voiceAttachment], replyingTo?.id || null);
      setIsRecordingVoice(false);
    } catch (err) {
      // Błąd zapisu wiadomości pokazał już wątek (err.handled); błąd przesyłania pliku pokaże AudioRecorder.
      if (!err?.handled) console.error('Error sending voice message:', err);
      throw err;
    } finally {
      setUploading(false);
    }
  };

  const uploadFiles = async (files) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    if (attachments.length + fileArray.length > 10) {
      toast.error(t('Maksymalnie 10 załączników na wiadomość'));
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    try {
      const uploadedFiles = [];
      const failed = [];
      const totalFiles = fileArray.length;
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        if (file.size > 10 * 1024 * 1024) {
          toast.error(t('Plik „{name}” przekracza limit 10 MB', { name: file.name }));
          continue;
        }
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
        const filePath = `attachments/${fileName}`;
        const { error: uploadError } = await supabase.storage.from('messenger-attachments').upload(filePath, file);
        if (uploadError) { console.error('Upload error:', uploadError); failed.push(file.name); continue; }
        const { data: urlData } = supabase.storage.from('messenger-attachments').getPublicUrl(filePath);
        uploadedFiles.push({ url: urlData.publicUrl, name: file.name, type: file.type, size: file.size });
        setUploadProgress(Math.round(((i + 1) / totalFiles) * 100));
      }
      setAttachments(prev => [...prev, ...uploadedFiles]);
      if (failed.length) {
        toast.error(t('Nie udało się przesłać: {names}. Spróbuj ponownie.', { names: failed.join(', ') }));
      }
    } catch (err) {
      console.error('Error uploading files:', err);
      toast.error(t('Błąd podczas przesyłania plików'));
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  useImperativeHandle(ref, () => ({
    addFilesFromDrop: (files) => { uploadFiles(files); }
  }));

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if ((!content.trim() && attachments.length === 0) || disabled || uploading || sendingRef.current) return;

    sendingRef.current = true;
    setSending(true);
    try {
      if (composerMode === 'prayer') {
        // Prośba o modlitwę – treść pola staje się tytułem
        await onSend(content.trim(), [], null, {
          messageType: 'prayer',
          metadata: { title: content.trim() }
        });
        setComposerMode('text');
      } else {
        const mentions = resolveMentions(content);
        await onSend(content.trim(), attachments, replyingTo?.id || null, { mentions });
      }
      setContent('');
      setAttachments([]);
      clearDraft();
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    } catch (err) {
      // Komunikat pokazał wątek; treść i załączniki zostają, żeby można było spróbować ponownie.
      if (!err?.handled) toast.error(err, { fallback: t('Nie udało się wysłać wiadomości. Spróbuj ponownie.') });
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  useEffect(() => {
    if (replyingTo && textareaRef.current) textareaRef.current.focus();
  }, [replyingTo]);

  const handleKeyDown = (e) => {
    if (mention.open && e.key === 'Escape') { setMention({ open: false, query: '', start: 0 }); return; }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleFileSelect = async (e) => {
    await uploadFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index) => setAttachments(prev => prev.filter((_, i) => i !== index));

  // Wykryj wzmiankę @ w trakcie pisania
  const detectMention = (value, caret) => {
    const uptoCaret = value.slice(0, caret);
    const match = uptoCaret.match(/(?:^|\s)@([\p{L}0-9._-]*)$/u);
    if (match) {
      setMention({ open: true, query: match[1].toLowerCase(), start: caret - match[1].length });
    } else if (mention.open) {
      setMention({ open: false, query: '', start: 0 });
    }
  };

  const handleTextareaChange = (e) => {
    const value = e.target.value;
    setContent(value);
    e.target.style.height = '44px';
    e.target.style.height = Math.min(Math.max(e.target.scrollHeight, 44), 150) + 'px';
    if (value.trim()) onTyping?.();
    detectMention(value, e.target.selectionStart);
  };

  const insertMention = (user) => {
    const name = user.full_name || user.user_email?.split('@')[0] || '';
    mentionMapRef.current.set(name, user.user_email);
    // Zamień wpisywany fragment "@query" na "@name "
    const before = content.slice(0, mention.start - 1); // -1 aby usunąć '@'
    const after = content.slice(mention.start + mention.query.length);
    const next = `${before}@${name} ${after}`;
    setContent(next);
    setMention({ open: false, query: '', start: 0 });
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const insertEmoji = (emoji) => {
    setContent(prev => prev + emoji);
    setShowEmoji(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  // Lista podpowiedzi wzmianek
  const mentionCandidates = mention.open
    ? participants
        .filter(p => !sameEmail(p.user_email, currentUserEmail))
        .filter(p => {
          const name = (p.full_name || p.user_email || '').toLowerCase();
          return name.includes(mention.query);
        })
        .slice(0, 6)
    : [];

  // Kanał ogłoszeń – brak uprawnień do pisania
  if (!canPost) {
    return (
      <div className="border-t border-gray-200/50 dark:border-gray-700/50 p-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
        <div className="flex items-center justify-center gap-2 py-2 text-sm text-gray-500 dark:text-gray-400">
          <Lock size={16} />
          {tr('W tym kanale piszą tylko administratorzy.')}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="relative border-t border-gray-200/50 dark:border-gray-700/50 p-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
      {/* Banner trybu prośby o modlitwę */}
      {composerMode === 'prayer' && (
        <div className="flex items-center gap-2 mb-3 p-3 bg-gradient-to-r from-accent-primary-lightest to-accent-secondary-lightest dark:from-accent-primary-darkest/20 dark:to-accent-secondary-darkest/20 rounded-xl border border-accent-primary-lighter/60 dark:border-accent-primary-dark/40">
          <span className="text-lg">🙏</span>
          <p className="flex-1 text-xs font-semibold text-accent-primary dark:text-accent-primary-light">
            {tr('Prośba o modlitwę – wpisz treść i wyślij')}
          </p>
          <button type="button" onClick={() => setComposerMode('text')} aria-label={t('Anuluj prośbę o modlitwę')} title={t('Anuluj prośbę o modlitwę')} className="p-1.5 hover:bg-white/50 dark:hover:bg-gray-800/50 rounded-lg transition">
            <X size={16} className="text-gray-500" />
          </button>
        </div>
      )}

      {/* Pasek odpowiedzi */}
      {replyingTo && composerMode === 'text' && (
        <div className="flex items-center gap-3 mb-3 p-3 bg-gradient-to-r from-accent-primary-lightest to-accent-secondary-lightest dark:from-accent-primary-darkest/20 dark:to-accent-secondary-darkest/20 rounded-xl border border-accent-primary-lighter/60 dark:border-accent-primary-dark/40">
          <Reply size={18} className="text-accent-primary-light flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-accent-primary dark:text-accent-primary-light">
              {tr('Odpowiadasz na wiadomość od')} {replyingTo.sender?.full_name || replyingTo.sender_email}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
              {previewText(replyingTo, tr)}
            </p>
          </div>
          <button type="button" onClick={onCancelReply} aria-label={t('Anuluj odpowiedź')} title={t('Anuluj odpowiedź')} className="p-1.5 hover:bg-white/50 dark:hover:bg-gray-800/50 rounded-lg transition-all duration-200">
            <X size={16} className="text-gray-500" />
          </button>
        </div>
      )}

      {/* Podgląd załączników */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {attachments.map((att, idx) => (
            <div key={idx} className="relative group flex items-center gap-2 px-3 py-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-200/50 dark:border-gray-700/50">
              {isImageFile(att.type) ? (
                <img src={att.url} alt={att.name} className="w-10 h-10 object-cover rounded-lg" />
              ) : (
                <div className="w-10 h-10 bg-gradient-to-br from-accent-primary-lighter to-accent-secondary-lighter dark:from-accent-primary-darkest/30 dark:to-accent-secondary-darkest/30 rounded-lg flex items-center justify-center">
                  <FileText size={18} className="text-accent-primary-light" />
                </div>
              )}
              <div className="max-w-[120px]">
                <p className="text-xs font-medium truncate text-gray-700 dark:text-gray-300">{att.name}</p>
                <p className="text-[10px] text-gray-500">{formatFileSize(att.size)}</p>
              </div>
              <button type="button" onClick={() => removeAttachment(idx)} aria-label={t('Usuń załącznik {name}', { name: att.name })} title={t('Usuń załącznik')} className="absolute -top-1.5 -right-1.5 p-1 bg-red-500 text-white rounded-full opacity-100 lg:opacity-0 lg:group-hover:opacity-100 focus-visible:opacity-100 transition-all duration-200 shadow-sm">
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Pasek postępu uploadu */}
      {uploading && (
        <div className="mb-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Loader size={16} className="animate-spin text-accent-primary-light" />
            <span>{tr('Przesyłanie...')} {uploadProgress}%</span>
          </div>
          <div className="mt-2 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-accent-primary-light to-accent-secondary-light transition-all duration-300 rounded-full" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}

      {/* Popup wzmianek @ */}
      {mention.open && mentionCandidates.length > 0 && (
        <div className="absolute bottom-full left-4 right-4 mb-2 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-2xl shadow-xl py-1.5 z-30 max-h-56 overflow-y-auto custom-scrollbar">
          {mentionCandidates.map(p => (
            <button
              key={p.user_email}
              type="button"
              onClick={() => insertMention(p)}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/30 transition text-left"
            >
              <span className="w-7 h-7 rounded-full bg-gradient-to-br from-accent-primary-light to-accent-secondary-light text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                {(p.full_name || p.user_email)?.[0]?.toUpperCase()}
              </span>
              <span className="truncate">{p.full_name || p.user_email}</span>
            </button>
          ))}
        </div>
      )}

      {/* Emoji picker */}
      {showEmoji && (
        <div className="absolute bottom-full left-4 mb-2 z-30">
          <EmojiPicker onSelect={insertEmoji} onClose={() => setShowEmoji(false)} />
        </div>
      )}

      {/* Menu załączników (+) */}
      {showAttachMenu && (
        <div ref={attachMenuRef} className="absolute bottom-full left-4 mb-2 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-2xl shadow-xl py-1.5 z-30 min-w-[200px]">
          <button type="button" onClick={() => { setShowAttachMenu(false); fileInputRef.current?.click(); }} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition text-left">
            <Paperclip size={18} className="text-accent-primary-light" /> {tr('Zdjęcie lub plik')}
          </button>
          <button type="button" onClick={() => { setShowAttachMenu(false); onOpenPoll?.(); }} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition text-left">
            <BarChart3 size={18} className="text-accent-primary-light" /> {tr('Ankieta')}
          </button>
          <button type="button" onClick={() => { setShowAttachMenu(false); onOpenEventShare?.(); }} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition text-left">
            <Calendar size={18} className="text-accent-primary-light" /> {tr('Wydarzenie')}
          </button>
          <button type="button" onClick={() => { setShowAttachMenu(false); setComposerMode('prayer'); textareaRef.current?.focus(); }} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition text-left">
            <HeartHandshake size={18} className="text-accent-primary-light" /> {tr('Prośba o modlitwę')}
          </button>
        </div>
      )}

      {isRecordingVoice ? (
        <AudioRecorder onSend={handleSendVoiceMessage} onCancel={() => setIsRecordingVoice(false)} disabled={disabled || uploading} />
      ) : (
        <div className="flex items-end gap-1.5 sm:gap-2">
          <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={handleFileSelect} className="hidden" />

          {/* Przycisk menu załączników (+) */}
          <button
            type="button"
            onClick={() => { setShowAttachMenu(v => !v); setShowEmoji(false); }}
            disabled={uploading || disabled}
            className={`w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center rounded-xl transition-all duration-200 disabled:opacity-50 flex-shrink-0 ${showAttachMenu ? 'bg-accent-primary text-white rotate-45' : 'text-gray-500 hover:text-accent-primary bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
            title={t('Załącz')}
            aria-label={t('Załącz')}
            aria-expanded={showAttachMenu}
          >
            <Plus size={20} />
          </button>

          {/* Emoji */}
          <button
            type="button"
            onClick={() => { setShowEmoji(v => !v); setShowAttachMenu(false); }}
            disabled={uploading || disabled}
            className="hidden sm:flex w-11 h-11 items-center justify-center text-gray-500 hover:text-accent-primary bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-all duration-200 disabled:opacity-50 flex-shrink-0"
            title={t('Emoji')}
            aria-label={t('Wstaw emoji')}
          >
            <Smile size={20} />
          </button>

          {/* Mikrofon (tylko tryb tekstowy) */}
          {composerMode === 'text' && (
            <button
              type="button"
              onClick={() => setIsRecordingVoice(true)}
              disabled={uploading || disabled}
              className="w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center text-gray-500 hover:text-accent-primary bg-gray-100 dark:bg-gray-800 hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/20 rounded-xl transition-all duration-200 disabled:opacity-50 flex-shrink-0"
              title={t('Nagraj wiadomość głosową')}
              aria-label={t('Nagraj wiadomość głosową')}
            >
              <Mic size={18} className="sm:w-5 sm:h-5" />
            </button>
          )}

          <div className="flex-1 relative min-w-0">
            <textarea
              data-tour="komunikator-message"
              ref={textareaRef}
              value={content}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder={composerMode === 'prayer' ? t('Treść prośby o modlitwę...') : t(placeholder)}
              aria-label={composerMode === 'prayer' ? t('Treść prośby o modlitwę') : t('Treść wiadomości')}
              disabled={disabled || uploading}
              rows={1}
              className="w-full px-3 sm:px-4 py-2 h-9 sm:h-11 bg-gray-100 dark:bg-gray-800 border border-gray-200/50 dark:border-gray-700/50 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-accent-primary-light/50 focus:border-accent-primary-light/50 text-gray-900 dark:text-gray-100 placeholder-gray-500 disabled:opacity-50 transition-all duration-200 leading-5 sm:leading-6 text-sm sm:text-base"
              style={{ maxHeight: '150px' }}
            />
          </div>

          <button
            data-tour="komunikator-send"
            type="submit"
            disabled={(!content.trim() && attachments.length === 0) || disabled || uploading || sending}
            aria-label={t('Wyślij')}
            title={t('Wyślij')}
            className="w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center bg-gradient-to-r from-accent-primary-light to-accent-secondary-light hover:from-accent-primary hover:to-accent-secondary text-white rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-accent-primary-light/30 hover:shadow-accent-primary-light/40 flex-shrink-0"
          >
            <Send size={16} className="sm:w-[18px] sm:h-[18px]" />
          </button>
        </div>
      )}
    </form>
  );
});

export default MessageInput;
