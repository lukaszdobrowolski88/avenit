import React, { useState, useEffect, useRef } from 'react';
import { Folder, FolderPlus } from 'lucide-react';
import { tr } from '../../../i18n';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';

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
      setError(tr('Nazwa folderu nie może być pusta'));
      return;
    }

    // Walidacja nazwy
    if (trimmedName.includes('/') || trimmedName.includes('\\')) {
      setError(tr('Nazwa folderu nie może zawierać znaków / lub \\'));
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
        setError(tr('Folder o tej nazwie już istnieje w tym miejscu'));
      } else {
        setError(err.message || tr('Wystąpił błąd'));
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'create' ? tr('Nowy folder') : tr('Zmień nazwę folderu')}
      subtitle={parentFolderName && mode === 'create' ? tr('w folderze: {name}', { name: parentFolderName }) : undefined}
      icon={mode === 'create' ? FolderPlus : Folder}
      size="sm"
      closeOnBackdrop={false}
      footer={<>
        <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>{tr('Anuluj')}</Button>
        <Button type="submit" form="materials-folder-form" loading={loading} disabled={!name.trim()}>
          {mode === 'create' ? tr('Utwórz folder') : tr('Zapisz')}
        </Button>
      </>}
    >
      {/* Form */}
      <form id="materials-folder-form" onSubmit={handleSubmit} className="p-6">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {tr('Nazwa folderu')}
        </label>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={tr('Wpisz nazwę folderu...')}
          className="w-full px-4 py-2.5 bg-white/70 dark:bg-gray-800/70 border border-gray-200/50 dark:border-gray-700/50 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent-primary-light/50 transition-all duration-200"
          disabled={loading}
        />
        {error && (
          <p className="text-sm text-red-500 mt-2">{error}</p>
        )}
      </form>
    </Modal>
  );
}
