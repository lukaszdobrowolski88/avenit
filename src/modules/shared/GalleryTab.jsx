import React, { useState, useRef } from 'react';
import { Upload, Trash2, Image as ImageIcon, Loader2, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Modal from '../../components/Modal';
import { useModuleRecords } from '../../hooks/useModuleRecords';
import { tr } from '../../i18n';
import { toast } from '../../lib/toast';

// Gotowy element „Galeria zdjęć" — upload obrazów + siatka miniatur z podglądem
// (lightbox). Pliki trafiają do storage (bucket 'materials', ścieżka gallery/<moduleKey>/),
// metadane w module_records (collection_key='gallery').
export default function GalleryTab({ moduleKey, moduleId, tabId, canEdit = true }) {
  const { records, loading, create, remove } = useModuleRecords({ moduleId, moduleKey, tabId, collectionKey: 'gallery' });
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState(null); // index
  const fileRef = useRef(null);

  const handleFiles = async (files) => {
    const list = Array.from(files || []).filter((f) => f.type.startsWith('image/'));
    if (!list.length) return;
    setUploading(true);
    for (const file of list) {
      try {
        const ext = file.name.split('.').pop();
        const path = `gallery/${moduleKey}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('materials').upload(path, file);
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from('materials').getPublicUrl(path);
        await create({ url: pub?.publicUrl || '', storage_path: path, caption: '' });
      } catch (err) {
        toast.error(tr('Błąd wgrywania: ') + (err.message || err));
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const items = records.map((r) => ({ id: r.id, ...(r.data || {}) }));

  const closeLightbox = () => setLightbox(null);
  const nav = (dir) => setLightbox((i) => (i + dir + items.length) % items.length);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">{tr('Zdjęcia i materiały wizualne zespołu.')}</p>
        {canEdit && (
          <>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="flex items-center gap-2 bg-gradient-to-r from-accent-primary to-accent-secondary text-white px-4 py-2.5 rounded-xl font-medium shadow-md hover:shadow-lg hover:opacity-90 disabled:opacity-50">
              {uploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />} {tr('Dodaj zdjęcia')}
            </button>
          </>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-400"><Loader2 className="animate-spin" size={26} /></div>
      ) : items.length === 0 ? (
        <div onClick={() => canEdit && fileRef.current?.click()}
          className={`text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl ${canEdit ? 'cursor-pointer hover:border-accent-primary/50' : ''}`}>
          <ImageIcon size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">{canEdit ? tr('Brak zdjęć. Kliknij, aby dodać pierwsze.') : tr('Brak zdjęć.')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {items.map((it, i) => (
            <div key={it.id} className="group relative aspect-square rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
              <img src={it.url} alt={it.caption || ''} loading="lazy" onClick={() => setLightbox(i)}
                className="w-full h-full object-cover cursor-pointer transition group-hover:scale-105" />
              {it.caption && <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2 text-white text-xs truncate">{it.caption}</div>}
              {canEdit && (
                <button onClick={() => { if (confirm(tr('Usunąć to zdjęcie?'))) remove(it.id); }}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 bg-black/50 text-white rounded-lg hover:bg-red-500"><Trash2 size={14} /></button>
              )}
            </div>
          ))}
        </div>
      )}

      {lightbox !== null && items[lightbox] && (
        <Modal isOpen className="flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={closeLightbox} />
          <button onClick={closeLightbox} className="absolute top-4 right-4 p-2 text-white/80 hover:text-white z-10"><X size={24} /></button>
          {items.length > 1 && (
            <>
              <button onClick={() => nav(-1)} className="absolute left-4 p-2 text-white/80 hover:text-white z-10"><ChevronLeft size={28} /></button>
              <button onClick={() => nav(1)} className="absolute right-4 p-2 text-white/80 hover:text-white z-10"><ChevronRight size={28} /></button>
            </>
          )}
          <img src={items[lightbox].url} alt={items[lightbox].caption || ''} className="relative max-w-[90vw] max-h-[85vh] object-contain rounded-xl" />
          {items[lightbox].caption && <div className="absolute bottom-6 text-center text-white/90 text-sm px-4">{items[lightbox].caption}</div>}
        </Modal>
      )}
    </div>
  );
}
