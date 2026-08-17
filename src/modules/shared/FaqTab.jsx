import React, { useState } from 'react';
import { Plus, ChevronDown, Pencil, Trash2, HelpCircle, Loader2, X } from 'lucide-react';
import Modal from '../../components/Modal';
import { useModuleRecords } from '../../hooks/useModuleRecords';
import { tr } from '../../i18n';
import { toast } from '../../lib/toast';

// Gotowy element „FAQ" — pytania i odpowiedzi (akordeon). Dane w module_records
// (collection_key='faq'), izolowane per moduł.
function FaqModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState({ question: initial?.question || '', answer: initial?.answer || '' });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!form.question.trim()) { toast.error(tr('Podaj pytanie')); return; }
    setSaving(true); await onSave({ ...form, question: form.question.trim() }); setSaving(false);
  };
  return (
    <Modal isOpen className="flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{initial ? tr('Edytuj pytanie') : tr('Nowe pytanie')}</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-gray-500">{tr('Pytanie')}</span>
            <input value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })}
              className="mt-1 w-full text-sm bg-gray-100 dark:bg-gray-700/50 rounded-lg px-3 py-2 outline-none" />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">{tr('Odpowiedź')}</span>
            <textarea value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} rows={4}
              className="mt-1 w-full text-sm bg-gray-100 dark:bg-gray-700/50 rounded-lg px-3 py-2 outline-none resize-none" />
          </label>
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

export default function FaqTab({ moduleKey, moduleId, tabId, canEdit = true }) {
  const { records, loading, create, update, remove } = useModuleRecords({ moduleId, moduleKey, tabId, collectionKey: 'faq' });
  const [modal, setModal] = useState(null);
  const [open, setOpen] = useState(new Set());

  const toggle = (id) => setOpen((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const save = async (data) => { if (modal?.record) await update(modal.record.id, data); else await create(data); setModal(null); };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">{tr('Najczęściej zadawane pytania.')}</p>
        {canEdit && (
          <button onClick={() => setModal({})} className="flex items-center gap-2 bg-gradient-to-r from-accent-primary to-accent-secondary text-white px-4 py-2.5 rounded-xl font-medium shadow-md hover:shadow-lg hover:opacity-90">
            <Plus size={18} /> {tr('Nowe pytanie')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-400"><Loader2 className="animate-spin" size={26} /></div>
      ) : records.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
          <HelpCircle size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">{canEdit ? tr('Brak pytań. Dodaj pierwsze.') : tr('Brak pytań.')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map((r) => {
            const d = r.data || {};
            const isOpen = open.has(r.id);
            return (
              <div key={r.id} className="group rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 overflow-hidden">
                <button onClick={() => toggle(r.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                  <ChevronDown size={18} className={`text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  <span className="flex-1 font-medium text-gray-800 dark:text-gray-100">{d.question}</span>
                  {canEdit && (
                    <span className="opacity-0 group-hover:opacity-100 flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setModal({ record: r })} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><Pencil size={14} /></button>
                      <button onClick={() => { if (confirm(tr('Usunąć to pytanie?'))) remove(r.id); }} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10"><Trash2 size={14} /></button>
                    </span>
                  )}
                </button>
                {isOpen && d.answer && <div className="px-4 pb-4 pl-10 text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{d.answer}</div>}
              </div>
            );
          })}
        </div>
      )}

      {modal && <FaqModal initial={modal.record?.data} onClose={() => setModal(null)} onSave={save} />}
    </div>
  );
}
