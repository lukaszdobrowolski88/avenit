import React, { useMemo } from 'react';
import { Paperclip, FileText, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { applyView } from '../lib/viewData';
import EmptyState from '../../../components/EmptyState';
import { thumbUrl } from '../../../lib/imageThumb';
import { tr } from '../../../i18n';

const isImage = (name = '', url = '') => /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name) || /\.(png|jpe?g|gif|webp|svg|bmp)(\?|$)/i.test(url);
// Tylko adresy http(s) i ścieżki względne — „javascript:” w zapisanym linku nie może się wykonać.
const safeUrl = (u) => (typeof u === 'string' && (/^https?:\/\//i.test(u) || /^\/(?!\/)/.test(u)) ? u : null);

// Widok Galeria plików — wszystkie pliki z kolumn typu „Pliki”.
export default function FilesGalleryView({ data, config, onOpenItem }) {
  const fileCols = data.columns.filter(c => c.type === 'files');
  const items = useMemo(() => applyView(data.items, data.columns, config), [data.items, data.columns, config]);

  const files = useMemo(() => {
    const out = [];
    for (const it of items) {
      for (const col of fileCols) {
        (it.cells?.[col.id] || []).forEach((f, idx) => {
          // Stabilny klucz: zadanie + kolumna + plik (indeks tylko jako rozróżnienie duplikatów).
          out.push({ ...f, key: `${it.id}:${col.id}:${f.url || f.name || ''}:${idx}`, itemId: it.id, itemName: it.name });
        });
      }
    }
    return out;
  }, [items, fileCols]);

  if (fileCols.length === 0) {
    return <EmptyState icon={Paperclip} title={tr('Dodaj kolumnę typu „Pliki", aby zbierać załączniki w galerii.')} />;
  }
  if (files.length === 0) {
    return <EmptyState icon={ImageIcon} title={tr('Brak plików.')} subtitle={tr('Dodaj załączniki w kolumnie „Pliki".')} />;
  }

  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {files.map((f) => {
        const url = safeUrl(f.url);
        return (
          <li key={f.key} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="aspect-video bg-gray-100 dark:bg-gray-700/50 flex items-center justify-center overflow-hidden">
              {url && isImage(f.name, url)
                ? <img src={thumbUrl(url, 256)} alt={f.name || ''} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                : <FileText size={32} className="text-gray-300 dark:text-gray-600" aria-hidden="true" />}
            </div>
            <div className="p-2">
              {url ? (
                <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-medium text-gray-800 dark:text-gray-100 truncate hover:underline">
                  <ExternalLink size={11} className="shrink-0 text-gray-400" aria-hidden="true" /> <span className="truncate">{f.name || tr('plik')}</span>
                </a>
              ) : (
                <span className="block text-xs font-medium text-gray-800 dark:text-gray-100 truncate">{f.name || tr('plik')}</span>
              )}
              <button type="button" onClick={() => { const it = data.items.find(x => x.id === f.itemId); if (it) onOpenItem(it); }}
                className="text-[11px] text-gray-500 dark:text-gray-400 truncate hover:text-gray-800 dark:hover:text-gray-200 block w-full text-left">
                {f.itemName || tr('Bez nazwy')}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
