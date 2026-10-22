import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Image, FileText, Download, ChevronLeft, ChevronRight, ZoomIn, Loader, Link2, Mic, Play, CornerDownRight, RefreshCw } from 'lucide-react';
import { formatMessageDate, formatFileSize } from '../utils/messageHelpers';
import { isSafeHttpUrl } from '../utils/linkify';
import { voiceDurationMs } from '../utils/chatLogic';
import { tr } from '../../../i18n';
import { toast } from '../../../lib/toast';
import Modal from '../../../components/Modal';
import EmptyState from '../../../components/EmptyState';
import Spinner from '../../../components/Spinner';
import Button from '../../../components/Button';
import { SignedImage, SignedLink, SignedAudio } from './SignedAttachment';
import CloudFileLink from '../../../components/cloud/CloudFileLink';
import { isCloudAttachment } from '@avenit/shared/src/lib/cloudFiles.js';
import useConversationFiles from '../hooks/useConversationFiles';

// Media, pliki, linki i głosówki rozmowy. Dane filtruje serwer (fn chat-media) — paczkami od
// najnowszych z „Wczytaj starsze”; zdjęcia, pliki i nagrania przez podpisane linki (K1).
// onJump(messageId, createdAt, threadRootId) — „Pokaż w rozmowie” (okno się zamyka, wątek przewija do
// wiadomości; odpowiedź w wątku — do wiadomości głównej z otwartym panelem wątku).
const TABS = [
  { key: 'media', label: 'Media', icon: Image },
  { key: 'files', label: 'Pliki', icon: FileText },
  { key: 'links', label: 'Linki', icon: Link2 },
  { key: 'voice', label: 'Głosowe', icon: Mic },
];
const isImage = (a) => String(a?.type || '').startsWith('image/');

export default function MediaGalleryModal({ isOpen, onClose, conversationId, onJump }) {
  const [activeTab, setActiveTab] = useState('media');
  const [selectedImageIndex, setSelectedImageIndex] = useState(null);
  const list = useConversationFiles(conversationId, activeTab, isOpen);
  const images = useMemo(() => (activeTab === 'media' ? list.items.filter((i) => isImage(i.attachment)) : []), [activeTab, list.items]);

  const closeLightbox = () => setSelectedImageIndex(null);
  const goToPrev = () => setSelectedImageIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  const goToNext = () => setSelectedImageIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));

  const handleLoadMore = async () => {
    try { await list.loadMore(); } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się wczytać starszych plików.') });
    }
  };
  const jump = (item) => {
    if (!onJump) return;
    onClose?.();
    onJump(item.message_id, item.created_at, item.thread_root_id || null);
  };

  if (!isOpen) return null;

  const tabClass = (active) => `flex-1 min-w-0 px-2 sm:px-3 py-2 text-sm font-medium rounded-xl transition-colors flex items-center justify-center gap-1.5 ${active
    ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-sm'
    : 'text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800'}`;

  const meta = (item, extra) => [extra, item.sender_name, formatMessageDate(item.created_at)].filter(Boolean).join(' • ');
  const jumpButton = (item) => onJump ? (
    <button type="button" onClick={() => jump(item)} title={tr('Pokaż w rozmowie')} aria-label={tr('Pokaż w rozmowie')}
      className="p-2 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition flex-shrink-0">
      <CornerDownRight size={16} />
    </button>
  ) : null;
  const rowClass = 'flex items-center gap-3 p-3 bg-white/80 dark:bg-gray-800/80 rounded-xl border border-gray-100 dark:border-gray-700/50';

  const loadMoreButton = list.hasMore ? (
    <div className="flex justify-center pt-4">
      <button
        type="button"
        onClick={handleLoadMore}
        disabled={list.loadingMore}
        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition disabled:opacity-60 flex items-center gap-2"
      >
        {list.loadingMore && <Loader size={14} className="animate-spin" />}
        {list.loadingMore ? tr('Ładowanie...') : tr('Wczytaj starsze')}
      </button>
    </div>
  ) : null;

  const empty = {
    media: [Image, tr('Brak zdjęć i filmów'), tr('Zdjęcia i filmy udostępnione w tej rozmowie pojawią się tutaj')],
    files: [FileText, tr('Brak plików'), tr('Pliki udostępnione w tej rozmowie pojawią się tutaj')],
    links: [Link2, tr('Brak linków'), tr('Linki z wiadomości w tej rozmowie pojawią się tutaj')],
    voice: [Mic, tr('Brak wiadomości głosowych'), tr('Nagrania z tej rozmowy pojawią się tutaj')],
  }[activeTab];

  const renderMedia = () => (
    <div className="grid grid-cols-3 gap-3">
      {list.items.map((item) => {
        const a = item.attachment || {};
        if (isImage(a)) {
          const idx = images.indexOf(item);
          return (
            <button
              type="button"
              key={item.key}
              onClick={() => setSelectedImageIndex(idx)}
              aria-label={tr('Powiększ zdjęcie {name}', { name: a.name || '' })}
              className="aspect-square rounded-xl overflow-hidden cursor-pointer group relative shadow-sm hover:shadow-md transition"
            >
              <SignedImage url={a.url} alt={a.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
              <span className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                <span className="bg-white/90 dark:bg-gray-900/90 rounded-full p-2.5 shadow">
                  <ZoomIn size={18} className="text-gray-800 dark:text-gray-100" />
                </span>
              </span>
            </button>
          );
        }
        return (
          <SignedLink
            key={item.key}
            url={a.url}
            aria-label={tr('Otwórz film {name}', { name: a.name || '' })}
            className="aspect-square rounded-xl overflow-hidden relative bg-gray-100 dark:bg-gray-800 flex flex-col items-center justify-center gap-2 p-2 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
          >
            <span className="w-10 h-10 rounded-full bg-gray-900/80 dark:bg-white/90 flex items-center justify-center">
              <Play size={18} className="text-white dark:text-gray-900 ml-0.5" />
            </span>
            <span className="text-[11px] text-gray-600 dark:text-gray-300 truncate max-w-full">{a.name || tr('Film')}</span>
          </SignedLink>
        );
      })}
    </div>
  );

  const renderFiles = () => (
    <ul className="space-y-2">
      {list.items.map((item) => {
        const a = item.attachment || {};
        // Plik z Dysku Google / OneDrive — odnośnik u dostawcy (biała lista hostów).
        if (isCloudAttachment(a)) {
          return (
            <li key={item.key} className={rowClass}>
              <CloudFileLink item={a} className="flex-1 min-w-0" />
              {jumpButton(item)}
            </li>
          );
        }
        return (
          <li key={item.key} className={rowClass}>
            <SignedLink url={a.url} className="flex items-center gap-3 flex-1 min-w-0 group">
              <span className="w-11 h-11 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center flex-shrink-0">
                <FileText size={20} className="text-gray-600 dark:text-gray-300" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-medium text-gray-900 dark:text-white truncate group-hover:underline">{a.name || tr('Plik')}</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">{meta(item, a.size ? formatFileSize(a.size) : '')}</span>
              </span>
              <Download size={18} className="text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors flex-shrink-0" />
            </SignedLink>
            {jumpButton(item)}
          </li>
        );
      })}
    </ul>
  );

  const renderLinks = () => (
    <ul className="space-y-2">
      {list.items.filter((item) => isSafeHttpUrl(item.url)).map((item) => (
        <li key={item.key} className={rowClass}>
          <a href={item.url} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-3 flex-1 min-w-0 group">
            <span className="w-11 h-11 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center flex-shrink-0">
              <Link2 size={20} className="text-gray-600 dark:text-gray-300" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block font-medium text-gray-900 dark:text-white truncate group-hover:underline">{item.title || item.domain || item.url}</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">{meta(item, item.site_name || item.domain)}</span>
            </span>
          </a>
          {jumpButton(item)}
        </li>
      ))}
    </ul>
  );

  const renderVoice = () => (
    <ul className="space-y-2">
      {list.items.map((item) => {
        const a = item.attachment || {};
        const ms = voiceDurationMs(a);
        return (
          <li key={item.key} className={rowClass}>
            <span className="flex-1 min-w-0">
              <span className="block text-xs text-gray-500 dark:text-gray-400 truncate mb-1.5">{meta(item)}</span>
              <SignedAudio url={a.url} duration={ms ? ms / 1000 : undefined} isOwn={false} />
            </span>
            {jumpButton(item)}
          </li>
        );
      })}
    </ul>
  );

  const body = () => {
    if (list.loading) return <Spinner center label={tr('Ładowanie mediów...')} />;
    if (list.error && list.items.length === 0) {
      return (
        <div className="flex flex-col items-center gap-3 py-10 text-center" role="alert">
          <p className="text-sm text-gray-600 dark:text-gray-300">{list.error.message || tr('Nie udało się wczytać materiałów rozmowy.')}</p>
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={list.retry}>{tr('Spróbuj ponownie')}</Button>
        </div>
      );
    }
    if (list.items.length === 0) {
      const [Icon, title, subtitle] = empty;
      return <EmptyState compact icon={Icon} title={title} subtitle={subtitle} />;
    }
    if (activeTab === 'media') return renderMedia();
    if (activeTab === 'files') return renderFiles();
    if (activeTab === 'links') return renderLinks();
    return renderVoice();
  };

  return (
    <>
      {/* Esc przy otwartym podglądzie zamyka najpierw podgląd */}
      <Modal
        isOpen={isOpen}
        onClose={selectedImageIndex !== null ? closeLightbox : onClose}
        closeOnBackdrop={false}
        title={tr('Media, pliki i linki')}
        icon={Image}
        size="lg"
      >
        <div className="sticky top-0 z-10 flex border-b border-gray-200/50 dark:border-gray-700/50 px-4 sm:px-6 py-2 gap-1.5 bg-gray-50 dark:bg-gray-900" role="tablist">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" role="tab" aria-selected={activeTab === key}
              onClick={() => { setActiveTab(key); setSelectedImageIndex(null); }} className={tabClass(activeTab === key)}>
              <Icon size={15} aria-hidden="true" className="flex-shrink-0" />
              <span className="truncate">{tr(label)}</span>
            </button>
          ))}
        </div>

        <div className="p-4 sm:p-6">
          {body()}
          {!list.loading && loadMoreButton}
        </div>
      </Modal>

      {/* Podgląd pełnoekranowy (portal nad oknem galerii) */}
      {selectedImageIndex !== null && images[selectedImageIndex] && createPortal(
        <div className="fixed inset-0 z-[110] bg-black/95 flex items-center justify-center" role="dialog" aria-modal="true" aria-label={tr('Podgląd zdjęcia')}>
          <button
            type="button"
            onClick={closeLightbox}
            aria-label={tr('Zamknij podgląd')}
            className="absolute top-4 right-4 p-3 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl transition"
          >
            <X size={24} />
          </button>

          {images.length > 1 && (
            <>
              <button type="button" onClick={goToPrev} aria-label={tr('Poprzednie zdjęcie')} className="absolute left-4 p-3 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl transition">
                <ChevronLeft size={28} />
              </button>
              <button type="button" onClick={goToNext} aria-label={tr('Następne zdjęcie')} className="absolute right-4 p-3 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl transition">
                <ChevronRight size={28} />
              </button>
            </>
          )}

          <SignedImage
            url={images[selectedImageIndex].attachment.url}
            alt={images[selectedImageIndex].attachment.name}
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
            placeholderClassName="w-64 h-64 rounded-lg"
          />

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-white/10 rounded-full">
            <span className="text-white/90 text-sm font-medium">
              {selectedImageIndex + 1} / {images.length}{list.hasMore ? '+' : ''}
            </span>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
