import React, { useState, useMemo } from 'react';
import { Plus, Phone, Mail, Pencil, Trash2, Contact, Loader2, X, Search } from 'lucide-react';
import Modal from '../../components/Modal';
import { useModuleRecords } from '../../hooks/useModuleRecords';
import { tr } from '../../i18n';

// Gotowy element „Lista kontaktów" — prosta baza kontaktów per moduł.
// Dane w module_records (collection_key='contacts').
const AVATAR_COLORS = ['#6366f1', '#00c875', '#e2445c', '#fdab3d', '#a25ddc', '#0086c0', '#ff5ac4'];
const colorFor = (s) => AVATAR_COLORS[(s || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
const initials = (n) => (n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

function ContactModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState({
    name: initial?.name || '', role: initial?.role || '', phone: initial?.phone || '',
    email: initial?.email || '', notes: initial?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!form.name.trim()) { alert(tr('Podaj imię i nazwisko')); return; }
    setSaving(true); await onSave({ ...form, name: form.name.trim() }); setSaving(false);
  };
  const field = (key, label, placeholder, type = 'text') => (
    <label className="block">
      <span className="text-xs text-gray-500">{label}</span>
      <input type={type} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={placeholder}
        className="mt-1 w-full text-sm bg-gray-100 dark:bg-gray-700/50 rounded-lg px-3 py-2 outline-none" />
    </label>
  );

  return (
    <Modal isOpen className="flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{initial ? tr('Edytuj kontakt') : tr('Nowy kontakt')}</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          {field('name', tr('Imię i nazwisko'), tr('np. Jan Kowalski'))}
          {field('role', tr('Rola / funkcja'), tr('np. Lider grupy'))}
          <div className="grid grid-cols-2 gap-3">
            {field('phone', tr('Telefon'), '+48…', 'tel')}
            {field('email', 'E-mail', 'jan@…', 'email')}
          </div>
          <label className="block">
            <span className="text-xs text-gray-500">{tr('Notatki')}</span>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2}
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

export default function ContactsTab({ moduleKey, moduleId, tabId, canEdit = true }) {
  const { records, loading, create, update, remove } = useModuleRecords({ moduleId, moduleKey, tabId, collectionKey: 'contacts' });
  const [modal, setModal] = useState(null);
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const term = q.toLowerCase();
    return records.filter((r) => {
      const d = r.data || {};
      return !term || [d.name, d.role, d.phone, d.email].some((v) => (v || '').toLowerCase().includes(term));
    });
  }, [records, q]);

  const save = async (data) => {
    if (modal?.record) await update(modal.record.id, data); else await create(data);
    setModal(null);
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 flex-1 max-w-sm bg-gray-100 dark:bg-gray-800 rounded-xl px-3 py-2">
          <Search size={16} className="text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Szukaj kontaktu…')}
            className="flex-1 bg-transparent text-sm outline-none text-gray-800 dark:text-gray-100" />
        </div>
        {canEdit && (
          <button onClick={() => setModal({})} className="flex items-center gap-2 bg-gradient-to-r from-accent-primary to-accent-secondary text-white px-4 py-2.5 rounded-xl font-medium shadow-md hover:shadow-lg hover:opacity-90 shrink-0">
            <Plus size={18} /> {tr('Nowy kontakt')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-400"><Loader2 className="animate-spin" size={26} /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
          <Contact size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">{records.length === 0 ? (canEdit ? tr('Brak kontaktów. Dodaj pierwszy.') : tr('Brak kontaktów.')) : tr('Brak wyników.')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((r) => {
            const d = r.data || {};
            return (
              <div key={r.id} className="group relative rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 hover:shadow-lg transition-shadow">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-semibold shrink-0" style={{ backgroundColor: colorFor(d.name) }}>{initials(d.name)}</div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-gray-800 dark:text-gray-100 truncate">{d.name}</h3>
                    {d.role && <p className="text-xs text-gray-400 truncate">{d.role}</p>}
                    <div className="mt-2 space-y-1">
                      {d.phone && <a href={`tel:${d.phone}`} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 hover:text-accent-primary"><Phone size={12} /> {d.phone}</a>}
                      {d.email && <a href={`mailto:${d.email}`} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 hover:text-accent-primary truncate"><Mail size={12} /> <span className="truncate">{d.email}</span></a>}
                    </div>
                    {d.notes && <p className="text-xs text-gray-400 mt-2 line-clamp-2">{d.notes}</p>}
                  </div>
                </div>
                {canEdit && (
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-1">
                    <button onClick={() => setModal({ record: r })} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><Pencil size={14} /></button>
                    <button onClick={() => { if (confirm(tr('Usunąć ten kontakt?'))) remove(r.id); }} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10"><Trash2 size={14} /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modal && <ContactModal initial={modal.record?.data} onClose={() => setModal(null)} onSave={save} />}
    </div>
  );
}
