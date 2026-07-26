import React, { useState } from 'react';
import { Plus, Edit2, Trash2, X, FolderOpen } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import Modal from '../../../components/Modal';

const PRESET_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#64748b'];
const emptyForm = { name: '', description: '', color: '#10b981', is_tax_deductible: true, is_active: true };

export default function FundsTab({ funds, campusIdForInsert, refreshShared }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const openCreate = () => { setEditing(null); setForm({ ...emptyForm, sort_order: (funds?.length || 0) }); setModalOpen(true); };
  const openEdit = (f) => {
    setEditing(f);
    setForm({ name: f.name || '', description: f.description || '', color: f.color || '#10b981', is_tax_deductible: !!f.is_tax_deductible, is_active: f.is_active !== false });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { alert('Podaj nazwę funduszu.'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(), description: form.description || null, color: form.color,
        is_tax_deductible: form.is_tax_deductible, is_active: form.is_active,
      };
      if (editing) {
        const { error } = await supabase.from('giving_funds').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        payload.campus_id = campusIdForInsert;
        payload.sort_order = funds?.length || 0;
        const { error } = await supabase.from('giving_funds').insert(payload);
        if (error) throw error;
      }
      setModalOpen(false);
      refreshShared();
    } catch (err) {
      alert('Nie udało się zapisać funduszu: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (f) => {
    if (!confirm(`Usunąć fundusz „${f.name}"? Darowizny z tego funduszu pozostaną, ale bez przypisania.`)) return;
    try {
      const { error } = await supabase.from('giving_funds').delete().eq('id', f.id);
      if (error) throw error;
      refreshShared();
    } catch (err) {
      alert('Nie udało się usunąć: ' + (err.message || err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">Cele, na które zbierane są darowizny. Zaznacz „odpis PIT" dla funduszy uprawniających do odliczenia.</p>
        <button onClick={openCreate} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium flex items-center gap-2 text-sm shadow-md"><Plus size={16} /> Dodaj fundusz</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {(funds || []).length === 0 && (
          <div className="col-span-full p-12 text-center bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
            <FolderOpen size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400">Brak funduszy. Dodaj pierwszy cel.</p>
          </div>
        )}
        {(funds || []).map(f => (
          <div key={f.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <span className="w-3 h-3 rounded-full mt-1.5 shrink-0" style={{ background: f.color }} />
              <div className="min-w-0">
                <div className="font-semibold text-gray-900 dark:text-white truncate">{f.name}</div>
                {f.description && <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{f.description}</div>}
                <div className="flex gap-2 mt-2">
                  {f.is_tax_deductible && <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">odpis PIT</span>}
                  {f.is_active === false && <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">nieaktywny</span>}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <button onClick={() => openEdit(f)} className="p-2 rounded-lg text-gray-400 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-gray-700"><Edit2 size={15} /></button>
              <button onClick={() => remove(f)} className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>

      <Modal isOpen={modalOpen}>
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !saving && setModalOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Edytuj fundusz' : 'Nowy fundusz'}</h3>
              <button onClick={() => setModalOpen(false)} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Nazwa</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Opis</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 ml-1">Kolor</label>
                <div className="flex gap-2 flex-wrap">
                  {PRESET_COLORS.map(c => (
                    <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))} className={`w-8 h-8 rounded-full transition ${form.color === c ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-gray-800' : ''}`} style={{ background: c }} />
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
                <input type="checkbox" checked={form.is_tax_deductible} onChange={e => setForm(f => ({ ...f, is_tax_deductible: e.target.checked }))} className="rounded accent-emerald-500" />
                Uprawnia do odpisu podatkowego (PIT)
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded accent-emerald-500" />
                Aktywny
              </label>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100 dark:border-gray-700">
              <button onClick={() => setModalOpen(false)} disabled={saving} className="px-4 py-2.5 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm">Anuluj</button>
              <button onClick={save} disabled={saving} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium text-sm shadow-md disabled:opacity-60">{saving ? 'Zapisywanie...' : 'Zapisz'}</button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
