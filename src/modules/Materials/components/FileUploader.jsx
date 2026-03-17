import React, { useState, useRef, useCallback } from 'react';
import { Upload, X, FileText, Image, Loader } from 'lucide-react';

// Formatowanie rozmiaru pliku
function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Czy plik jest obrazem
function isImageFile(type) {
  return type && type.startsWith('image/');
}

export default function FileUploader({
  onUpload,
  uploading = false,
  uploadProgress = 0,
  canUpload = true,
  maxFileSize = 50 * 1024 * 1024, // 50MB
  accept = '*/*'
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const fileInputRef = useRef(null);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (canUpload) {
      setIsDragging(true);
    }
  }, [canUpload]);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (!canUpload) return;

    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  }, [canUpload]);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    handleFiles(files);
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFiles = (files) => {
    // Waliduj rozmiar plików
    const validFiles = files.filter(file => {
      if (file.size > maxFileSize) {
        alert(`Plik "${file.name}" przekracza limit ${formatFileSize(maxFileSize)}`);
        return false;
      }
      return true;
    });

    setSelectedFiles(prev => [...prev, ...validFiles]);
  };

  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0 || !onUpload) return;

    try {
      await onUpload(selectedFiles);
      setSelectedFiles([]);
    } catch (err) {
      console.error('Upload error:', err);
    }
  };

  if (!canUpload) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200
          ${isDragging
            ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/20'
            : 'border-gray-300 dark:border-gray-600 hover:border-pink-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
          }
          ${uploading ? 'pointer-events-none opacity-50' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={accept}
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="flex flex-col items-center gap-3">
          <div className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all duration-200
            ${isDragging
              ? 'bg-pink-100 dark:bg-pink-900/40'
              : 'bg-gray-100 dark:bg-gray-800'
            }`}
          >
            <Upload size={24} className={isDragging ? 'text-pink-500' : 'text-gray-500'} />
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {isDragging ? 'Upuść pliki tutaj' : 'Przeciągnij pliki lub kliknij, aby wybrać'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Maksymalny rozmiar pliku: {formatFileSize(maxFileSize)}
            </p>
          </div>
        </div>
      </div>

      {/* Selected files list */}
      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Wybrane pliki ({selectedFiles.length})
            </span>
            <button
              onClick={() => setSelectedFiles([])}
              className="text-xs text-gray-500 hover:text-red-500 transition-colors"
            >
              Wyczyść wszystkie
            </button>
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto">
            {selectedFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
              >
                <div className="w-8 h-8 rounded-lg bg-white dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                  {isImageFile(file.type) ? (
                    <Image size={16} className="text-green-500" />
                  ) : (
                    <FileText size={16} className="text-blue-500" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(file.size)}
                  </p>
                </div>

                <button
                  onClick={() => removeFile(index)}
                  className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-all"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>

          {/* Upload button */}
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="w-full py-2.5 bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 text-white font-medium rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-pink-500/30"
          >
            {uploading ? (
              <>
                <Loader size={18} className="animate-spin" />
                Przesyłanie... {uploadProgress}%
              </>
            ) : (
              <>
                <Upload size={18} />
                Prześlij {selectedFiles.length} {selectedFiles.length === 1 ? 'plik' : selectedFiles.length < 5 ? 'pliki' : 'plików'}
              </>
            )}
          </button>
        </div>
      )}

      {/* Upload progress */}
      {uploading && uploadProgress > 0 && (
        <div className="space-y-2">
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-pink-500 to-orange-500 transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
