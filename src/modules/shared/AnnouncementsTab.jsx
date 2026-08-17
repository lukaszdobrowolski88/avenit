import React, { useState, useMemo } from 'react';
import { Plus, Pin, PinOff, Pencil, Trash2, Megaphone, Loader2, X } from 'lucide-react';
import Modal from '../../components/Modal';
import { useModuleRecords } from '../../hooks/useModuleRecords';
import { tr } from '../../i18n';
import { toast } from '../../lib/toast';

// Gotowy element „Ogłoszenia" — komunikaty z datą i przypięciem. Dane w
// module_records (collection_key='announcements'), izolowane per moduł.
function AnnModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState({
    title: initial?.title || '', body: initial?.body || '',
    date: initial?.date || '', pinned: initial?.pinned || false,
  });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!form.title.trim()) { toast.error(tr('Podaj tytuł ogłoszenia')); return; }
    setSaving(true); await onSave({ ...form, title: form.title.trim() }); setSaving(false);
  };
  return (
    <Modal isOpen className="flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{initial ? tr('Edytuj ogłoszenie') : tr('Nowe ogłoszenie')}</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-gray-500">{tr('Tytuł')}</span>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="mt-1 w-full text-sm bg-gray-100 dark:bg-gray-700/50 rounded-lg px-3 py-2 outline-none" />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">{tr('Treść')}</span>
            <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={4}
              className="mt-1 w-full text-sm bg-gray-100 dark:bg-gray-700/50 rounded-lg px-3 py-2 outline-none resize-none" />
          </label>
          <div className="flex items-center gap-4">
            <label className="flex-1">
              <span className="text-xs text-gray-500">{tr('Data (opcjonalnie)')}</span>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="mt-1 w-full text-sm bg-gray-100 dark:bg-gray-700/50 rounded-lg px-3 py-2 outline-none [color-scheme:light] dark:[color-scheme:dark]" />
            </label>
            <label className="flex items-center gap-2 mt-5 cursor-pointer">
              <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} className="accent-accent-primary" />
              <span className="text-sm text-gray-600 dark:text-gray-300">{tr('Przypięte')}</span>
            </label>
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

export default function AnnouncementsTab({ moduleKey, moduleId, tabId, canEdit = true }) {
  const { records, loading, create, update, remove } = useModuleRecords({ moduleId, moduleKey, tabId, collectionKey: 'announcements' });
  const [modal, setModal] = useState(null);

  const sorted = useMemo(() => [...records].sort((a, b) => {
    const ap = a.data?.pinned ? 1 : 0, bp = b.data?.pinned ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return (b.data?.date || b.created_at || '').localeCompare(a.data?.date || a.created_at || '');
  }), [records]);

  const save = async (data) => { if (modal?.record) await update(modal.record.id, data); else await create(data); setModal(null); };
  const togglePin = (r) => update(r.id, { ...r.data, pinned: !r.data?.pinned });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">{tr('Ważne komunikaty dla zespołu.')}</p>
        {canEdit && (
          <button onClick={() => setModal({})} className="flex items-center gap-2 bg-gradient-to-r from-accent-primary to-accent-secondary text-white px-4 py-2.5 rounded-xl font-medium shadow-md hover:shadow-lg hover:opacity-90">
            <Plus size={18} /> {tr('Nowe ogłoszenie')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-400"><Loader2 className="animate-spin" size={26} /></div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
          <Megaphone size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">{canEdit ? tr('Brak ogłoszeń. Dodaj pierwsze.') : tr('Brak ogłoszeń.')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((r) => {
            const d = r.data || {};
            return (
              <div key={r.id} className={`group relative rounded-2xl bg-white dark:bg-gray-800 border p-4 hover:shadow-lg transition-shadow ${d.pinned ? 'border-accent-primary/40 ring-1 ring-accent-primary/20' : 'border-gray-100 dark:border-gray-700'}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 ${d.pinned ? 'bg-gradient-to-br from-accent-primary to-accent-secondary' : 'bg-gray-300 dark:bg-gray-600'}`}>
                    <Megaphone size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {d.pinned && <Pin size={13} className="text-accent-primary shrink-0" />}
                      <h3 className="font-semibold text-gray-800 dark:text-gray-100 truncate">{d.title}</h3>
                    </div>
                    {d.date && <p className="text-xs text-gray-400 mt-0.5">{new Date(d.date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })}</p>}
                    {d.body && <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 whitespace-pre-wrap">{d.body}</p>}
                  </div>
                  {canEdit && (
                    <div className="opacity-0 group-hover:opacity-100 flex gap-1 shrink-0">
                      <button onClick={() => togglePin(r)} title={d.pinned ? tr('Odepnij') : tr('Przypnij')} className="p-1.5 text-gray-400 hover:text-accent-primary rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">{d.pinned ? <PinOff size={14} /> : <Pin size={14} />}</button>
                      <button onClick={() => setModal({ record: r })} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><Pencil size={14} /></button>
                      <button onClick={() => { if (confirm(tr('Usunąć to ogłoszenie?'))) remove(r.id); }} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10"><Trash2 size={14} /></button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && <AnnModal initial={modal.record?.data} onClose={() => setModal(null)} onSave={save} />}
    </div>
  );
}
