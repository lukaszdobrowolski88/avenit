import React, { useMemo, useState } from 'react';
import { X, FolderInput, Home, Folder } from 'lucide-react';
import { tr } from '../../../i18n';

// Okno „Przenieś do…" — wybór folderu docelowego (płaska, wcięta lista).
// Dla folderów blokuje przeniesienie do samego siebie lub swojego potomka.
export default function MoveModal({ isOpen, onClose, item, folders, onMove }) {
  const [busy, setBusy] = useState(false);

  // Spłaszcz drzewo z poziomem wcięcia.
  const flat = useMemo(() => {
    const out = [];
    const walk = (list, depth) => (list || []).forEach((f) => { out.push({ ...f, depth }); walk(f.children, depth + 1); });
    walk(folders, 0);
    return out;
  }, [folders]);

  // Zbiór niedozwolonych celów (folder + jego potomkowie) przy przenoszeniu folderu.
  const blocked = useMemo(() => {
    const set = new Set();
    if (!item?.isFolder) return set;
    const mark = (id) => {
      set.add(id);
      flat.filter((f) => f.parent_id === id).forEach((c) => mark(c.id));
    };
    mark(item.id);
    return set;
  }, [item, flat]);

  if (!isOpen || !item) return null;

  const move = async (targetId) => {
    setBusy(true);
    try { await onMove(targetId); onClose(); }
    catch (e) { window.alert(tr('Nie udało się przenieść: ') + e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl border border-gray-200 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 min-w-0">
            <FolderInput size={18} className="text-accent-primary shrink-0" />
            <h3 className="font-bold text-gray-900 dark:text-white truncate">{tr('Przenieś')}: {item.name}</h3>
          </div>
          <button onClick={onClose} className="text-gray-500 dark:text-gray-400"><X size={20} /></button>
        </div>
        <div className="p-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
          <button onClick={() => move(null)} disabled={busy} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50">
            <Home size={15} className="text-gray-400" /> {tr('Główny (bez folderu)')}
          </button>
          {flat.map((f) => {
            const disabled = busy || blocked.has(f.id);
            return (
              <button key={f.id} onClick={() => move(f.id)} disabled={disabled}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ paddingLeft: `${12 + f.depth * 16}px` }}>
                <Folder size={15} className="text-accent-primary shrink-0" /> <span className="truncate">{f.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
