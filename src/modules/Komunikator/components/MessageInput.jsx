import React, { useState, useRef, forwardRef, useImperativeHandle, useEffect } from 'react';
import { Send, Paperclip, X, Image, FileText, Loader, Reply, Mic } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatFileSize, isImageFile } from '../utils/messageHelpers';
import AudioRecorder from './AudioRecorder';

const MessageInput = forwardRef(function MessageInput({ onSend, onTyping, disabled = false, placeholder = 'Napisz wiadomość...', replyingTo = null, onCancelReply }, ref) {
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  // Wysłanie wiadomości głosowej
  const handleSendVoiceMessage = async (audioBlob, duration) => {
    try {
      setUploading(true);

      // Określ rozszerzenie na podstawie MIME type
      const mimeType = audioBlob.type || 'audio/webm';
      const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const fileName = `voice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${extension}`;
      const filePath = `voice-messages/${fileName}`;

      // Upload do storage
      const { error: uploadError } = await supabase.storage
        .from('messenger-attachments')
        .upload(filePath, audioBlob, {
          contentType: mimeType
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: urlData } = supabase.storage
        .from('messenger-attachments')
        .getPublicUrl(filePath);

      // Wyślij jako wiadomość z załącznikiem audio
      const voiceAttachment = {
        url: urlData.publicUrl,
        name: 'Wiadomość głosowa',
        type: mimeType,
        size: audioBlob.size,
        duration: duration,
        isVoiceMessage: true
      };

      await onSend('', [voiceAttachment], replyingTo?.id || null);
      setIsRecordingVoice(false);
    } catch (err) {
      console.error('Error sending voice message:', err);
      throw err;
    } finally {
      setUploading(false);
    }
  };

  // Funkcja do uploadu plików (używana przez handleFileSelect i addFilesFromDrop)
  const uploadFiles = async (files) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    // Limit 10 plików
    if (attachments.length + fileArray.length > 10) {
      alert('Maksymalnie 10 załączników na wiadomość');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const uploadedFiles = [];
      const totalFiles = fileArray.length;

      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];

        // Limit 10MB
        if (file.size > 10 * 1024 * 1024) {
          alert(`Plik "${file.name}" przekracza limit 10MB`);
          continue;
        }

        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
        const filePath = `attachments/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('messenger-attachments')
          .upload(filePath, file);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          continue;
        }

        const { data: urlData } = supabase.storage
          .from('messenger-attachments')
          .getPublicUrl(filePath);

        uploadedFiles.push({
          url: urlData.publicUrl,
          name: file.name,
          type: file.type,
          size: file.size
        });

        setUploadProgress(Math.round(((i + 1) / totalFiles) * 100));
      }

      setAttachments(prev => [...prev, ...uploadedFiles]);
    } catch (err) {
      console.error('Error uploading files:', err);
      alert('Błąd podczas przesyłania plików');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // Expose addFilesFromDrop method via ref for drag & drop
  useImperativeHandle(ref, () => ({
    addFilesFromDrop: (files) => {
      uploadFiles(files);
    }
  }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if ((!content.trim() && attachments.length === 0) || disabled || uploading) return;

    try {
      await onSend(content.trim(), attachments, replyingTo?.id || null);
      setContent('');
      setAttachments([]);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  // Focus textarea when replying
  useEffect(() => {
    if (replyingTo && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [replyingTo]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleFileSelect = async (e) => {
    await uploadFiles(e.target.files);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleTextareaChange = (e) => {
    setContent(e.target.value);
    // Auto-resize - zaczynamy od 44px (h-11), rośnie do max 150px
    e.target.style.height = '44px';
    e.target.style.height = Math.min(Math.max(e.target.scrollHeight, 44), 150) + 'px';
    // Wyślij status pisania
    if (e.target.value.trim()) {
      onTyping?.();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border-t border-gray-200/50 dark:border-gray-700/50 p-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
      {/* Pasek odpowiedzi */}
      {replyingTo && (
        <div className="flex items-center gap-3 mb-3 p-3 bg-gradient-to-r from-pink-50 to-orange-50 dark:from-pink-900/20 dark:to-orange-900/20 rounded-xl border-l-4 border-pink-500">
          <Reply size={18} className="text-pink-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-pink-600 dark:text-pink-400">
              Odpowiadasz na wiadomość od {replyingTo.sender?.full_name || replyingTo.sender_email}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
              {replyingTo.content || (replyingTo.attachments?.length > 0 ? '📎 Załącznik' : '')}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="p-1.5 hover:bg-white/50 dark:hover:bg-gray-800/50 rounded-lg transition-all duration-200"
          >
            <X size={16} className="text-gray-500" />
          </button>
        </div>
      )}

      {/* Podgląd załączników */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {attachments.map((att, idx) => (
            <div
              key={idx}
              className="relative group flex items-center gap-2 px-3 py-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-200/50 dark:border-gray-700/50"
            >
              {isImageFile(att.type) ? (
                <img src={att.url} alt={att.name} className="w-10 h-10 object-cover rounded-lg" />
              ) : (
                <div className="w-10 h-10 bg-gradient-to-br from-pink-100 to-orange-100 dark:from-pink-900/30 dark:to-orange-900/30 rounded-lg flex items-center justify-center">
                  <FileText size={18} className="text-pink-500" />
                </div>
              )}
              <div className="max-w-[120px]">
                <p className="text-xs font-medium truncate text-gray-700 dark:text-gray-300">{att.name}</p>
                <p className="text-[10px] text-gray-500">{formatFileSize(att.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => removeAttachment(idx)}
                className="absolute -top-1.5 -right-1.5 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-sm"
              >
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
            <Loader size={16} className="animate-spin text-pink-500" />
            <span>Przesyłanie... {uploadProgress}%</span>
          </div>
          <div className="mt-2 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-pink-500 to-orange-500 transition-all duration-300 rounded-full"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Tryb nagrywania głosowego */}
      {isRecordingVoice ? (
        <AudioRecorder
          onSend={handleSendVoiceMessage}
          onCancel={() => setIsRecordingVoice(false)}
          disabled={disabled || uploading}
        />
      ) : (
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Przycisk załącznika */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || disabled}
            className="w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center text-gray-500 hover:text-pink-600 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-all duration-200 disabled:opacity-50 flex-shrink-0"
          >
            <Paperclip size={18} className="sm:w-5 sm:h-5" />
          </button>

          {/* Przycisk mikrofonu */}
          <button
            type="button"
            onClick={() => setIsRecordingVoice(true)}
            disabled={uploading || disabled}
            className="w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center text-gray-500 hover:text-pink-600 bg-gray-100 dark:bg-gray-800 hover:bg-pink-50 dark:hover:bg-pink-900/20 rounded-xl transition-all duration-200 disabled:opacity-50 flex-shrink-0"
            title="Nagraj wiadomość głosową"
          >
            <Mic size={18} className="sm:w-5 sm:h-5" />
          </button>

          {/* Pole tekstowe */}
          <div className="flex-1 relative min-w-0">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled || uploading}
              rows={1}
              className="w-full px-3 sm:px-4 py-2 h-9 sm:h-11 bg-gray-100 dark:bg-gray-800 border border-gray-200/50 dark:border-gray-700/50 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500/50 text-gray-900 dark:text-gray-100 placeholder-gray-500 disabled:opacity-50 transition-all duration-200 leading-5 sm:leading-6 text-sm sm:text-base"
              style={{ maxHeight: '150px' }}
            />
          </div>

          {/* Przycisk wyślij */}
          <button
            type="submit"
            disabled={(!content.trim() && attachments.length === 0) || disabled || uploading}
            className="w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 text-white rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-pink-500/30 hover:shadow-pink-500/40 flex-shrink-0"
          >
            <Send size={16} className="sm:w-[18px] sm:h-[18px]" />
          </button>
        </div>
      )}
    </form>
  );
});

export default MessageInput;
