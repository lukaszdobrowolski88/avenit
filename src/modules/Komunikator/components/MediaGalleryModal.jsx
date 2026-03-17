import React, { useState } from 'react';
import { X, Image, FileText, Download, ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react';
import { formatMessageDate, formatFileSize, getFileIcon } from '../utils/messageHelpers';

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
      {/* Main Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm rounded-2xl w-full max-w-2xl mx-4 shadow-2xl overflow-hidden max-h-[80vh] flex flex-col border border-gray-200/50 dark:border-gray-700/50">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200/50 dark:border-gray-700/50 bg-gradient-to-r from-pink-50/50 to-orange-50/50 dark:from-gray-800/50 dark:to-gray-800/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-orange-500 flex items-center justify-center shadow-lg shadow-pink-500/20">
                <Image size={18} className="text-white" />
              </div>
              <h2 className="text-lg font-bold bg-gradient-to-r from-pink-600 to-orange-500 bg-clip-text text-transparent">
                Galeria mediów
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all duration-200"
            >
              <X size={20} className="text-gray-500" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200/50 dark:border-gray-700/50 p-2 gap-2 bg-gray-50/50 dark:bg-gray-800/30">
            <button
              onClick={() => setActiveTab('images')}
              className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 flex items-center justify-center gap-2 ${
                activeTab === 'images'
                  ? 'bg-gradient-to-r from-pink-500 to-orange-500 text-white shadow-lg shadow-pink-500/30'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800'
              }`}
            >
              <Image size={16} />
              Zdjęcia ({images.length})
            </button>
            <button
              onClick={() => setActiveTab('files')}
              className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 flex items-center justify-center gap-2 ${
                activeTab === 'files'
                  ? 'bg-gradient-to-r from-pink-500 to-orange-500 text-white shadow-lg shadow-pink-500/30'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800'
              }`}
            >
              <FileText size={16} />
              Pliki ({files.length})
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-100 to-orange-100 dark:from-pink-900/30 dark:to-orange-900/30 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-pink-600 border-t-transparent rounded-full animate-spin" />
                </div>
                <p className="text-sm text-gray-500">Ładowanie mediów...</p>
              </div>
            ) : activeTab === 'images' ? (
              images.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-100 to-orange-100 dark:from-pink-900/30 dark:to-orange-900/30 flex items-center justify-center mb-4">
                    <Image size={28} className="text-pink-500" />
                  </div>
                  <p className="text-gray-700 dark:text-gray-300 font-medium mb-1">Brak zdjęć</p>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Zdjęcia udostępnione w tej rozmowie pojawią się tutaj</p>
                </div>
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
                          <ZoomIn size={20} className="text-pink-500" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              files.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-100 to-orange-100 dark:from-pink-900/30 dark:to-orange-900/30 flex items-center justify-center mb-4">
                    <FileText size={28} className="text-pink-500" />
                  </div>
                  <p className="text-gray-700 dark:text-gray-300 font-medium mb-1">Brak plików</p>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Pliki udostępnione w tej rozmowie pojawią się tutaj</p>
                </div>
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
                      <div className="w-11 h-11 bg-gradient-to-br from-pink-100 to-orange-100 dark:from-pink-900/30 dark:to-orange-900/30 rounded-xl flex items-center justify-center">
                        <FileText size={20} className="text-pink-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white truncate">
                          {file.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {formatFileSize(file.size)} • {formatMessageDate(file.createdAt)}
                        </p>
                      </div>
                      <div className="p-2 rounded-lg bg-gray-100/50 dark:bg-gray-700/50 group-hover:bg-pink-100 dark:group-hover:bg-pink-900/30 transition-all duration-200">
                        <Download size={18} className="text-gray-400 group-hover:text-pink-500 transition-colors" />
                      </div>
                    </a>
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {selectedImageIndex !== null && images[selectedImageIndex] && (
        <div className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-sm flex items-center justify-center">
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
        </div>
      )}
    </>
  );
}
