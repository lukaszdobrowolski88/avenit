import React, { useState } from 'react';
import { Folder, FolderOpen, ChevronRight, ChevronDown, Plus, Edit2, Trash2, MoreVertical } from 'lucide-react';

function FolderItem({ folder, level = 0, selectedId, onSelect, onCreateFolder, onRenameFolder, onDeleteFolder, canEdit }) {
  const [isExpanded, setIsExpanded] = useState(level === 0);
  const [showMenu, setShowMenu] = useState(false);
  const hasChildren = folder.children && folder.children.length > 0;
  const isSelected = selectedId === folder.id;

  const handleToggle = (e) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const handleSelect = () => {
    onSelect(folder.id);
  };

  const handleMenuAction = (action, e) => {
    e.stopPropagation();
    setShowMenu(false);

    switch (action) {
      case 'create':
        onCreateFolder(folder.id);
        break;
      case 'rename':
        onRenameFolder(folder.id, folder.name);
        break;
      case 'delete':
        onDeleteFolder(folder.id, folder.name);
        break;
    }
  };

  return (
    <div>
      <div
        onClick={handleSelect}
        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer group transition-all duration-200
          ${isSelected
            ? 'bg-gradient-to-r from-pink-100 to-orange-100 dark:from-pink-900/40 dark:to-orange-900/40 text-pink-700 dark:text-pink-300'
            : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
          }`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
      >
        {/* Expand/Collapse button */}
        <button
          onClick={handleToggle}
          className={`p-0.5 rounded transition-all duration-200 ${hasChildren ? 'hover:bg-gray-200 dark:hover:bg-gray-700' : 'invisible'}`}
        >
          {isExpanded ? (
            <ChevronDown size={14} className="text-gray-500" />
          ) : (
            <ChevronRight size={14} className="text-gray-500" />
          )}
        </button>

        {/* Folder icon */}
        {isExpanded ? (
          <FolderOpen size={16} className={isSelected ? 'text-pink-500' : 'text-yellow-500'} />
        ) : (
          <Folder size={16} className={isSelected ? 'text-pink-500' : 'text-yellow-500'} />
        )}

        {/* Folder name */}
        <span className="flex-1 text-sm font-medium truncate">{folder.name}</span>

        {/* Action menu */}
        {canEdit && (
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200"
            >
              <MoreVertical size={14} className="text-gray-500" />
            </button>

            {showMenu && (
              <div
                className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg py-1 min-w-[140px]"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={(e) => handleMenuAction('create', e)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <Plus size={14} />
                  Nowy podfolder
                </button>
                <button
                  onClick={(e) => handleMenuAction('rename', e)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <Edit2 size={14} />
                  Zmień nazwę
                </button>
                <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                <button
                  onClick={(e) => handleMenuAction('delete', e)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                >
                  <Trash2 size={14} />
                  Usuń
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div>
          {folder.children.map((child) => (
            <FolderItem
              key={child.id}
              folder={child}
              level={level + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onCreateFolder={onCreateFolder}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FolderTree({
  folders,
  selectedId,
  onSelect,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  canEdit = false,
  loading = false
}) {
  // Zamknij menu po kliknięciu poza nim
  React.useEffect(() => {
    const handleClickOutside = () => {
      // Menu zamknie się przez własny state w FolderItem
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 rounded" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded flex-1" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="py-2">
      {/* Wszystkie pliki (root) */}
      <div
        onClick={() => onSelect(null)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 mb-1
          ${selectedId === null
            ? 'bg-gradient-to-r from-pink-100 to-orange-100 dark:from-pink-900/40 dark:to-orange-900/40 text-pink-700 dark:text-pink-300'
            : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
          }`}
      >
        <Folder size={16} className={selectedId === null ? 'text-pink-500' : 'text-gray-500'} />
        <span className="text-sm font-medium">Wszystkie pliki</span>
      </div>

      {/* Separator */}
      {folders.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-700 my-2 mx-2" />
      )}

      {/* Folder tree */}
      {folders.map((folder) => (
        <FolderItem
          key={folder.id}
          folder={folder}
          selectedId={selectedId}
          onSelect={onSelect}
          onCreateFolder={onCreateFolder}
          onRenameFolder={onRenameFolder}
          onDeleteFolder={onDeleteFolder}
          canEdit={canEdit}
        />
      ))}

      {/* Przycisk dodawania folderu głównego */}
      {canEdit && (
        <button
          onClick={() => onCreateFolder(null)}
          className="flex items-center gap-2 w-full px-3 py-2 mt-2 text-sm text-gray-500 dark:text-gray-400 hover:text-pink-600 dark:hover:text-pink-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all duration-200"
        >
          <Plus size={14} />
          Nowy folder
        </button>
      )}
    </div>
  );
}
