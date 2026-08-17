import React, { useState } from 'react';
import { Plus, BarChart3, Pencil, Trash2, Loader2, X, Check, Lock, Unlock } from 'lucide-react';
import Modal from '../../components/Modal';
import { useModuleRecords } from '../../hooks/useModuleRecords';
import { tr } from '../../i18n';
import { toast } from '../../lib/toast';

// Gotowy element „Ankieta / głosowanie" — pytanie + opcje, głosy zapisywane w rekordzie
// (data.voters = { email: optionId }). Dane w module_records (collection_key='polls').
const uid = () => Math.random().toString(36).slice(2, 9);

function PollModal({ initial, onClose, onSave }) {
  const [question, setQuestion] = useState(initial?.question || '');
  const [options, setOptions] = useState(initial?.options?.length ? initial.options : [{ id: uid(), text: '' }, { id: uid(), text: '' }]);
  const [saving, setSaving] = useState(false);

  const setOpt = (id, text) => setOptions((o) => o.map((x) => (x.id === id ? { ...x, text } : x)));
  const addOpt = () => setOptions((o) => [...o, { id: uid(), text: '' }]);
  const rmOpt = (id) => setOptions((o) => (o.length > 2 ? o.filter((x) => x.id !== id) : o));

  const submit = async () => {
    const opts = options.map((o) => ({ ...o, text: o.text.trim() })).filter((o) => o.text);
    if (!question.trim() || opts.length < 2) { toast.error(tr('Podaj pytanie i min. 2 opcje')); return; }
    setSaving(true);
    await onSave({ question: question.trim(), options: opts, voters: initial?.voters || {}, closed: initial?.closed || false });
    setSaving(false);
  };

  return (
    <Modal isOpen className="flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{initial ? tr('Edytuj ankietę') : tr('Nowa ankieta')}</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-gray-500">{tr('Pytanie')}</span>
            <input value={question} onChange={(e) => setQuestion(e.target.value)}
              className="mt-1 w-full text-sm bg-gray-100 dark:bg-gray-700/50 rounded-lg px-3 py-2 outline-none" />
          </label>
          <div>
            <span className="text-xs text-gray-500">{tr('Opcje')}</span>
            <div className="space-y-2 mt-1">
              {options.map((o, i) => (
                <div key={o.id} className="flex items-center gap-2">
                  <input value={o.text} onChange={(e) => setOpt(o.id, e.target.value)} placeholder={`${tr('Opcja')} ${i + 1}`}
                    className="flex-1 text-sm bg-gray-100 dark:bg-gray-700/50 rounded-lg px-3 py-2 outline-none" />
                  {options.length > 2 && <button onClick={() => rmOpt(o.id)} className="p-1.5 text-gray-400 hover:text-red-500"><X size={16} /></button>}
                </div>
              ))}
            </div>
            <button onClick={addOpt} className="mt-2 text-sm text-accent-primary flex items-center gap-1"><Plus size={15} /> {tr('Dodaj opcję')}</button>
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

function PollCard({ record, userKey, canEdit, onVote, onEdit, onToggleClosed, onDelete }) {
  const d = record.data || {};
  const voters = d.voters || {};
  const myVote = userKey ? voters[userKey] : null;
  const counts = {};
  Object.values(voters).forEach((oid) => { counts[oid] = (counts[oid] || 0) + 1; });
  const total = Object.keys(voters).length;
  const canSee = !!myVote || d.closed || canEdit; // wyniki po zagłosowaniu / zamknięciu / dla edytora

  return (
    <div className="group relative rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 bg-gradient-to-br from-accent-primary to-accent-secondary"><BarChart3 size={18} /></div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100">{d.question}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{total} {tr('głosów')}{d.closed ? ` · ${tr('zamknięta')}` : ''}</p>
        </div>
        {canEdit && (
          <div className="opacity-0 group-hover:opacity-100 flex gap-1 shrink-0">
            <button onClick={() => onToggleClosed(record)} title={d.closed ? tr('Otwórz') : tr('Zamknij')} className="p-1.5 text-gray-400 hover:text-accent-primary rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">{d.closed ? <Unlock size={14} /> : <Lock size={14} />}</button>
            <button onClick={() => onEdit(record)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><Pencil size={14} /></button>
            <button onClick={() => { if (confirm(tr('Usunąć tę ankietę?'))) onDelete(record.id); }} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10"><Trash2 size={14} /></button>
          </div>
        )}
      </div>
      <div className="space-y-2">
        {(d.options || []).map((o) => {
          const c = counts[o.id] || 0;
          const pct = total ? Math.round((c / total) * 100) : 0;
          const mine = myVote === o.id;
          const disabled = d.closed || !userKey;
          return (
            <button key={o.id} onClick={() => !disabled && onVote(record, o.id)} disabled={disabled}
              className={`relative w-full text-left rounded-xl border overflow-hidden transition ${mine ? 'border-accent-primary' : 'border-gray-200 dark:border-gray-700'} ${disabled ? '' : 'hover:border-accent-primary/60'}`}>
              {canSee && <div className="absolute inset-y-0 left-0 bg-accent-primary/10 dark:bg-accent-primary/20" style={{ width: `${pct}%` }} />}
              <div className="relative flex items-center gap-2 px-3 py-2.5">
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${mine ? 'border-accent-primary bg-accent-primary text-white' : 'border-gray-300 dark:border-gray-600'}`}>{mine && <Check size={11} />}</div>
                <span className="flex-1 text-sm text-gray-800 dark:text-gray-100">{o.text}</span>
                {canSee && <span className="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0">{pct}%</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function PollTab({ moduleKey, moduleId, tabId, currentUserEmail, canEdit = true }) {
  const { records, loading, create, update, remove } = useModuleRecords({ moduleId, moduleKey, tabId, collectionKey: 'polls' });
  const [modal, setModal] = useState(null);

  const save = async (data) => { if (modal?.record) await update(modal.record.id, data); else await create(data); setModal(null); };
  const vote = (record, optionId) => {
    if (!currentUserEmail) return;
    const voters = { ...(record.data?.voters || {}) };
    voters[currentUserEmail] = optionId;
    update(record.id, { ...record.data, voters });
  };
  const toggleClosed = (record) => update(record.id, { ...record.data, closed: !record.data?.closed });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">{tr('Zbieraj głosy i opinie zespołu.')}</p>
        {canEdit && (
          <button onClick={() => setModal({})} className="flex items-center gap-2 bg-gradient-to-r from-accent-primary to-accent-secondary text-white px-4 py-2.5 rounded-xl font-medium shadow-md hover:shadow-lg hover:opacity-90">
            <Plus size={18} /> {tr('Nowa ankieta')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-400"><Loader2 className="animate-spin" size={26} /></div>
      ) : records.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
          <BarChart3 size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">{canEdit ? tr('Brak ankiet. Utwórz pierwszą.') : tr('Brak ankiet.')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {records.map((r) => (
            <PollCard key={r.id} record={r} userKey={currentUserEmail} canEdit={canEdit}
              onVote={vote} onEdit={(rec) => setModal({ record: rec })} onToggleClosed={toggleClosed} onDelete={remove} />
          ))}
        </div>
      )}

      {modal && <PollModal initial={modal.record?.data} onClose={() => setModal(null)} onSave={save} />}
    </div>
  );
}
