import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Send, Paperclip, Trash2, Save, FileText, Loader2,
  Bold, Italic, Underline, Strikethrough, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, Link2, Image, Quote,
  Code, Heading1, Heading2, Heading3, Undo, Redo, Type,
  Palette, ChevronDown, Eye, Edit3, Maximize2, Minimize2
} from 'lucide-react';

// Kolory do wyboru
const TEXT_COLORS = [
  '#000000', '#374151', '#6b7280', '#ef4444', '#f97316', '#f59e0b',
  '#22c55e', '#14b8a6', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899'
];

export default function ComposeModal({
  isOpen,
  onClose,
  draft,
  templates,
  signature,
  onUpdateDraft,
  onSend,
  onSaveDraft,
  onUploadAttachment,
  onRemoveAttachment,
  onAddSignature,
  onSelectTemplate,
  sending
}) {
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [toInput, setToInput] = useState('');
  const [ccInput, setCcInput] = useState('');
  const [bccInput, setBccInput] = useState('');
  const [viewMode, setViewMode] = useState('edit'); // 'edit' | 'preview' | 'html'
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [editorInitialized, setEditorInitialized] = useState(false);
  const fileInputRef = useRef(null);
  const editorRef = useRef(null);
  const imageInputRef = useRef(null);

  // Zamknij CC/BCC jeśli puste
  useEffect(() => {
    if (draft.cc?.length > 0) setShowCc(true);
    if (draft.bcc?.length > 0) setShowBcc(true);
  }, [draft.cc, draft.bcc]);

  // Inicjalizuj edytor tylko raz przy otwarciu lub zmianie trybu
  useEffect(() => {
    if (isOpen && editorRef.current && viewMode === 'edit') {
      // Zawsze synchronizuj HTML przy wejściu w tryb edycji
      if (!editorInitialized || editorRef.current.innerHTML !== draft.body_html) {
        editorRef.current.innerHTML = draft.body_html || '';
        lastExternalHtml.current = draft.body_html || '';
      }

      if (!editorInitialized) {
        setEditorInitialized(true);
        setTimeout(() => {
          if (editorRef.current) {
            editorRef.current.focus();
            // Ustaw kursor na końcu
            const range = document.createRange();
            const selection = window.getSelection();
            range.selectNodeContents(editorRef.current);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }, 100);
      }
    }
  }, [isOpen, viewMode, editorInitialized, draft.body_html]);

  // Reset editorInitialized przy zamknięciu
  useEffect(() => {
    if (!isOpen) {
      setEditorInitialized(false);
    }
  }, [isOpen]);

  // Synchronizuj z zewnętrznym draft.body_html tylko gdy zmienia się z zewnątrz (np. szablon)
  const lastExternalHtml = useRef(draft.body_html);
  useEffect(() => {
    if (editorRef.current && editorInitialized && draft.body_html !== lastExternalHtml.current) {
      // Sprawdź czy zmiana pochodzi z zewnątrz (szablon, podpis)
      if (editorRef.current.innerHTML !== draft.body_html) {
        editorRef.current.innerHTML = draft.body_html || '';
      }
      lastExternalHtml.current = draft.body_html;
    }
  }, [draft.body_html, editorInitialized]);

  // Dodaj email do listy
  const addEmail = (field, email) => {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) return;

    const currentList = draft[field] || [];
    if (!currentList.includes(trimmed)) {
      onUpdateDraft(field, [...currentList, trimmed]);
    }

    if (field === 'to') setToInput('');
    if (field === 'cc') setCcInput('');
    if (field === 'bcc') setBccInput('');
  };

  // Usuń email z listy
  const removeEmail = (field, email) => {
    const currentList = draft[field] || [];
    onUpdateDraft(field, currentList.filter(e => e !== email));
  };

  // Obsługa Enter w polach email
  const handleEmailKeyDown = (e, field, input) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addEmail(field, input);
    }
    if (e.key === 'Backspace' && !input && draft[field]?.length > 0) {
      const list = [...draft[field]];
      list.pop();
      onUpdateDraft(field, list);
    }
  };

  // Wykonaj komendę formatowania
  const execCommand = useCallback((command, value = null) => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      const newHtml = editorRef.current.innerHTML;
      lastExternalHtml.current = newHtml;
      onUpdateDraft('body_html', newHtml);
    }
  }, [onUpdateDraft]);

  // Wstaw link
  const insertLink = () => {
    const url = prompt('Podaj adres URL:', 'https://');
    if (url) {
      execCommand('createLink', url);
    }
  };

  // Wstaw obraz
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Dla uproszczenia - konwertuj na base64
    const reader = new FileReader();
    reader.onload = (event) => {
      execCommand('insertImage', event.target.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Upload pliku załącznika
  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    for (const file of files) {
      await onUploadAttachment(file);
    }
    e.target.value = '';
  };

  // Wyślij
  const handleSend = async () => {
    if (toInput.trim()) addEmail('to', toInput);
    if (ccInput.trim()) addEmail('cc', ccInput);
    if (bccInput.trim()) addEmail('bcc', bccInput);

    await onSend();
  };

  // Aktualizuj HTML z edytora
  const handleEditorInput = () => {
    if (editorRef.current) {
      const newHtml = editorRef.current.innerHTML;
      lastExternalHtml.current = newHtml;
      onUpdateDraft('body_html', newHtml);
    }
  };

  // Wstaw podpis
  const handleInsertSignature = () => {
    if (signature && editorRef.current) {
      const signatureHtml = `<br><br><div class="email-signature">${signature}</div>`;
      editorRef.current.innerHTML += signatureHtml;
      const newHtml = editorRef.current.innerHTML;
      lastExternalHtml.current = newHtml;
      onUpdateDraft('body_html', newHtml);
    }
  };

  // Format rozmiaru
  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  if (!isOpen) return null;

  const content = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => {
          onSaveDraft();
          onClose();
        }}
      />

      {/* Modal */}
      <div
        className={`
          relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700
          flex flex-col overflow-hidden transition-all duration-300
          ${isFullscreen
            ? 'w-full h-full max-w-none max-h-none rounded-none'
            : 'w-full max-w-4xl h-[85vh] max-h-[900px]'
          }
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-pink-500 to-rose-500">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-xl">
              <Edit3 size={20} className="text-white" />
            </div>
            <h2 className="text-lg font-bold text-white">
              {draft.subject || 'Nowa wiadomość'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title={isFullscreen ? 'Zmniejsz' : 'Pełny ekran'}
            >
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            <button
              onClick={() => {
                onSaveDraft();
                onClose();
              }}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Pola adresowe */}
        <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          {/* Do */}
          <div className="flex items-center px-6 py-3 border-b border-gray-100 dark:border-gray-800">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400 w-16">Do:</span>
            <div className="flex-1 flex flex-wrap items-center gap-2">
              {draft.to?.map(email => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 text-sm rounded-full"
                >
                  {email}
                  <button onClick={() => removeEmail('to', email)} className="hover:text-pink-900 ml-1">
                    <X size={14} />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={toInput}
                onChange={(e) => setToInput(e.target.value)}
                onKeyDown={(e) => handleEmailKeyDown(e, 'to', toInput)}
                onBlur={() => toInput && addEmail('to', toInput)}
                placeholder={draft.to?.length ? '' : 'Wpisz adres email...'}
                className="flex-1 min-w-[200px] bg-transparent text-sm outline-none text-gray-900 dark:text-white placeholder-gray-400"
              />
            </div>
            <div className="flex gap-3 text-sm">
              {!showCc && (
                <button onClick={() => setShowCc(true)} className="text-gray-500 hover:text-pink-500 font-medium">CC</button>
              )}
              {!showBcc && (
                <button onClick={() => setShowBcc(true)} className="text-gray-500 hover:text-pink-500 font-medium">BCC</button>
              )}
            </div>
          </div>

          {/* CC */}
          {showCc && (
            <div className="flex items-center px-6 py-3 border-b border-gray-100 dark:border-gray-800">
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400 w-16">CC:</span>
              <div className="flex-1 flex flex-wrap items-center gap-2">
                {draft.cc?.map(email => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-full"
                  >
                    {email}
                    <button onClick={() => removeEmail('cc', email)}><X size={14} /></button>
                  </span>
                ))}
                <input
                  type="text"
                  value={ccInput}
                  onChange={(e) => setCcInput(e.target.value)}
                  onKeyDown={(e) => handleEmailKeyDown(e, 'cc', ccInput)}
                  onBlur={() => ccInput && addEmail('cc', ccInput)}
                  placeholder="Dodaj odbiorców CC..."
                  className="flex-1 min-w-[200px] bg-transparent text-sm outline-none text-gray-900 dark:text-white placeholder-gray-400"
                />
              </div>
              <button onClick={() => setShowCc(false)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>
          )}

          {/* BCC */}
          {showBcc && (
            <div className="flex items-center px-6 py-3 border-b border-gray-100 dark:border-gray-800">
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400 w-16">BCC:</span>
              <div className="flex-1 flex flex-wrap items-center gap-2">
                {draft.bcc?.map(email => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-full"
                  >
                    {email}
                    <button onClick={() => removeEmail('bcc', email)}><X size={14} /></button>
                  </span>
                ))}
                <input
                  type="text"
                  value={bccInput}
                  onChange={(e) => setBccInput(e.target.value)}
                  onKeyDown={(e) => handleEmailKeyDown(e, 'bcc', bccInput)}
                  onBlur={() => bccInput && addEmail('bcc', bccInput)}
                  placeholder="Dodaj odbiorców BCC..."
                  className="flex-1 min-w-[200px] bg-transparent text-sm outline-none text-gray-900 dark:text-white placeholder-gray-400"
                />
              </div>
              <button onClick={() => setShowBcc(false)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>
          )}

          {/* Temat */}
          <div className="flex items-center px-6 py-3">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400 w-16">Temat:</span>
            <input
              type="text"
              value={draft.subject || ''}
              onChange={(e) => onUpdateDraft('subject', e.target.value)}
              placeholder="Wpisz temat wiadomości..."
              className="flex-1 bg-transparent text-sm outline-none text-gray-900 dark:text-white font-medium placeholder-gray-400"
            />
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex-wrap">
          {/* Tryb widoku */}
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 mr-2">
            <button
              onClick={() => setViewMode('edit')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'edit'
                  ? 'bg-white dark:bg-gray-700 text-pink-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Edit3 size={14} />
            </button>
            <button
              onClick={() => setViewMode('preview')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'preview'
                  ? 'bg-white dark:bg-gray-700 text-pink-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Eye size={14} />
            </button>
            <button
              onClick={() => setViewMode('html')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'html'
                  ? 'bg-white dark:bg-gray-700 text-pink-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Code size={14} />
            </button>
          </div>

          <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1" />

          {/* Formatowanie tekstu */}
          <button
            onClick={() => execCommand('bold')}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Pogrubienie (Ctrl+B)"
          >
            <Bold size={16} />
          </button>
          <button
            onClick={() => execCommand('italic')}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Kursywa (Ctrl+I)"
          >
            <Italic size={16} />
          </button>
          <button
            onClick={() => execCommand('underline')}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Podkreślenie (Ctrl+U)"
          >
            <Underline size={16} />
          </button>
          <button
            onClick={() => execCommand('strikeThrough')}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Przekreślenie"
          >
            <Strikethrough size={16} />
          </button>

          <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1" />

          {/* Nagłówki */}
          <button
            onClick={() => execCommand('formatBlock', 'h1')}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Nagłówek 1"
          >
            <Heading1 size={16} />
          </button>
          <button
            onClick={() => execCommand('formatBlock', 'h2')}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Nagłówek 2"
          >
            <Heading2 size={16} />
          </button>
          <button
            onClick={() => execCommand('formatBlock', 'h3')}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Nagłówek 3"
          >
            <Heading3 size={16} />
          </button>
          <button
            onClick={() => execCommand('formatBlock', 'p')}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Paragraf"
          >
            <Type size={16} />
          </button>

          <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1" />

          {/* Listy */}
          <button
            onClick={() => execCommand('insertUnorderedList')}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Lista punktowana"
          >
            <List size={16} />
          </button>
          <button
            onClick={() => execCommand('insertOrderedList')}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Lista numerowana"
          >
            <ListOrdered size={16} />
          </button>

          <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1" />

          {/* Wyrównanie */}
          <button
            onClick={() => execCommand('justifyLeft')}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Wyrównaj do lewej"
          >
            <AlignLeft size={16} />
          </button>
          <button
            onClick={() => execCommand('justifyCenter')}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Wyrównaj do środka"
          >
            <AlignCenter size={16} />
          </button>
          <button
            onClick={() => execCommand('justifyRight')}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Wyrównaj do prawej"
          >
            <AlignRight size={16} />
          </button>

          <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1" />

          {/* Link i obraz */}
          <button
            onClick={insertLink}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Wstaw link"
          >
            <Link2 size={16} />
          </button>
          <button
            onClick={() => imageInputRef.current?.click()}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Wstaw obraz"
          >
            <Image size={16} />
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />

          {/* Cytat */}
          <button
            onClick={() => execCommand('formatBlock', 'blockquote')}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Cytat"
          >
            <Quote size={16} />
          </button>

          <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1" />

          {/* Kolor tekstu */}
          <div className="relative">
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors flex items-center gap-1"
              title="Kolor tekstu"
            >
              <Palette size={16} />
              <ChevronDown size={12} />
            </button>
            {showColorPicker && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowColorPicker(false)} />
                <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-2">
                  <div className="grid grid-cols-6 gap-1">
                    {TEXT_COLORS.map(color => (
                      <button
                        key={color}
                        onClick={() => {
                          execCommand('foreColor', color);
                          setShowColorPicker(false);
                        }}
                        className="w-6 h-6 rounded-full border-2 border-white shadow-sm hover:scale-110 transition-transform"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1" />

          {/* Undo/Redo */}
          <button
            onClick={() => execCommand('undo')}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Cofnij (Ctrl+Z)"
          >
            <Undo size={16} />
          </button>
          <button
            onClick={() => execCommand('redo')}
            className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Ponów (Ctrl+Y)"
          >
            <Redo size={16} />
          </button>
        </div>

        {/* Edytor treści */}
        <div className="flex-1 overflow-hidden">
          {viewMode === 'edit' && (
            <div
              ref={editorRef}
              contentEditable
              onInput={handleEditorInput}
              className="w-full h-full p-6 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-base leading-relaxed outline-none overflow-y-auto prose prose-sm dark:prose-invert max-w-none"
              style={{ minHeight: '200px' }}
              data-placeholder="Napisz swoją wiadomość..."
              suppressContentEditableWarning
            />
          )}

          {viewMode === 'preview' && (
            <div className="w-full h-full p-6 bg-gray-50 dark:bg-gray-800/50 overflow-y-auto">
              <div className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 prose prose-sm dark:prose-invert max-w-none">
                {draft.body_html ? (
                  <div dangerouslySetInnerHTML={{ __html: draft.body_html }} />
                ) : (
                  <p className="text-gray-400 italic">Brak treści do podglądu</p>
                )}
              </div>
            </div>
          )}

          {viewMode === 'html' && (
            <textarea
              value={draft.body_html || ''}
              onChange={(e) => onUpdateDraft('body_html', e.target.value)}
              className="w-full h-full p-6 bg-gray-900 text-green-400 font-mono text-sm outline-none resize-none"
              placeholder="<p>Wpisz kod HTML...</p>"
            />
          )}
        </div>

        {/* Załączniki */}
        {draft.attachments?.length > 0 && (
          <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex items-center gap-2 mb-2">
              <Paperclip size={14} className="text-gray-500" />
              <span className="text-xs font-medium text-gray-500">Załączniki ({draft.attachments.length})</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {draft.attachments.map(att => (
                <div
                  key={att.id}
                  className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
                >
                  <Paperclip size={14} className="text-gray-400" />
                  <span className="text-sm text-gray-700 dark:text-gray-300 max-w-[150px] truncate">
                    {att.filename}
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatSize(att.file_size)}
                  </span>
                  <button
                    onClick={() => onRemoveAttachment(att.id)}
                    className="text-gray-400 hover:text-red-500 ml-1"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <button
            onClick={handleSend}
            disabled={sending || !draft.to?.length}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-pink-500/25"
          >
            {sending ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Send size={18} />
            )}
            <span>Wyślij wiadomość</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2.5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors"
            title="Dodaj załącznik"
          >
            <Paperclip size={18} />
            <span className="hidden sm:inline text-sm font-medium">Załącznik</span>
          </button>

          {/* Szablony */}
          {templates?.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowTemplates(!showTemplates)}
                className="flex items-center gap-2 px-4 py-2.5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors"
                title="Szablony"
              >
                <FileText size={18} />
                <span className="hidden sm:inline text-sm font-medium">Szablon</span>
              </button>
              {showTemplates && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowTemplates(false)} />
                  <div className="absolute bottom-full left-0 mb-2 z-50 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-2 min-w-[200px]">
                    {templates.map(template => (
                      <button
                        key={template.id}
                        onClick={() => {
                          onSelectTemplate(template);
                          setShowTemplates(false);
                        }}
                        className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <FileText size={16} />
                        <span>{template.name}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Podpis */}
          {signature && (
            <button
              onClick={handleInsertSignature}
              className="flex items-center gap-2 px-4 py-2.5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors"
              title="Wstaw podpis"
            >
              <FileText size={18} />
              <span className="hidden sm:inline text-sm font-medium">Podpis</span>
            </button>
          )}

          <div className="flex-1" />

          <button
            onClick={() => {
              onSaveDraft();
              onClose();
            }}
            className="flex items-center gap-2 px-4 py-2.5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors"
          >
            <Save size={18} />
            <span className="hidden sm:inline text-sm font-medium">Zapisz szkic</span>
          </button>

          <button
            onClick={() => {
              if (confirm('Czy na pewno usunąć tę wiadomość?')) {
                onClose();
              }
            }}
            className="p-2.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
            title="Usuń wiadomość"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {/* Style dla edytora */}
      <style>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
        [contenteditable] blockquote {
          border-left: 3px solid #ec4899;
          padding-left: 1rem;
          margin-left: 0;
          color: #6b7280;
          font-style: italic;
        }
        [contenteditable] a {
          color: #ec4899;
          text-decoration: underline;
        }
        [contenteditable] img {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
        }
        [contenteditable] h1, [contenteditable] h2, [contenteditable] h3 {
          color: #111827;
          font-weight: 700;
        }
        .dark [contenteditable] h1, .dark [contenteditable] h2, .dark [contenteditable] h3 {
          color: #f3f4f6;
        }
      `}</style>
    </div>
  );

  return createPortal(content, document.body);
}
