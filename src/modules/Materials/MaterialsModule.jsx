import React, { useState, useCallback } from 'react';
import { FolderOpen, Search, X } from 'lucide-react';
import useFolders from './hooks/useFolders';
import useMaterials from './hooks/useMaterials';
import FolderTree from './components/FolderTree';
import FileList from './components/FileList';
import FileUploader from './components/FileUploader';
import FolderModal from './components/FolderModal';
import FilePreviewModal from './components/FilePreviewModal';

export default function MaterialsModule({ ministryKey = null, canEdit = false }) {
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState(null);
  const [parentFolderForNew, setParentFolderForNew] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [showMobileFolders, setShowMobileFolders] = useState(false);

  // Hooks
  const {
    folders,
    selectedFolderId,
    setSelectedFolderId,
    loading: foldersLoading,
    createFolder,
    renameFolder,
    deleteFolder
  } = useFolders(ministryKey);

  const {
    files,
    loading: filesLoading,
    uploading,
    uploadProgress,
    uploadFiles,
    deleteFile,
    downloadFile,
    getFileUrl,
    searchFiles
  } = useMaterials(selectedFolderId, ministryKey);

  // Filtruj pliki graficzne do nawigacji w podglądzie
  const imageFiles = files.filter(f => f.mime_type?.startsWith('image/'));

  // Handlers
  const handleSearch = useCallback(async (query) => {
    setSearchQuery(query);
    if (query.length >= 2) {
      setIsSearching(true);
      await searchFiles(query);
    } else if (query.length === 0) {
      setIsSearching(false);
    }
  }, [searchFiles]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setIsSearching(false);
    setSelectedFolderId(selectedFolderId); // Refresh files
  }, [selectedFolderId, setSelectedFolderId]);

  const handleSelectFolder = useCallback((folderId) => {
    setSelectedFolderId(folderId);
    setSearchQuery('');
    setIsSearching(false);
    setShowMobileFolders(false);
  }, [setSelectedFolderId]);

  const handleCreateFolder = useCallback((parentId = null) => {
    setEditingFolder(null);
    setParentFolderForNew(parentId);
    setShowFolderModal(true);
  }, []);

  const handleRenameFolder = useCallback((folder) => {
    setEditingFolder(folder);
    setParentFolderForNew(null);
    setShowFolderModal(true);
  }, []);

  const handleFolderModalSubmit = useCallback(async (name) => {
    if (editingFolder) {
      await renameFolder(editingFolder.id, name);
    } else {
      await createFolder(name, parentFolderForNew);
    }
    setShowFolderModal(false);
    setEditingFolder(null);
    setParentFolderForNew(null);
  }, [editingFolder, parentFolderForNew, createFolder, renameFolder]);

  const handleDeleteFolder = useCallback(async (folderId) => {
    if (window.confirm('Czy na pewno chcesz usunąć ten folder i wszystkie pliki w nim zawarte?')) {
      await deleteFolder(folderId);
    }
  }, [deleteFolder]);

  const handleUpload = useCallback(async (fileList) => {
    await uploadFiles(fileList);
  }, [uploadFiles]);

  const handleDeleteFile = useCallback(async (fileId, storagePath) => {
    await deleteFile(fileId, storagePath);
  }, [deleteFile]);

  const handlePreviewFile = useCallback((file) => {
    if (file.mime_type?.startsWith('image/')) {
      setPreviewFile(file);
      setPreviewUrl(getFileUrl(file.storage_path));
    }
  }, [getFileUrl]);

  const handlePreviewNavigation = useCallback((direction) => {
    if (!previewFile) return;
    const currentIndex = imageFiles.findIndex(f => f.id === previewFile.id);
    const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex >= 0 && newIndex < imageFiles.length) {
      const newFile = imageFiles[newIndex];
      setPreviewFile(newFile);
      setPreviewUrl(getFileUrl(newFile.storage_path));
    }
  }, [previewFile, imageFiles, getFileUrl]);

  const currentPreviewIndex = previewFile ? imageFiles.findIndex(f => f.id === previewFile.id) : -1;

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg">
            <FolderOpen className="text-white" size={20} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Materiały</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Pliki i dokumenty</p>
          </div>
        </div>

        {/* Search */}
        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={18} />
            <input
              type="text"
              placeholder="Szukaj plików..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-10 pr-10 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
            {searchQuery && (
              <button
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Mobile folder toggle */}
        <button
          onClick={() => setShowMobileFolders(!showMobileFolders)}
          className="lg:hidden p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
        >
          <FolderOpen size={20} />
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Folders */}
        <div className={`
          ${showMobileFolders ? 'fixed inset-0 z-40 bg-white dark:bg-gray-800' : 'hidden'}
          lg:relative lg:block lg:w-64 xl:w-72 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0
        `}>
          {/* Mobile close button */}
          <div className="lg:hidden flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <span className="font-medium text-gray-900 dark:text-white">Foldery</span>
            <button
              onClick={() => setShowMobileFolders(false)}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <X size={20} />
            </button>
          </div>

          <div className="p-4 h-full overflow-y-auto">
            {/* Folder tree */}
            <FolderTree
              folders={folders}
              selectedId={selectedFolderId}
              onSelect={handleSelectFolder}
              onCreateFolder={handleCreateFolder}
              onRenameFolder={handleRenameFolder}
              onDeleteFolder={handleDeleteFolder}
              canEdit={canEdit}
              loading={foldersLoading}
            />
          </div>
        </div>

        {/* Main area - Files */}
        <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
          {/* Uploader */}
          {canEdit && !isSearching && (
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <FileUploader
                onUpload={handleUpload}
                uploading={uploading}
                progress={uploadProgress}
              />
            </div>
          )}

          {/* Search results indicator */}
          {isSearching && (
            <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                Wyniki wyszukiwania dla: <strong>"{searchQuery}"</strong>
                <button
                  onClick={handleClearSearch}
                  className="ml-2 text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300 underline"
                >
                  Wyczyść
                </button>
              </p>
            </div>
          )}

          {/* Files list */}
          <div className="flex-1 overflow-y-auto p-4">
            <FileList
              files={files}
              loading={filesLoading}
              onPreview={handlePreviewFile}
              onDownload={downloadFile}
              onDelete={handleDeleteFile}
              canDelete={canEdit}
              getFileUrl={getFileUrl}
            />
          </div>
        </div>
      </div>

      {/* Folder Modal */}
      <FolderModal
        isOpen={showFolderModal}
        onClose={() => {
          setShowFolderModal(false);
          setEditingFolder(null);
          setParentFolderForNew(null);
        }}
        onSubmit={handleFolderModalSubmit}
        initialName={editingFolder?.name || ''}
        isEditing={!!editingFolder}
      />

      {/* File Preview Modal */}
      <FilePreviewModal
        isOpen={!!previewFile}
        onClose={() => {
          setPreviewFile(null);
          setPreviewUrl(null);
        }}
        file={previewFile}
        fileUrl={previewUrl}
        onDownload={downloadFile}
        onDelete={handleDeleteFile}
        canDelete={canEdit}
        onPrev={() => handlePreviewNavigation('prev')}
        onNext={() => handlePreviewNavigation('next')}
        hasPrev={currentPreviewIndex > 0}
        hasNext={currentPreviewIndex < imageFiles.length - 1}
      />
    </div>
  );
}
