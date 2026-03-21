import React from 'react';
import { X, Download, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';

// Formatowanie rozmiaru pliku
function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Formatowanie daty
function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function FilePreviewModal({
  isOpen,
  onClose,
  file,
  fileUrl,
  onDownload,
  onDelete,
  canDelete = false,
  // Dla nawigacji między obrazami
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false
}) {
  if (!isOpen || !file) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowLeft' && hasPrev) {
      onPrev?.();
    } else if (e.key === 'ArrowRight' && hasNext) {
      onNext?.();
    }
  };

  React.useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, hasPrev, hasNext]);

  const handleDownload = () => {
    onDownload?.(file);
  };

  const handleDelete = () => {
    if (window.confirm(`Czy na pewno chcesz usunąć plik "${file.name}"?`)) {
      onDelete?.(file.id, file.storage_path);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-all duration-200 z-10"
      >
        <X size={24} />
      </button>

      {/* Navigation arrows */}
      {hasPrev && (
        <button
          onClick={onPrev}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-all duration-200 z-10"
        >
          <ChevronLeft size={28} />
        </button>
      )}
      {hasNext && (
        <button
          onClick={onNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-all duration-200 z-10"
        >
          <ChevronRight size={28} />
        </button>
      )}

      {/* Image */}
      <div className="max-w-[90vw] max-h-[80vh] relative">
        <img
          src={fileUrl}
          alt={file.name}
          className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
        />
      </div>

      {/* Bottom bar with file info and actions */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          {/* File info */}
          <div className="text-white">
            <h3 className="font-semibold text-lg truncate max-w-md">{file.name}</h3>
            <div className="flex items-center gap-3 text-sm text-white/70 mt-1">
              <span>{formatFileSize(file.file_size)}</span>
              <span>•</span>
              <span>{formatDate(file.created_at)}</span>
              {file.uploaded_by && (
                <>
                  <span>•</span>
                  <span>Dodane przez: {file.uploaded_by.split('@')[0]}</span>
                </>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-white transition-all duration-200"
            >
              <Download size={18} />
              Pobierz
            </button>
            {canDelete && (
              <button
                onClick={handleDelete}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-xl text-red-300 hover:text-red-200 transition-all duration-200"
              >
                <Trash2 size={18} />
                Usuń
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
