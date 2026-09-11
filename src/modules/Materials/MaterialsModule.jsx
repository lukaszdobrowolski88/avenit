import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { FolderOpen, Folder, Search, X, ChevronRight, Home, Layers, Pencil, Share2, Users2, FolderInput, List as ListIcon, LayoutGrid } from 'lucide-react';
import useFolders from './hooks/useFolders';
import useMaterials from './hooks/useMaterials';
import useShares from './hooks/useShares';
import FolderTree from './components/FolderTree';
import FileList from './components/FileList';
import FileUploader from './components/FileUploader';
import FolderModal from './components/FolderModal';
import FilePreviewModal from './components/FilePreviewModal';
import ShareModal from './components/ShareModal';
import MoveModal from './components/MoveModal';
import { tr } from '../../i18n';

export default function MaterialsModule({ ministryKey = null, canEdit = false }) {
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [viewAll, setViewAll] = useState(false); // „Wszystkie pliki" (płasko, także z podfolderów)
  const [viewShared, setViewShared] = useState(false); // „Udostępnione mi"
  const [sharingItem, setSharingItem] = useState(null); // {file_id|folder_id, name}
  const [movingItem, setMovingItem] = useState(null); // {id, name, isFolder}
  const [layout, setLayout] = useState('list'); // list | grid
  const [draggedFileId, setDraggedFileId] = useState(null); // drag&drop do folderu
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
    deleteFolder,
    moveFolder,
    findFolderById,
    getFolderPath
  } = useFolders(ministryKey);

  const shares = useShares();
  useEffect(() => { if (viewShared) shares.fetchSharedWithMe(); /* eslint-disable-next-line */ }, [viewShared]);

  const materialsFolderArg = viewAll ? '__ALL__' : selectedFolderId;
  const {
    files,
    loading: filesLoading,
    uploading,
    uploadProgress,
    uploadFiles,
    deleteFile,
    downloadFile,
    getFileUrl,
    searchFiles,
    updateFileName,
    moveFile
  } = useMaterials(materialsFolderArg, ministryKey);

  // Płaska lista folderów (do breadcrumbs) + podfoldery bieżącego poziomu (kafle).
  const flatFolders = useMemo(() => {
    const out = [];
    const walk = (list) => (list || []).forEach((f) => { out.push(f); if (f.children) walk(f.children); });
    walk(folders);
    return out;
  }, [folders]);
  const breadcrumb = useMemo(() => (selectedFolderId ? getFolderPath(selectedFolderId, flatFolders) : []), [selectedFolderId, flatFolders, getFolderPath]);
  const subfolders = useMemo(() => {
    if (viewAll) return [];
    return selectedFolderId ? (findFolderById(selectedFolderId)?.children || []) : folders;
  }, [viewAll, selectedFolderId, findFolderById, folders]);

  const imageFiles = files.filter(f => f.mime_type?.startsWith('image/'));

  // Handlers
  const handleSearch = useCallback(async (query) => {
    setSearchQuery(query);
    if (query.length >= 2) { setIsSearching(true); await searchFiles(query); }
    else if (query.length === 0) { setIsSearching(false); }
  }, [searchFiles]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setIsSearching(false);
    setSelectedFolderId(selectedFolderId);
  }, [selectedFolderId, setSelectedFolderId]);

  const openFolder = useCallback((folderId) => {
    setViewAll(false);
    setViewShared(false);
    setSelectedFolderId(folderId);
    setSearchQuery('');
    setIsSearching(false);
    setShowMobileFolders(false);
  }, [setSelectedFolderId]);

  const handleCreateFolder = useCallback((parentId = null) => {
    setEditingFolder(null); setParentFolderForNew(parentId); setShowFolderModal(true);
  }, []);

  // FolderTree woła (folderId, folderName); trzymamy obiekt {id,name}.
  const handleRenameFolder = useCallback((folderId, folderName) => {
    setEditingFolder({ id: folderId, name: folderName });
    setParentFolderForNew(null);
    setShowFolderModal(true);
  }, []);

  const handleFolderModalSubmit = useCallback(async (name) => {
    if (editingFolder) await renameFolder(editingFolder.id, name);
    else await createFolder(name, parentFolderForNew);
    setShowFolderModal(false); setEditingFolder(null); setParentFolderForNew(null);
  }, [editingFolder, parentFolderForNew, createFolder, renameFolder]);

  const handleDeleteFolder = useCallback(async (folderId) => {
    if (window.confirm(tr('Czy na pewno chcesz usunąć ten folder i wszystkie pliki w nim zawarte?'))) {
      await deleteFolder(folderId);
    }
  }, [deleteFolder]);

  const handleUpload = useCallback(async (fileList) => { await uploadFiles(fileList); }, [uploadFiles]);
  const handleDeleteFile = useCallback(async (fileId, storagePath) => { await deleteFile(fileId, storagePath); }, [deleteFile]);

  const handleRenameFile = useCallback(async (file) => {
    const base = (file.name || '').includes('.') ? file.name.slice(0, file.name.lastIndexOf('.')) : file.name;
    const next = window.prompt(tr('Nowa nazwa pliku:'), base);
    if (next === null) return;
    try { await updateFileName(file.id, next, file.name); }
    catch (e) { window.alert(tr('Nie udało się zmienić nazwy: ') + e.message); }
  }, [updateFileName]);

  const handlePreviewFile = useCallback((file) => {
    const m = file.mime_type || '';
    if (m.startsWith('image/') || m === 'application/pdf') { setPreviewFile(file); setPreviewUrl(getFileUrl(file.storage_path)); }
    else downloadFile(file); // brak podglądu → otwórz/pobierz
  }, [getFileUrl, downloadFile]);

  const handlePreviewNavigation = useCallback((direction) => {
    if (!previewFile) return;
    const idx = imageFiles.findIndex(f => f.id === previewFile.id);
    const newIndex = direction === 'prev' ? idx - 1 : idx + 1;
    if (newIndex >= 0 && newIndex < imageFiles.length) {
      const f = imageFiles[newIndex]; setPreviewFile(f); setPreviewUrl(getFileUrl(f.storage_path));
    }
  }, [previewFile, imageFiles, getFileUrl]);

  const handleShareFile = useCallback((file) => setSharingItem({ file_id: file.id, name: file.name }), []);
  const dropFileToFolder = useCallback(async (folderId) => {
    if (!draggedFileId) return;
    const fid = draggedFileId; setDraggedFileId(null);
    try { await moveFile(fid, folderId); } catch (e) { window.alert(tr('Nie udało się przenieść: ') + e.message); }
  }, [draggedFileId, moveFile]);
  // Edycja w „Udostępnione mi" (tylko pliki z prawem edycji) — operacja + odświeżenie widoku.
  const sharedRename = useCallback(async (file) => {
    const base = (file.name || '').includes('.') ? file.name.slice(0, file.name.lastIndexOf('.')) : file.name;
    const next = window.prompt(tr('Nowa nazwa pliku:'), base);
    if (next === null) return;
    try { await updateFileName(file.id, next, file.name); shares.fetchSharedWithMe(); } catch (e) { window.alert(e.message); }
  }, [updateFileName, shares]);
  const sharedDelete = useCallback(async (fileId, storagePath) => {
    try { await deleteFile(fileId, storagePath); shares.fetchSharedWithMe(); } catch (e) { window.alert(e.message); }
  }, [deleteFile, shares]);
  const handleMoveFile = useCallback((file) => setMovingItem({ id: file.id, name: file.name, isFolder: false }), []);
  const handleMove = useCallback(async (targetFolderId) => {
    if (!movingItem) return;
    if (movingItem.isFolder) await moveFolder(movingItem.id, targetFolderId);
    else await moveFile(movingItem.id, targetFolderId);
  }, [movingItem, moveFolder, moveFile]);
  const currentPreviewIndex = previewFile ? imageFiles.findIndex(f => f.id === previewFile.id) : -1;
  const showFolderChrome = !viewAll && !viewShared && !isSearching;
  const displayFiles = viewShared ? shares.sharedFiles : files;
  const displayLoading = viewShared ? shares.loadingShared : filesLoading;

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-accent-primary to-accent-secondary rounded-xl flex items-center justify-center shadow-lg">
            <FolderOpen className="text-white" size={20} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">{tr('Materiały')}</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">{tr('Pliki i dokumenty')}</p>
          </div>
        </div>

        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={18} />
            <input
              type="text"
              placeholder={tr('Szukaj plików...')}
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-10 pr-10 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-primary/20 focus:border-amber-500"
            />
            {searchQuery && (
              <button onClick={handleClearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300">
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        <button onClick={() => setShowMobileFolders(!showMobileFolders)} className="lg:hidden p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
          <FolderOpen size={20} />
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Folders */}
        <div className={`${showMobileFolders ? 'fixed inset-0 z-40 bg-white dark:bg-gray-800' : 'hidden'} lg:relative lg:block lg:w-64 xl:w-72 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0`}>
          <div className="lg:hidden flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <span className="font-medium text-gray-900 dark:text-white">{tr('Foldery')}</span>
            <button onClick={() => setShowMobileFolders(false)} className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"><X size={20} /></button>
          </div>
          <div className="p-4 h-full overflow-y-auto">
            {/* „Wszystkie pliki" (płasko) */}
            <button
              onClick={() => { setViewAll(true); setViewShared(false); setSearchQuery(''); setIsSearching(false); setShowMobileFolders(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium mb-1 ${viewAll ? 'bg-accent-primary/10 text-accent-primary' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
            >
              <Layers size={16} /> {tr('Wszystkie pliki')}
            </button>
            {/* „Udostępnione mi" */}
            <button
              onClick={() => { setViewShared(true); setViewAll(false); setSearchQuery(''); setIsSearching(false); setShowMobileFolders(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium mb-2 ${viewShared ? 'bg-accent-primary/10 text-accent-primary' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
            >
              <Users2 size={16} /> {tr('Udostępnione mi')}
            </button>
            <FolderTree
              folders={folders}
              selectedId={(viewAll || viewShared) ? null : selectedFolderId}
              onSelect={openFolder}
              onCreateFolder={handleCreateFolder}
              onRenameFolder={handleRenameFolder}
              onDeleteFolder={handleDeleteFolder}
              canEdit={canEdit}
              loading={foldersLoading}
            />
          </div>
        </div>

        {/* Main area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
          {/* Uploader (nie w trybie „wszystkie"/szukaniu — nie wiadomo do którego folderu) */}
          {canEdit && showFolderChrome && (
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <FileUploader onUpload={handleUpload} uploading={uploading} progress={uploadProgress} />
            </div>
          )}

          {/* Breadcrumbs / kontekst */}
          <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-800/60 flex items-center gap-1 text-sm overflow-x-auto">
            {viewShared ? (
              <span className="flex items-center gap-1.5 font-medium text-gray-700 dark:text-gray-200"><Users2 size={15} /> {tr('Udostępnione mi')}</span>
            ) : viewAll ? (
              <span className="flex items-center gap-1.5 font-medium text-gray-700 dark:text-gray-200"><Layers size={15} /> {tr('Wszystkie pliki')}</span>
            ) : isSearching ? (
              <span className="text-amber-700 dark:text-amber-300">{tr('Wyniki wyszukiwania')}: <strong>"{searchQuery}"</strong> <button onClick={handleClearSearch} className="ml-1 underline">{tr('Wyczyść')}</button></span>
            ) : (
              <>
                <button onClick={() => openFolder(null)} className="flex items-center gap-1 text-gray-500 hover:text-accent-primary"><Home size={14} /> {tr('Główny')}</button>
                {breadcrumb.map((f) => (
                  <span key={f.id} className="flex items-center gap-1">
                    <ChevronRight size={14} className="text-gray-300" />
                    <button onClick={() => openFolder(f.id)} className="text-gray-600 dark:text-gray-300 hover:text-accent-primary max-w-[160px] truncate">{f.name}</button>
                  </span>
                ))}
              </>
            )}
            <div className="ml-auto flex items-center gap-1 shrink-0 pl-2">
              <button onClick={() => setLayout('list')} title={tr('Lista')} className={`p-1.5 rounded-lg ${layout === 'list' ? 'bg-accent-primary/10 text-accent-primary' : 'text-gray-400 hover:text-gray-600'}`}><ListIcon size={16} /></button>
              <button onClick={() => setLayout('grid')} title={tr('Siatka')} className={`p-1.5 rounded-lg ${layout === 'grid' ? 'bg-accent-primary/10 text-accent-primary' : 'text-gray-400 hover:text-gray-600'}`}><LayoutGrid size={16} /></button>
            </div>
          </div>

          {/* Zawartość */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Podfoldery jako kafle (jak w Drive) */}
            {showFolderChrome && subfolders.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {subfolders.map((f) => (
                  <button key={f.id} onClick={() => openFolder(f.id)}
                    onDragOver={(e) => { if (draggedFileId) { e.preventDefault(); } }}
                    onDrop={(e) => { e.preventDefault(); dropFileToFolder(f.id); }}
                    className={`group flex items-center gap-2 p-3 rounded-xl border bg-white dark:bg-gray-800 hover:border-accent-primary/50 hover:shadow-sm transition text-left ${draggedFileId ? 'border-dashed border-accent-primary/60' : 'border-gray-200 dark:border-gray-700'}`}>
                    <div className="w-9 h-9 rounded-lg bg-accent-primary/10 text-accent-primary flex items-center justify-center shrink-0"><Folder size={18} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{f.name}</div>
                      {f.children?.length > 0 && <div className="text-[11px] text-gray-400">{f.children.length} {tr('podfolderów')}</div>}
                    </div>
                    {canEdit && (
                      <span className="flex items-center opacity-0 group-hover:opacity-100">
                        <span onClick={(e) => { e.stopPropagation(); setMovingItem({ id: f.id, name: f.name, isFolder: true }); }} className="text-gray-400 hover:text-accent-primary p-1" title={tr('Przenieś')}><FolderInput size={13} /></span>
                        <span onClick={(e) => { e.stopPropagation(); setSharingItem({ folder_id: f.id, name: f.name }); }} className="text-gray-400 hover:text-accent-primary p-1" title={tr('Udostępnij')}><Share2 size={13} /></span>
                        <span onClick={(e) => { e.stopPropagation(); handleRenameFolder(f.id, f.name); }} className="text-gray-400 hover:text-accent-primary p-1" title={tr('Zmień nazwę')}><Pencil size={13} /></span>
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <FileList
              files={displayFiles}
              loading={displayLoading}
              layout={layout}
              onPreview={handlePreviewFile}
              onDownload={downloadFile}
              onDelete={viewShared ? sharedDelete : ((canEdit) ? handleDeleteFile : undefined)}
              onRename={viewShared ? sharedRename : ((canEdit) ? handleRenameFile : undefined)}
              onShare={(!viewShared && canEdit) ? handleShareFile : undefined}
              onMove={(!viewShared && canEdit) ? handleMoveFile : undefined}
              onDragStartFile={(!viewShared && canEdit) ? ((file) => setDraggedFileId(file.id)) : undefined}
              onDragEndFile={() => setDraggedFileId(null)}
              sharedFileIds={viewShared ? undefined : shares.sharedFileIds}
              editableFileIds={viewShared ? shares.editableFileIds : undefined}
              canDelete={viewShared ? true : canEdit}
              getFileUrl={getFileUrl}
              emptyMessage={viewShared ? tr('Nikt nie udostępnił Ci jeszcze plików.') : tr('Brak plików w tym folderze')}
            />
          </div>
        </div>
      </div>

      <FolderModal
        isOpen={showFolderModal}
        onClose={() => { setShowFolderModal(false); setEditingFolder(null); setParentFolderForNew(null); }}
        onSubmit={handleFolderModalSubmit}
        mode={editingFolder ? 'rename' : 'create'}
        initialName={editingFolder?.name || ''}
        parentFolderName={parentFolderForNew ? (flatFolders.find(f => f.id === parentFolderForNew)?.name || null) : null}
      />

      <ShareModal
        isOpen={!!sharingItem}
        onClose={() => setSharingItem(null)}
        item={sharingItem}
        shares={shares}
      />

      <MoveModal
        isOpen={!!movingItem}
        onClose={() => setMovingItem(null)}
        item={movingItem}
        folders={folders}
        onMove={handleMove}
      />

      <FilePreviewModal
        isOpen={!!previewFile}
        onClose={() => { setPreviewFile(null); setPreviewUrl(null); }}
        file={previewFile}
        fileUrl={previewUrl}
        onDownload={downloadFile}
        onDelete={handleDeleteFile}
        canDelete={canEdit}
        onPrev={() => handlePreviewNavigation('prev')}
        onNext={() => handlePreviewNavigation('next')}
        hasPrev={currentPreviewIndex > 0}
        hasNext={currentPreviewIndex >= 0 && currentPreviewIndex < imageFiles.length - 1}
      />
    </div>
  );
}
