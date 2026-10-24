import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GalleryVerticalEnd, Upload, FolderInput, Search, Trash2, PenSquare } from 'lucide-react';
import Button from '../../../components/Button';
import Modal from '../../../components/Modal';
import Spinner from '../../../components/Spinner';
import EmptyState from '../../../components/EmptyState';
import { useCan } from '../../../components/Can';
import { tr, appLocale } from '../../../i18n';
import { toast } from '../../../lib/toast';
import { confirmDialog } from '../../../lib/dialog';
import { mediaSrc, uploadSocialMedia } from '../lib/socialApi';
import { listLibrary, addToLibrary, updateLibraryItem, removeLibraryItem, listMaterialImages, importMaterial, itemToMedia } from '../lib/library';
import { KIND_FILTERS, filterLibrary, LibraryThumb } from './LibraryPicker';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime';
const SOURCE_LABEL = { upload: 'Wgrane', post: 'Z posta', materials: 'Z Plików' };
const inputCls = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm';

function ImportFromFiles({ open, onClose, onImported }) {
  const [files, setFiles] = useState(null);
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setPicked([]);
    listMaterialImages().then(setFiles).catch((e) => { toast.error(e.message); setFiles([]); });
  }, [open]);
  const run = async () => {
    setBusy(true);
    let ok = 0;
    for (const f of picked) {
      try { await importMaterial(f); ok += 1; } catch (e) { toast.error(`${f.name}: ${e.message}`); }
    }
    setBusy(false);
    if (ok) toast.success(tr('Zaimportowano: {n}.', { n: ok }));
    onImported();
    onClose();
  };
  return (
    <Modal isOpen={open} onClose={onClose} size="xl" icon={FolderInput} title={tr('Importuj z Plików')}
      footer={<><Button variant="secondary" onClick={onClose}>{tr('Anuluj')}</Button><Button onClick={run} loading={busy} disabled={!picked.length}>{tr('Importuj ({n})', { n: picked.length })}</Button></>}>
      <div className="p-6">
        {files === null ? <Spinner center /> : !files.length ? (
          <EmptyState compact icon={FolderInput} title={tr('Brak zdjęć w Plikach')} subtitle={tr('Widać tu zdjęcia z modułu Pliki, do których masz dostęp.')} />
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {files.map((f) => {
              const on = picked.some((p) => p.id === f.id);
              return (
                <button key={f.id} type="button" onClick={() => setPicked((prev) => (on ? prev.filter((p) => p.id !== f.id) : [...prev, f]))} aria-pressed={on} title={f.name}
                  className={`relative aspect-square rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 ${on ? 'ring-2 ring-accent-primary ring-offset-2' : ''}`}>
                  <img src={`/storage/materials/${f.storage_path}?w=256`} alt="" loading="lazy" className="w-full h-full object-cover" />
                  <span className="absolute inset-x-0 bottom-0 bg-black/55 text-white text-[10px] px-1.5 py-0.5 truncate">{f.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

function ItemDetail({ item, onClose, onSaved, onDeleted, onUse, canEdit, canDelete }) {
  const [alt, setAlt] = useState(item.alt || '');
  const [name, setName] = useState(item.name || '');
  const [tags, setTags] = useState((item.tags || []).join(', '));
  const save = async () => {
    try {
      const patch = { alt: alt.trim() || null, name: name.trim() || null, tags: tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 20) };
      await updateLibraryItem(item.id, patch);
      onSaved({ ...item, ...patch });
      onClose();
    } catch (e) { toast.error(e.message); }
  };
  const remove = async () => {
    if (!(await confirmDialog(tr('Usunąć z biblioteki? Posty, które już używają tego pliku, zostaną bez zmian.')))) return;
    try { await removeLibraryItem(item.id); onDeleted(item.id); onClose(); } catch (e) { toast.error(e.message); }
  };
  return (
    <Modal isOpen onClose={onClose} size="lg" icon={GalleryVerticalEnd} title={item.name || tr('Plik z biblioteki')}
      subtitle={`${tr(SOURCE_LABEL[item.source] || item.source)} · ${new Date(item.created_at).toLocaleDateString(appLocale())}${item.width ? ` · ${item.width}×${item.height}` : ''}`}
      footer={<>
        {canDelete && <Button variant="ghost" icon={Trash2} onClick={remove}>{tr('Usuń z biblioteki')}</Button>}
        <span className="flex-1" />
        <Button variant="outline" icon={PenSquare} onClick={() => { onUse(item); onClose(); }}>{tr('Użyj w nowym poście')}</Button>
        {canEdit ? <Button onClick={save}>{tr('Zapisz')}</Button> : <Button variant="secondary" onClick={onClose}>{tr('Zamknij')}</Button>}
      </>}>
      <div className="p-6 grid sm:grid-cols-[minmax(0,1fr)_240px] gap-5">
        <div className="rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center max-h-[420px]">
          {item.kind === 'video'
            ? <video src={mediaSrc(item)} controls className="max-h-[420px] w-full" />
            : <img src={mediaSrc(item)} alt={item.alt || ''} className="max-h-[420px] w-full object-contain" />}
        </div>
        <div className="space-y-3">
          <label className="block"><span className="text-sm font-medium text-gray-700 dark:text-gray-200">{tr('Nazwa')}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} className={`mt-1 ${inputCls}`} /></label>
          {item.kind !== 'video' && (
            <label className="block"><span className="text-sm font-medium text-gray-700 dark:text-gray-200">{tr('Tekst alternatywny')}</span>
              <textarea value={alt} onChange={(e) => setAlt(e.target.value)} disabled={!canEdit} rows={3} maxLength={1000} placeholder={tr('Opis zdjęcia dla osób niewidomych')} className={`mt-1 ${inputCls}`} /></label>
          )}
          <label className="block"><span className="text-sm font-medium text-gray-700 dark:text-gray-200">{tr('Etykiety')}</span>
            <input value={tags} onChange={(e) => setTags(e.target.value)} disabled={!canEdit} placeholder={tr('np. nabożeństwo, dzieci')} className={`mt-1 ${inputCls}`} /></label>
        </div>
      </div>
    </Modal>
  );
}

// Biblioteka mediów: zdjęcia i wideo do ponownego użycia (wgrane, z Plików, z opublikowanych postów).
export default function LibraryTab({ onCreatePost }) {
  const canCreate = useCan('res:social_media_items:create');
  const canEdit = useCan('res:social_media_items:update');
  const canDelete = useCan('res:social_media_items:delete');
  const [items, setItems] = useState(null);
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');
  const [uploading, setUploading] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const input = useRef(null);

  const load = () => listLibrary().then(setItems).catch((e) => { toast.error(e.message); setItems([]); });
  useEffect(() => { load(); }, []);
  const list = useMemo(() => filterLibrary(items, { kind, q }), [items, kind, q]);

  const upload = async (files) => {
    const arr = Array.from(files || []).filter((f) => ACCEPT.split(',').includes(f.type));
    if (!arr.length) return;
    setUploading(arr.length);
    for (const f of arr) {
      try {
        if (f.size > 50 * 1024 * 1024) throw new Error(tr('Plik jest za duży (najwyżej 50 MB): {name}', { name: f.name }));
        const it = await addToLibrary(await uploadSocialMedia(f), 'upload');
        setItems((prev) => [it, ...(prev || [])]);
      } catch (e) { toast.error(e.message); } finally { setUploading((n) => n - 1); }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
          {KIND_FILTERS.map((f) => (
            <button key={f.value} type="button" onClick={() => setKind(f.value)} aria-pressed={kind === f.value}
              className={`px-3 py-1 rounded-lg text-xs font-medium ${kind === f.value ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}>{tr(f.label)}</button>
          ))}
        </div>
        <label className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Szukaj po nazwie, opisie, etykiecie')} aria-label={tr('Szukaj')}
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 pl-8 pr-3 py-2 text-sm" />
        </label>
        <span className="flex-1" />
        {canCreate && <Button variant="outline" icon={FolderInput} onClick={() => setImportOpen(true)}>{tr('Importuj z Plików')}</Button>}
        {canCreate && <Button icon={Upload} onClick={() => input.current?.click()} loading={uploading > 0}>{tr('Wgraj')}</Button>}
        <input ref={input} type="file" multiple accept={ACCEPT} hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
      </div>
      {items === null ? <Spinner center /> : !list.length ? (
        <EmptyState icon={GalleryVerticalEnd} title={items.length ? tr('Nic nie pasuje do filtra') : tr('Biblioteka jest pusta')}
          subtitle={items.length ? tr('Zmień filtr albo wyszukiwanie.') : tr('Wgraj zdjęcia lub zaimportuj je z Plików. Media z zapisanych postów trafiają tu same.')} />
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
          {list.map((it) => <LibraryThumb key={it.id} item={it} onClick={() => setDetail(it)} />)}
        </div>
      )}
      <ImportFromFiles open={importOpen} onClose={() => setImportOpen(false)} onImported={load} />
      {detail && (
        <ItemDetail item={detail} canEdit={canEdit} canDelete={canDelete} onClose={() => setDetail(null)}
          onSaved={(it) => setItems((prev) => prev.map((x) => (x.id === it.id ? it : x)))}
          onDeleted={(id) => setItems((prev) => prev.filter((x) => x.id !== id))}
          onUse={(it) => onCreatePost({ media: [itemToMedia(it)] })} />
      )}
    </div>
  );
}
