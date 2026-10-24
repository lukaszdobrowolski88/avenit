import React, { useEffect, useMemo, useState } from 'react';
import { GalleryVerticalEnd, Film, Check, Search } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import Spinner from '../../../components/Spinner';
import EmptyState from '../../../components/EmptyState';
import { tr } from '../../../i18n';
import { toast } from '../../../lib/toast';
import { mediaSrc } from '../lib/socialApi';
import { listLibrary, itemToMedia } from '../lib/library';

export const KIND_FILTERS = [
  { value: 'all', label: 'Wszystko' },
  { value: 'image', label: 'Zdjęcia' },
  { value: 'video', label: 'Wideo' },
];

export function filterLibrary(items, { kind = 'all', q = '' } = {}) {
  const needle = q.trim().toLowerCase();
  return (items || []).filter((it) => (kind === 'all' || it.kind === kind)
    && (!needle || [it.name, it.alt, ...(it.tags || [])].some((v) => String(v || '').toLowerCase().includes(needle))));
}

export function LibraryThumb({ item, selected, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected}
      className={`relative aspect-square rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 ${selected ? 'ring-2 ring-accent-primary ring-offset-2 ring-offset-white dark:ring-offset-gray-900' : ''}`}>
      {item.kind === 'video'
        ? <span className="w-full h-full flex flex-col items-center justify-center text-gray-500"><Film size={22} aria-hidden="true" /><span className="text-[11px] mt-1 tabular-nums">{item.duration ? `${Math.round(item.duration)} s` : tr('Wideo')}</span></span>
        : <img src={`${mediaSrc(item)}?w=256`} alt={item.alt || ''} loading="lazy" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = mediaSrc(item); }} />}
      {selected && <span className="absolute right-1.5 top-1.5 w-6 h-6 rounded-full bg-accent-primary text-white flex items-center justify-center"><Check size={14} /></span>}
    </button>
  );
}

// Wybór zdjęć/wideo z biblioteki do posta (kolejność = kolejność zaznaczania).
export default function LibraryPicker({ open, onClose, onPick, max = 10 }) {
  const [items, setItems] = useState(null);
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState([]);

  useEffect(() => {
    if (!open) return;
    setPicked([]);
    listLibrary().then(setItems).catch((e) => { toast.error(e.message); setItems([]); });
  }, [open]);

  const list = useMemo(() => filterLibrary(items, { kind, q }), [items, kind, q]);
  const toggle = (it) => setPicked((prev) => {
    if (prev.some((p) => p.id === it.id)) return prev.filter((p) => p.id !== it.id);
    if (prev.length >= max) { toast.error(tr('Najwyżej {n} plików w poście.', { n: max })); return prev; }
    return [...prev, it];
  });

  return (
    <Modal isOpen={open} onClose={onClose} size="xl" icon={GalleryVerticalEnd} title={tr('Biblioteka mediów')} zIndex={130}
      footer={<><Button variant="secondary" onClick={onClose}>{tr('Anuluj')}</Button><Button onClick={() => { onPick(picked.map(itemToMedia)); onClose(); }} disabled={!picked.length}>{picked.length ? tr('Dodaj ({n})', { n: picked.length }) : tr('Dodaj')}</Button></>}>
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
            {KIND_FILTERS.map((f) => (
              <button key={f.value} type="button" onClick={() => setKind(f.value)} aria-pressed={kind === f.value}
                className={`px-3 py-1 rounded-lg text-xs font-medium ${kind === f.value ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}>{tr(f.label)}</button>
            ))}
          </div>
          <label className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Szukaj po nazwie, opisie, etykiecie')} aria-label={tr('Szukaj')}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 pl-8 pr-3 py-2 text-sm" />
          </label>
        </div>
        {items === null ? <Spinner center /> : !list.length ? (
          <EmptyState compact icon={GalleryVerticalEnd} title={tr('Biblioteka jest pusta')} subtitle={tr('Zdjęcia z postów i wgrane w zakładce Biblioteka pojawią się tutaj.')} />
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {list.map((it) => <LibraryThumb key={it.id} item={it} selected={picked.some((p) => p.id === it.id)} onClick={() => toggle(it)} />)}
          </div>
        )}
      </div>
    </Modal>
  );
}
