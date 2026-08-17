import React, { useState } from 'react';
import { Plus, ExternalLink, Pencil, Trash2, Link as LinkIcon, Loader2, X } from 'lucide-react';
import Modal from '../../components/Modal';
import { useModuleRecords } from '../../hooks/useModuleRecords';
import { tr } from '../../i18n';
import { toast } from '../../lib/toast';

// Gotowy element „Szybkie linki" — konfigurowalne przyciski/odnośniki (do formularzy,
// dokumentów, narzędzi). Dane w module_records (collection_key='links'), izolowane per moduł.
const COLORS = ['#6366f1', '#00c875', '#e2445c', '#fdab3d', '#a25ddc', '#0086c0', '#ff5ac4', '#579bfc'];

function LinkModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState({
    label: initial?.label || '', url: initial?.url || '',
    description: initial?.description || '', color: initial?.color || COLORS[0],
  });
  const [saving, setSaving] = useState(false);
  const normalizeUrl = (u) => (u && !/^https?:\/\//i.test(u) && !u.startsWith('/') ? `https://${u}` : u);

  const submit = async () => {
    if (!form.label.trim() || !form.url.trim()) { toast.error(tr('Podaj nazwę i adres linku')); return; }
    setSaving(true);
    await onSave({ ...form, label: form.label.trim(), url: normalizeUrl(form.url.trim()) });
    setSaving(false);
  };

  return (
    <Modal isOpen className="flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{initial ? tr('Edytuj link') : tr('Nowy link')}</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-gray-500">{tr('Nazwa')}</span>
            <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder={tr('np. Formularz zgłoszeniowy')}
              className="mt-1 w-full text-sm bg-gray-100 dark:bg-gray-700/50 rounded-lg px-3 py-2 outline-none" />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">{tr('Adres (URL)')}</span>
            <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…"
              className="mt-1 w-full text-sm bg-gray-100 dark:bg-gray-700/50 rounded-lg px-3 py-2 outline-none" />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">{tr('Opis (opcjonalnie)')}</span>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="mt-1 w-full text-sm bg-gray-100 dark:bg-gray-700/50 rounded-lg px-3 py-2 outline-none" />
          </label>
          <div>
            <span className="text-xs text-gray-500">{tr('Kolor')}</span>
            <div className="flex gap-2 mt-1 flex-wrap">
              {COLORS.map((c) => (
                <button key={c} onClick={() => setForm({ ...form, color: c })}
                  className={`w-7 h-7 rounded-full transition ${form.color === c ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-gray-800' : ''}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="text-sm text-gray-500 px-4 py-2">{tr('Anuluj')}</button>
          <button onClick={submit} disabled={saving} className="text-sm bg-accent-primary text-white px-4 py-2 rounded-lg disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 size={15} className="animate-spin" />} {tr('Zapisz')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function LinksTab({ moduleKey, moduleId, tabId, canEdit = true }) {
  const { records, loading, create, update, remove } = useModuleRecords({ moduleId, moduleKey, tabId, collectionKey: 'links' });
  const [modal, setModal] = useState(null); // {record} | {} | null

  const save = async (data) => {
    if (modal?.record) await update(modal.record.id, data);
    else await create(data);
    setModal(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">{tr('Szybki dostęp do formularzy, dokumentów i narzędzi.')}</p>
        {canEdit && (
          <button onClick={() => setModal({})} className="flex items-center gap-2 bg-gradient-to-r from-accent-primary to-accent-secondary text-white px-4 py-2.5 rounded-xl font-medium shadow-md hover:shadow-lg hover:opacity-90">
            <Plus size={18} /> {tr('Nowy link')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-400"><Loader2 className="animate-spin" size={26} /></div>
      ) : records.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
          <LinkIcon size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">{canEdit ? tr('Brak linków. Dodaj pierwszy szybki dostęp.') : tr('Brak linków.')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {records.map((r) => {
            const d = r.data || {};
            return (
              <div key={r.id} className="group relative rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 hover:shadow-lg transition-shadow">
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white shrink-0" style={{ backgroundColor: d.color || '#6366f1' }}>
                    <ExternalLink size={20} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-800 dark:text-gray-100 truncate">{d.label}</h3>
                    {d.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{d.description}</p>}
                    <p className="text-[11px] text-accent-primary mt-1 truncate">{d.url}</p>
                  </div>
                </a>
                {canEdit && (
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1">
                    <button onClick={() => setModal({ record: r })} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><Pencil size={14} /></button>
                    <button onClick={() => { if (confirm(tr('Usunąć ten link?'))) remove(r.id); }} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10"><Trash2 size={14} /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modal && <LinkModal initial={modal.record?.data} onClose={() => setModal(null)} onSave={save} />}
    </div>
  );
}
