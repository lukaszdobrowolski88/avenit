import React, { useState } from 'react';
import {
  Inbox, Send, FileEdit, Trash2, AlertTriangle, Archive,
  Folder, Plus, ChevronDown, ChevronRight, Tag, Settings,
  Mail, MoreVertical, Edit2, Palette, X, User, Globe
} from 'lucide-react';

// Mapowanie typów na ikony
const FOLDER_TYPE_ICONS = {
  inbox: Inbox,
  sent: Send,
  drafts: FileEdit,
  trash: Trash2,
  spam: AlertTriangle,
  archive: Archive,
  custom: Folder
};

// Predefiniowane kolory
const LABEL_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#14b8a6', '#06b6d4',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#d946ef', '#ec4899', '#f43f5e', '#6b7280'
];

export default function MailSidebar({
  folders,
  labels,
  accounts = [],
  activeAccountId,
  onSelectAccount,
  selectedFolderId,
  selectedLabelId,
  onSelectFolder,
  onSelectLabel,
  onCreateFolder,
  onCreateLabel,
  onRenameFolder,
  onDeleteFolder,
  onUpdateLabelColor,
  onDeleteLabel,
  onOpenSettings,
  onCompose,
  loading
}) {
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const activeAccount = accounts.find(a => a.id === activeAccountId);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showNewLabel, setShowNewLabel] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#3b82f6');
  const [expandedSections, setExpandedSections] = useState({
    folders: true,
    labels: true
  });
  const [contextMenu, setContextMenu] = useState(null);

  // Foldery systemowe i niestandardowe
  const systemFolders = folders.filter(f => f.type !== 'custom');
  const customFolders = folders.filter(f => f.type === 'custom');

  // Toggle sekcji
  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Utwórz folder
  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      onCreateFolder(newFolderName.trim());
      setNewFolderName('');
      setShowNewFolder(false);
    }
  };

  // Utwórz etykietę
  const handleCreateLabel = () => {
    if (newLabelName.trim()) {
      onCreateLabel(newLabelName.trim(), newLabelColor);
      setNewLabelName('');
      setNewLabelColor('#3b82f6');
      setShowNewLabel(false);
    }
  };

  // Render folderu
  const renderFolder = (folder) => {
    const Icon = FOLDER_TYPE_ICONS[folder.type] || Folder;
    const isSelected = selectedFolderId === folder.id && !selectedLabelId;

    return (
      <div
        key={folder.id}
        onClick={() => onSelectFolder(folder.id)}
        onContextMenu={(e) => {
          if (folder.type === 'custom') {
            e.preventDefault();
            setContextMenu({ type: 'folder', item: folder, x: e.clientX, y: e.clientY });
          }
        }}
        className={`
          flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all
          ${isSelected
            ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }
        `}
      >
        <Icon
          size={18}
          style={folder.color ? { color: folder.color } : undefined}
        />
        <span className="flex-1 text-sm font-medium truncate">{folder.name}</span>
        {folder.unread_count > 0 && (
          <span className={`
            text-xs font-bold px-2 py-0.5 rounded-full
            ${isSelected
              ? 'bg-pink-200 dark:bg-pink-800 text-pink-700 dark:text-pink-300'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }
          `}>
            {folder.unread_count}
          </span>
        )}
      </div>
    );
  };

  // Render etykiety
  const renderLabel = (label) => {
    const isSelected = selectedLabelId === label.id;

    return (
      <div
        key={label.id}
        onClick={() => onSelectLabel(label.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({ type: 'label', item: label, x: e.clientX, y: e.clientY });
        }}
        className={`
          flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all
          ${isSelected
            ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }
        `}
      >
        <Tag size={16} style={{ color: label.color }} />
        <span className="flex-1 text-sm font-medium truncate">{label.name}</span>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700">
      {/* Account Switcher */}
      {accounts.length > 1 && (
        <div className="p-3 border-b border-gray-200 dark:border-gray-700">
          <div className="relative">
            <button
              onClick={() => setShowAccountPicker(!showAccountPicker)}
              className="w-full flex items-center gap-3 px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                activeAccount?.account_type === 'external'
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400'
              }`}>
                {activeAccount?.account_type === 'external' ? <Globe size={16} /> : <User size={16} />}
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {activeAccount?.external_email || activeAccount?.user_email || 'Konto'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {activeAccount?.account_type === 'external' ? 'Zewnętrzne' : 'Wewnętrzne'}
                </p>
              </div>
              <ChevronDown size={16} className={`text-gray-400 transition-transform ${showAccountPicker ? 'rotate-180' : ''}`} />
            </button>

            {/* Account Picker Dropdown */}
            {showAccountPicker && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowAccountPicker(false)} />
                <div className="absolute top-full left-0 right-0 mt-1 z-40 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-1">
                  {accounts.map(account => (
                    <button
                      key={account.id}
                      onClick={() => {
                        onSelectAccount(account.id);
                        setShowAccountPicker(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 ${
                        account.id === activeAccountId ? 'bg-pink-50 dark:bg-pink-900/20' : ''
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        account.account_type === 'external'
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                          : 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400'
                      }`}>
                        {account.account_type === 'external' ? <Globe size={16} /> : <User size={16} />}
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {account.external_email || account.user_email}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {account.account_type === 'external' ? 'Zewnętrzne' : 'Wewnętrzne'}
                        </p>
                      </div>
                      {account.id === activeAccountId && (
                        <div className="w-2 h-2 bg-pink-500 rounded-full" />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={onCompose}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white font-semibold rounded-xl shadow-lg shadow-pink-500/25 transition-all"
        >
          <Mail size={20} />
          <span>Nowa wiadomość</span>
        </button>
      </div>

      {/* Foldery */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* Foldery systemowe */}
        <div className="mb-4">
          {systemFolders.map(renderFolder)}
        </div>

        {/* Foldery niestandardowe */}
        {customFolders.length > 0 && (
          <div className="mb-4">
            <div
              onClick={() => toggleSection('folders')}
              className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-300"
            >
              {expandedSections.folders ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span>Foldery</span>
            </div>
            {expandedSections.folders && customFolders.map(renderFolder)}
          </div>
        )}

        {/* Nowy folder */}
        {showNewFolder ? (
          <div className="px-3 py-2 mb-4">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder();
                if (e.key === 'Escape') setShowNewFolder(false);
              }}
              placeholder="Nazwa folderu..."
              autoFocus
              className="w-full px-3 py-2 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent outline-none"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleCreateFolder}
                className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-pink-500 hover:bg-pink-600 rounded-lg"
              >
                Utwórz
              </button>
              <button
                onClick={() => setShowNewFolder(false)}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
              >
                Anuluj
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowNewFolder(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-pink-500 dark:hover:text-pink-400 transition-colors"
          >
            <Plus size={16} />
            <span>Nowy folder</span>
          </button>
        )}

        {/* Etykiety */}
        <div className="mt-4">
          <div
            onClick={() => toggleSection('labels')}
            className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-300"
          >
            {expandedSections.labels ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>Etykiety</span>
          </div>

          {expandedSections.labels && (
            <>
              {labels.map(renderLabel)}

              {/* Nowa etykieta */}
              {showNewLabel ? (
                <div className="px-3 py-2">
                  <input
                    type="text"
                    value={newLabelName}
                    onChange={(e) => setNewLabelName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateLabel();
                      if (e.key === 'Escape') setShowNewLabel(false);
                    }}
                    placeholder="Nazwa etykiety..."
                    autoFocus
                    className="w-full px-3 py-2 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent outline-none"
                  />
                  <div className="flex flex-wrap gap-1 mt-2">
                    {LABEL_COLORS.map(color => (
                      <button
                        key={color}
                        onClick={() => setNewLabelColor(color)}
                        className={`w-5 h-5 rounded-full transition-transform ${newLabelColor === color ? 'ring-2 ring-offset-2 ring-pink-500 scale-110' : ''}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={handleCreateLabel}
                      className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-pink-500 hover:bg-pink-600 rounded-lg"
                    >
                      Utwórz
                    </button>
                    <button
                      onClick={() => setShowNewLabel(false)}
                      className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                    >
                      Anuluj
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewLabel(true)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-pink-500 dark:hover:text-pink-400 transition-colors"
                >
                  <Plus size={16} />
                  <span>Nowa etykieta</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Footer - Ustawienia */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          <Settings size={18} />
          <span>Ustawienia poczty</span>
        </button>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="fixed z-50 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {contextMenu.type === 'folder' && (
              <>
                <button
                  onClick={() => {
                    const newName = prompt('Nowa nazwa:', contextMenu.item.name);
                    if (newName) onRenameFolder(contextMenu.item.id, newName);
                    setContextMenu(null);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Edit2 size={14} />
                  <span>Zmień nazwę</span>
                </button>
                <button
                  onClick={() => {
                    if (confirm('Czy na pewno usunąć folder?')) {
                      onDeleteFolder(contextMenu.item.id);
                    }
                    setContextMenu(null);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <Trash2 size={14} />
                  <span>Usuń</span>
                </button>
              </>
            )}
            {contextMenu.type === 'label' && (
              <>
                <div className="px-3 py-2">
                  <p className="text-xs text-gray-500 mb-2">Kolor:</p>
                  <div className="flex flex-wrap gap-1">
                    {LABEL_COLORS.map(color => (
                      <button
                        key={color}
                        onClick={() => {
                          onUpdateLabelColor(contextMenu.item.id, color);
                          setContextMenu(null);
                        }}
                        className={`w-5 h-5 rounded-full ${contextMenu.item.color === color ? 'ring-2 ring-offset-1 ring-pink-500' : ''}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
                <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                <button
                  onClick={() => {
                    if (confirm('Czy na pewno usunąć etykietę?')) {
                      onDeleteLabel(contextMenu.item.id);
                    }
                    setContextMenu(null);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <Trash2 size={14} />
                  <span>Usuń</span>
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
