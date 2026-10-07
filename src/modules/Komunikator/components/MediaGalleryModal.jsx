import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Image, FileText, Download, ChevronLeft, ChevronRight, ZoomIn, Loader } from 'lucide-react';
import { formatMessageDate, formatFileSize } from '../utils/messageHelpers';
import { tr } from '../../../i18n';
import { toast } from '../../../lib/toast';
import Modal from '../../../components/Modal';
import EmptyState from '../../../components/EmptyState';
import Spinner from '../../../components/Spinner';
import { SignedImage, SignedLink } from './SignedAttachment';

// Galeria rozmowy (K11): zdjęcia i pliki przez podpisane linki (K1), paczkami z „Wczytaj starsze”.
export default function MediaGalleryModal({
  isOpen,
  onClose,
  images,
  files,
  loading,
  hasMore = false,
  loadingMore = false,
  onLoadMore
}) {
  const [activeTab, setActiveTab] = useState('images');
  const [selectedImageIndex, setSelectedImageIndex] = useState(null);

  const openLightbox = (index) => setSelectedImageIndex(index);
  const closeLightbox = () => setSelectedImageIndex(null);
  const goToPrev = () => setSelectedImageIndex(prev => (prev > 0 ? prev - 1 : images.length - 1));
  const goToNext = () => setSelectedImageIndex(prev => (prev < images.length - 1 ? prev + 1 : 0));

  const handleLoadMore = async () => {
    try { await onLoadMore?.(); } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się wczytać starszych plików.') });
    }
  };

  if (!isOpen) return null;

  const tabClass = (active) => `flex-1 px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 flex items-center justify-center gap-2 ${active
    ? 'bg-accent-primary text-white shadow-sm'
    : 'text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800'}`;

  const loadMoreButton = hasMore && onLoadMore ? (
    <div className="flex justify-center pt-4">
      <button
        type="button"
        onClick={handleLoadMore}
        disabled={loadingMore}
        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition disabled:opacity-60 flex items-center gap-2"
      >
        {loadingMore && <Loader size={14} className="animate-spin" />}
        {loadingMore ? tr('Ładowanie...') : tr('Wczytaj starsze')}
      </button>
    </div>
  ) : null;

  return (
    <>
      {/* Esc przy otwartym podglądzie zamyka najpierw podgląd */}
      <Modal
        isOpen={isOpen}
        onClose={selectedImageIndex !== null ? closeLightbox : onClose}
        closeOnBackdrop={false}
        title={tr('Galeria mediów')}
        icon={Image}
        size="lg"
      >
        <div className="sticky top-0 z-10 flex border-b border-gray-200/50 dark:border-gray-700/50 px-6 py-2 gap-2 bg-gray-50 dark:bg-gray-900" role="tablist">
          <button type="button" role="tab" aria-selected={activeTab === 'images'} onClick={() => setActiveTab('images')} className={tabClass(activeTab === 'images')}>
            <Image size={16} />
            {tr('Zdjęcia')} ({images.length}{hasMore ? '+' : ''})
          </button>
          <button type="button" role="tab" aria-selected={activeTab === 'files'} onClick={() => setActiveTab('files')} className={tabClass(activeTab === 'files')}>
            <FileText size={16} />
            {tr('Pliki')} ({files.length}{hasMore ? '+' : ''})
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <Spinner center label={tr('Ładowanie mediów...')} />
          ) : activeTab === 'images' ? (
            images.length === 0 ? (
              <>
                <EmptyState compact icon={Image} title={tr('Brak zdjęć')} subtitle={tr('Zdjęcia udostępnione w tej rozmowie pojawią się tutaj')} />
                {loadMoreButton}
              </>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  {images.map((img, idx) => (
                    <button
                      type="button"
                      key={img.key || `${img.messageId}-${idx}`}
                      onClick={() => openLightbox(idx)}
                      aria-label={tr('Powiększ zdjęcie {name}', { name: img.name || '' })}
                      className="aspect-square rounded-xl overflow-hidden cursor-pointer group relative shadow-sm hover:shadow-lg transition-all duration-300"
                    >
                      <SignedImage url={img.url} alt={img.name} className="w-full h-full object-cover transition-all duration-300 group-hover:scale-110" />
                      <span className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center">
                        <span className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm rounded-full p-2.5 shadow-lg transform scale-75 group-hover:scale-100 transition-all duration-300">
                          <ZoomIn size={20} className="text-accent-primary-light" />
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
                {loadMoreButton}
              </>
            )
          ) : (
            files.length === 0 ? (
              <>
                <EmptyState compact icon={FileText} title={tr('Brak plików')} subtitle={tr('Pliki udostępnione w tej rozmowie pojawią się tutaj')} />
                {loadMoreButton}
              </>
            ) : (
              <>
                <div className="space-y-2">
                  {files.map((file, idx) => (
                    <SignedLink
                      key={file.key || `${file.messageId}-${idx}`}
                      url={file.url}
                      className="flex items-center gap-3 p-3 bg-white/80 dark:bg-gray-800/80 rounded-xl border border-gray-100/50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/50 hover:shadow-md transition-all duration-200 group"
                    >
                      <div className="w-11 h-11 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center">
                        <FileText size={20} className="text-gray-600 dark:text-gray-300" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white truncate">{file.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {formatFileSize(file.size)} • {formatMessageDate(file.createdAt)}
                        </p>
                      </div>
                      <div className="p-2 rounded-lg bg-gray-100/50 dark:bg-gray-700/50 transition-all duration-200">
                        <Download size={18} className="text-gray-400 group-hover:text-accent-primary transition-colors" />
                      </div>
                    </SignedLink>
                  ))}
                </div>
                {loadMoreButton}
              </>
            )
          )}
        </div>
      </Modal>

      {/* Podgląd pełnoekranowy (portal nad oknem galerii) */}
      {selectedImageIndex !== null && images[selectedImageIndex] && createPortal(
        <div className="fixed inset-0 z-[110] bg-black/95 backdrop-blur-sm flex items-center justify-center" role="dialog" aria-modal="true" aria-label={tr('Podgląd zdjęcia')}>
          <button
            type="button"
            onClick={closeLightbox}
            aria-label={tr('Zamknij podgląd')}
            className="absolute top-4 right-4 p-3 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-xl transition-all duration-200"
          >
            <X size={24} />
          </button>

          {images.length > 1 && (
            <>
              <button type="button" onClick={goToPrev} aria-label={tr('Poprzednie zdjęcie')} className="absolute left-4 p-3 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-xl transition-all duration-200">
                <ChevronLeft size={28} />
              </button>
              <button type="button" onClick={goToNext} aria-label={tr('Następne zdjęcie')} className="absolute right-4 p-3 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-xl transition-all duration-200">
                <ChevronRight size={28} />
              </button>
            </>
          )}

          <SignedImage
            url={images[selectedImageIndex].url}
            alt={images[selectedImageIndex].name}
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
            placeholderClassName="w-64 h-64 rounded-lg"
          />

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full">
            <span className="text-white/90 text-sm font-medium">
              {selectedImageIndex + 1} / {images.length}{hasMore ? '+' : ''}
            </span>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
