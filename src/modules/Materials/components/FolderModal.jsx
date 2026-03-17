import React, { useState, useEffect, useRef } from 'react';
import { X, Folder, FolderPlus } from 'lucide-react';

export default function FolderModal({
  isOpen,
  onClose,
  onSubmit,
  mode = 'create', // 'create' | 'rename'
  initialName = '',
  parentFolderName = null
}) {
  const [name, setName] = useState(initialName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setError(null);
      // Focus input po otwarciu
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, initialName]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Nazwa folderu nie może być pusta');
      return;
    }

    // Walidacja nazwy
    if (trimmedName.includes('/') || trimmedName.includes('\\')) {
      setError('Nazwa folderu nie może zawierać znaków / lub \\');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await onSubmit(trimmedName);
      onClose();
    } catch (err) {
      console.error('Folder operation error:', err);
      if (err.message?.includes('unique') || err.message?.includes('duplicate')) {
        setError('Folder o tej nazwie już istnieje w tym miejscu');
      } else {
        setError(err.message || 'Wystąpił błąd');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm rounded-2xl w-full max-w-md mx-4 shadow-2xl overflow-hidden border border-gray-200/50 dark:border-gray-700/50"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200/50 dark:border-gray-700/50 bg-gradient-to-r from-pink-50/50 to-orange-50/50 dark:from-gray-800/50 dark:to-gray-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
              {mode === 'create' ? (
                <FolderPlus size={18} className="text-white" />
              ) : (
                <Folder size={18} className="text-white" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {mode === 'create' ? 'Nowy folder' : 'Zmień nazwę folderu'}
              </h2>
              {parentFolderName && mode === 'create' && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  w folderze: {parentFolderName}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all duration-200"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Nazwa folderu
            </label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Wpisz nazwę folderu..."
              className="w-full px-4 py-2.5 bg-white/70 dark:bg-gray-800/70 border border-gray-200/50 dark:border-gray-700/50 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500/50 transition-all duration-200"
              disabled={loading}
            />
            {error && (
              <p className="text-sm text-red-500 mt-2">{error}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-all duration-200"
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all duration-200 flex items-center gap-2 shadow-lg shadow-pink-500/30"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {mode === 'create' ? 'Tworzenie...' : 'Zapisywanie...'}
                </>
              ) : (
                mode === 'create' ? 'Utwórz folder' : 'Zapisz'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
