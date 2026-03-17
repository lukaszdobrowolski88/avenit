import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft, Star, Reply, ReplyAll, Forward, Trash2,
  Archive, FolderInput, Tag, MoreVertical, Paperclip,
  Download, ExternalLink, ChevronDown, ChevronUp, Mail
} from 'lucide-react';

// Komponent do renderowania HTML emaila w iframe - zapewnia izolację i poprawne renderowanie
function EmailHtmlContent({ html, messageId }) {
  const iframeRef = useRef(null);
  const [height, setHeight] = useState(300);

  const updateIframeContent = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe || !html) return;

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;

    // Styl dla zawartości emaila
    const styles = `
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          font-size: 14px;
          line-height: 1.6;
          color: #374151;
          margin: 0;
          padding: 0;
          background: transparent;
        }
        img { max-width: 100%; height: auto; }
        a { color: #ec4899; }
        blockquote {
          border-left: 2px solid #e5e7eb;
          padding-left: 1rem;
          margin-left: 0;
          color: #6b7280;
        }
        table { max-width: 100%; }
        * { box-sizing: border-box; }
      </style>
    `;

    const content = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          ${styles}
        </head>
        <body>${html}</body>
      </html>
    `;

    doc.open();
    doc.write(content);
    doc.close();

    // Poczekaj na załadowanie i dostosuj wysokość
    const adjustHeight = () => {
      try {
        const body = doc.body;
        const docElement = doc.documentElement;
        if (body && docElement) {
          const newHeight = Math.max(
            body.scrollHeight,
            body.offsetHeight,
            docElement.scrollHeight,
            docElement.offsetHeight
          );
          if (newHeight > 0) {
            setHeight(newHeight + 20);
          }
        }
      } catch (e) {
        console.error('Error adjusting iframe height:', e);
      }
    };

    // Dostosuj po załadowaniu obrazów
    const images = doc.getElementsByTagName('img');
    let loadedImages = 0;
    const totalImages = images.length;

    if (totalImages === 0) {
      setTimeout(adjustHeight, 50);
    } else {
      for (const img of images) {
        if (img.complete) {
          loadedImages++;
          if (loadedImages === totalImages) adjustHeight();
        } else {
          img.onload = () => {
            loadedImages++;
            if (loadedImages === totalImages) adjustHeight();
          };
          img.onerror = () => {
            loadedImages++;
            if (loadedImages === totalImages) adjustHeight();
          };
        }
      }
    }

    // Natychmiastowe dostosowanie dla tekstu
    adjustHeight();
  }, [html]);

  useEffect(() => {
    updateIframeContent();
  }, [updateIframeContent, messageId]);

  return (
    <iframe
      ref={iframeRef}
      title="Email content"
      sandbox="allow-same-origin"
      style={{
        width: '100%',
        height: `${height}px`,
        border: 'none',
        overflow: 'hidden',
        background: 'transparent'
      }}
    />
  );
}

export default function MessageView({
  message,
  folders,
  labels,
  onBack,
  onReply,
  onReplyAll,
  onForward,
  onToggleStar,
  onMoveToFolder,
  onDelete,
  onToggleLabel,
  onDownloadAttachment,
  loading
}) {
  const [showAllHeaders, setShowAllHeaders] = useState(false);
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [showLabelMenu, setShowLabelMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Zamknij menu po kliknięciu poza
  useEffect(() => {
    const handleClick = () => {
      setShowMoveMenu(false);
      setShowLabelMenu(false);
      setShowMoreMenu(false);
    };
    if (showMoveMenu || showLabelMenu || showMoreMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [showMoveMenu, showLabelMenu, showMoreMenu]);

  // Format daty
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleString('pl-PL', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Format rozmiaru pliku
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Ikona dla typu pliku
  const getFileIcon = (mimeType) => {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType === 'application/pdf') return '📄';
    if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '📽️';
    if (mimeType.startsWith('video/')) return '🎬';
    if (mimeType.startsWith('audio/')) return '🎵';
    if (mimeType.includes('zip') || mimeType.includes('archive')) return '📦';
    return '📎';
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400">
        <div className="w-8 h-8 border-3 border-pink-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p>Ładowanie wiadomości...</p>
      </div>
    );
  }

  if (!message) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400">
        <Mail size={48} className="mb-4 opacity-30" />
        <p>Wybierz wiadomość do podglądu</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        {onBack && (
          <button
            onClick={onBack}
            className="lg:hidden p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
        )}

        <button
          onClick={() => onReply(message)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          <Reply size={16} />
          <span className="hidden sm:inline">Odpowiedz</span>
        </button>

        <button
          onClick={() => onReplyAll(message)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          <ReplyAll size={16} />
          <span className="hidden sm:inline">Odpowiedz wszystkim</span>
        </button>

        <button
          onClick={() => onForward(message)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          <Forward size={16} />
          <span className="hidden sm:inline">Przekaż</span>
        </button>

        <div className="flex-1" />

        <button
          onClick={() => onToggleStar(message.id)}
          className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          <Star
            size={18}
            className={message.is_starred ? 'text-yellow-400 fill-yellow-400' : 'text-gray-400'}
          />
        </button>

        {/* Przenieś */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMoveMenu(!showMoveMenu);
            }}
            className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="Przenieś"
          >
            <FolderInput size={18} />
          </button>
          {showMoveMenu && (
            <div className="absolute top-full right-0 mt-1 z-50 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[160px]">
              {folders.map(folder => (
                <button
                  key={folder.id}
                  onClick={() => {
                    onMoveToFolder(message.id, folder.id);
                    setShowMoveMenu(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <span>{folder.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Etykiety */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowLabelMenu(!showLabelMenu);
            }}
            className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="Etykiety"
          >
            <Tag size={18} />
          </button>
          {showLabelMenu && labels.length > 0 && (
            <div className="absolute top-full right-0 mt-1 z-50 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[160px]">
              {labels.map(label => {
                const hasLabel = message.labels?.some(l => l.id === label.id);
                return (
                  <button
                    key={label.id}
                    onClick={() => {
                      onToggleLabel(message.id, label.id);
                      setShowLabelMenu(false);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <span
                      className={`w-3 h-3 rounded-full border-2 ${hasLabel ? '' : 'opacity-30'}`}
                      style={{ backgroundColor: hasLabel ? label.color : 'transparent', borderColor: label.color }}
                    />
                    <span>{label.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button
          onClick={() => onDelete(message.id)}
          className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          title="Usuń"
        >
          <Trash2 size={18} />
        </button>
      </div>

      {/* Treść wiadomości */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Nagłówek */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
            {message.subject || '(brak tematu)'}
          </h1>

          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white font-bold flex-shrink-0">
              {(message.from_name || message.from_email)?.[0]?.toUpperCase() || '?'}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-gray-900 dark:text-white">
                  {message.from_name || message.from_email}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  &lt;{message.from_email}&gt;
                </span>
              </div>

              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                <span>do: {message.to_emails?.join(', ') || '—'}</span>
                {message.cc_emails?.length > 0 && (
                  <span className="ml-2">CC: {message.cc_emails.join(', ')}</span>
                )}
              </div>

              <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {formatDate(message.received_at)}
              </div>

              {/* Etykiety */}
              {message.labels && message.labels.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {message.labels.map(label => (
                    <span
                      key={label.id}
                      className="px-2 py-0.5 text-xs font-medium rounded-full"
                      style={{
                        backgroundColor: `${label.color}20`,
                        color: label.color
                      }}
                    >
                      {label.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Załączniki */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <Paperclip size={16} className="text-gray-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Załączniki ({message.attachments.length})
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {message.attachments.map(attachment => (
                <div
                  key={attachment.id}
                  className="flex items-center gap-3 p-3 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
                >
                  <span className="text-2xl">{getFileIcon(attachment.mime_type)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                      {attachment.filename}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {formatFileSize(attachment.file_size)}
                    </p>
                  </div>
                  <button
                    onClick={() => onDownloadAttachment(attachment)}
                    className="p-2 text-gray-500 hover:text-pink-500 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
                    title="Pobierz"
                  >
                    <Download size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Treść HTML - używamy iframe dla izolacji i poprawnego renderowania */}
        <div className="prose prose-sm dark:prose-invert max-w-none">
          {message.body_html ? (
            <EmailHtmlContent html={message.body_html} messageId={message.id} />
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-gray-700 dark:text-gray-300">
              {message.body_text || 'Brak treści'}
            </pre>
          )}
        </div>
      </div>

      {/* Quick reply bar */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <button
          onClick={() => onReply(message)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
        >
          <Reply size={16} />
          <span>Kliknij, aby odpowiedzieć</span>
        </button>
      </div>
    </div>
  );
}
