import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Image, FileText, Download, ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react';
import { formatMessageDate, formatFileSize, getFileIcon } from '../utils/messageHelpers';
import { tr } from '../../../i18n';
import Modal from '../../../components/Modal';
import EmptyState from '../../../components/EmptyState';
import Spinner from '../../../components/Spinner';

export default function MediaGalleryModal({
  isOpen,
  onClose,
  images,
  files,
  loading
}) {
  const [activeTab, setActiveTab] = useState('images');
  const [selectedImageIndex, setSelectedImageIndex] = useState(null);

  const openLightbox = (index) => {
    setSelectedImageIndex(index);
  };

  const closeLightbox = () => {
    setSelectedImageIndex(null);
  };

  const goToPrev = () => {
    setSelectedImageIndex(prev => prev > 0 ? prev - 1 : images.length - 1);
  };

  const goToNext = () => {
    setSelectedImageIndex(prev => prev < images.length - 1 ? prev + 1 : 0);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Main Modal — Esc przy otwartym podglądzie zamyka najpierw podgląd */}
      <Modal
        isOpen={isOpen}
        onClose={selectedImageIndex !== null ? closeLightbox : onClose}
        closeOnBackdrop={false}
        title={tr('Galeria mediów')}
        icon={Image}
        size="lg"
      >
        {/* Tabs */}
        <div className="sticky top-0 z-10 flex border-b border-gray-200/50 dark:border-gray-700/50 px-6 py-2 gap-2 bg-gray-50 dark:bg-gray-900">
          <button
            onClick={() => setActiveTab('images')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 flex items-center justify-center gap-2 ${
              activeTab === 'images'
                ? 'bg-gradient-to-r from-accent-primary-light to-accent-secondary-light text-white shadow-lg shadow-accent-primary-light/30'
                : 'text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800'
            }`}
          >
            <Image size={16} />
            {tr('Zdjęcia')} ({images.length})
          </button>
          <button
            onClick={() => setActiveTab('files')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 flex items-center justify-center gap-2 ${
              activeTab === 'files'
                ? 'bg-gradient-to-r from-accent-primary-light to-accent-secondary-light text-white shadow-lg shadow-accent-primary-light/30'
                : 'text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800'
            }`}
          >
            <FileText size={16} />
            {tr('Pliki')} ({files.length})
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <Spinner center label={tr('Ładowanie mediów...')} />
          ) : activeTab === 'images' ? (
            images.length === 0 ? (
              <EmptyState
                compact
                icon={Image}
                title={tr('Brak zdjęć')}
                subtitle={tr('Zdjęcia udostępnione w tej rozmowie pojawią się tutaj')}
              />
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {images.map((img, idx) => (
                  <div
                    key={`${img.messageId}-${idx}`}
                    onClick={() => openLightbox(idx)}
                    className="aspect-square rounded-xl overflow-hidden cursor-pointer group relative shadow-sm hover:shadow-lg transition-all duration-300"
                  >
                    <img
                      src={img.url}
                      alt={img.name}
                      className="w-full h-full object-cover transition-all duration-300 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center">
                      <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm rounded-full p-2.5 shadow-lg transform scale-75 group-hover:scale-100 transition-all duration-300">
                        <ZoomIn size={20} className="text-accent-primary-light" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            files.length === 0 ? (
              <EmptyState
                compact
                icon={FileText}
                title={tr('Brak plików')}
                subtitle={tr('Pliki udostępnione w tej rozmowie pojawią się tutaj')}
              />
            ) : (
              <div className="space-y-2">
                {files.map((file, idx) => (
                  <a
                    key={`${file.messageId}-${idx}`}
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-100/50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/50 hover:shadow-md transition-all duration-200 group"
                  >
                    <div className="w-11 h-11 bg-gradient-to-br from-accent-primary-lighter to-accent-secondary-lighter dark:from-accent-primary-darkest/30 dark:to-accent-secondary-darkest/30 rounded-xl flex items-center justify-center">
                      <FileText size={20} className="text-accent-primary-light" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatFileSize(file.size)} • {formatMessageDate(file.createdAt)}
                      </p>
                    </div>
                    <div className="p-2 rounded-lg bg-gray-100/50 dark:bg-gray-700/50 group-hover:bg-accent-primary-lighter dark:group-hover:bg-accent-primary-darkest/30 transition-all duration-200">
                      <Download size={18} className="text-gray-400 group-hover:text-accent-primary-light transition-colors" />
                    </div>
                  </a>
                ))}
              </div>
            )
          )}
        </div>
      </Modal>

      {/* Lightbox — pełnoekranowy podgląd (portal nad oknem galerii) */}
      {selectedImageIndex !== null && images[selectedImageIndex] && createPortal(
        <div className="fixed inset-0 z-[110] bg-black/95 backdrop-blur-sm flex items-center justify-center">
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 p-3 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-xl transition-all duration-200"
          >
            <X size={24} />
          </button>

          {images.length > 1 && (
            <>
              <button
                onClick={goToPrev}
                className="absolute left-4 p-3 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-xl transition-all duration-200"
              >
                <ChevronLeft size={28} />
              </button>
              <button
                onClick={goToNext}
                className="absolute right-4 p-3 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-xl transition-all duration-200"
              >
                <ChevronRight size={28} />
              </button>
            </>
          )}

          <img
            src={images[selectedImageIndex].url}
            alt={images[selectedImageIndex].name}
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
          />

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full">
            <span className="text-white/90 text-sm font-medium">
              {selectedImageIndex + 1} / {images.length}
            </span>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
