import React, { useMemo } from 'react';
import { Paperclip, FileText, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { applyView } from '../lib/viewData';

const isImage = (name = '', url = '') => /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name) || /\.(png|jpe?g|gif|webp|svg|bmp)(\?|$)/i.test(url);

// Widok Galeria plików — wszystkie pliki z kolumn typu „Pliki".
export default function FilesGalleryView({ data, config, onOpenItem }) {
  const fileCols = data.columns.filter(c => c.type === 'files');
  const items = useMemo(() => applyView(data.items, data.columns, config), [data.items, data.columns, config]);

  const files = useMemo(() => {
    const out = [];
    for (const it of items) {
      for (const col of fileCols) {
        for (const f of (it.cells?.[col.id] || [])) {
          out.push({ ...f, itemId: it.id, itemName: it.name });
        }
      }
    }
    return out;
  }, [items, fileCols]);

  if (fileCols.length === 0) {
    return <div className="text-center py-16 text-gray-400 text-sm">Dodaj kolumnę typu „Pliki", aby zbierać załączniki w galerii.</div>;
  }
  if (files.length === 0) {
    return <div className="text-center py-16 text-gray-400 text-sm">Brak plików. Dodaj załączniki w kolumnie „Pliki".</div>;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {files.map((f, i) => (
        <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden group">
          <div className="aspect-video bg-gray-100 dark:bg-gray-700/50 flex items-center justify-center overflow-hidden">
            {isImage(f.name, f.url)
              ? <img src={f.url} alt={f.name} className="w-full h-full object-cover" />
              : <FileText size={32} className="text-gray-300 dark:text-gray-600" />}
          </div>
          <div className="p-2">
            <a href={f.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-medium text-accent-primary truncate hover:underline">
              <ExternalLink size={11} className="shrink-0" /> <span className="truncate">{f.name || 'plik'}</span>
            </a>
            <button onClick={() => onOpenItem(data.items.find(x => x.id === f.itemId))}
              className="text-[11px] text-gray-400 truncate hover:text-gray-600 dark:hover:text-gray-300 block w-full text-left">{f.itemName || 'element'}</button>
          </div>
        </div>
      ))}
    </div>
  );
}
