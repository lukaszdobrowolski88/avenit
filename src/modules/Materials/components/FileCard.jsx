import React from 'react';
import { FileText, Image, File, Music, Video, Archive, Download, Trash2, Eye } from 'lucide-react';

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
    month: 'short',
    year: 'numeric'
  });
}

// Ikona dla typu pliku
function getFileIcon(mimeType) {
  if (!mimeType) return File;

  if (mimeType.startsWith('image/')) return Image;
  if (mimeType.startsWith('video/')) return Video;
  if (mimeType.startsWith('audio/')) return Music;
  if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text')) return FileText;
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('archive')) return Archive;

  return File;
}

// Kolor ikony dla typu pliku
function getIconColor(mimeType) {
  if (!mimeType) return 'text-gray-500';

  if (mimeType.startsWith('image/')) return 'text-green-500';
  if (mimeType.startsWith('video/')) return 'text-purple-500';
  if (mimeType.startsWith('audio/')) return 'text-blue-500';
  if (mimeType.includes('pdf')) return 'text-red-500';
  if (mimeType.includes('document') || mimeType.includes('word')) return 'text-blue-600';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'text-green-600';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'text-orange-500';

  return 'text-gray-500';
}

// Czy plik jest obrazem
function isImageFile(mimeType) {
  return mimeType && mimeType.startsWith('image/');
}

export default function FileCard({
  file,
  onDownload,
  onDelete,
  onPreview,
  canDelete = false,
  getFileUrl
}) {
  const IconComponent = getFileIcon(file.mime_type);
  const iconColor = getIconColor(file.mime_type);
  const isImage = isImageFile(file.mime_type);
  const fileUrl = getFileUrl ? getFileUrl(file.storage_path) : null;

  const handleDownload = (e) => {
    e.stopPropagation();
    onDownload?.(file);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    if (window.confirm(`Czy na pewno chcesz usunąć plik "${file.name}"?`)) {
      onDelete?.(file.id, file.storage_path);
    }
  };

  const handlePreview = () => {
    if (isImage && onPreview) {
      onPreview(file);
    }
  };

  return (
    <div
      onClick={handlePreview}
      className={`group bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl p-4 hover:shadow-md hover:border-pink-200 dark:hover:border-pink-800 transition-all duration-200 ${isImage ? 'cursor-pointer' : ''}`}
    >
      <div className="flex items-start gap-3">
        {/* Ikona lub miniatura */}
        <div className="flex-shrink-0">
          {isImage && fileUrl ? (
            <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
              <img
                src={fileUrl}
                alt={file.name}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className={`w-12 h-12 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center`}>
              <IconComponent size={24} className={iconColor} />
            </div>
          )}
        </div>

        {/* Informacje o pliku */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate" title={file.name}>
            {file.name}
          </h3>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
            <span>{formatFileSize(file.file_size)}</span>
            <span>•</span>
            <span>{formatDate(file.created_at)}</span>
            {file.download_count > 0 && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Download size={10} />
                  {file.download_count}
                </span>
              </>
            )}
          </div>
          {file.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">
              {file.description}
            </p>
          )}
        </div>

        {/* Akcje */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
          {isImage && (
            <button
              onClick={handlePreview}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-pink-600 transition-all duration-200"
              title="Podgląd"
            >
              <Eye size={16} />
            </button>
          )}
          <button
            onClick={handleDownload}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-pink-600 transition-all duration-200"
            title="Pobierz"
          >
            <Download size={16} />
          </button>
          {canDelete && (
            <button
              onClick={handleDelete}
              className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 transition-all duration-200"
              title="Usuń"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
