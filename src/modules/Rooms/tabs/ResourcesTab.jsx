import React, { useState } from 'react';
import { Plus, Edit2, Trash2, X, Boxes, DoorOpen, Package, MapPin, Users } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import Modal from '../../../components/Modal';
import CustomSelect from '../../../components/CustomSelect';
import { RESOURCE_TYPES, typeLabel, PRESET_COLORS } from '../lib/roomsApi';
import { toast } from '../../../lib/toast';
import Spinner from '../../../components/Spinner';

const emptyForm = { name: '', type: 'room', capacity: '', color: '#3b82f6', location: '', is_active: true };

export default function ResourcesTab({ resources, loading, campusIdForInsert, refreshShared }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (r) => {
    setEditing(r);
    setForm({
      name: r.name || '', type: r.type || 'room', capacity: r.capacity != null ? String(r.capacity) : '',
      color: r.color || '#3b82f6', location: r.location || '', is_active: r.is_active !== false,
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error('Podaj nazwę zasobu.'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        capacity: form.capacity === '' ? null : Number(form.capacity),
        color: form.color,
        location: form.location || null,
        is_active: form.is_active,
      };
      if (editing) {
        const { error } = await supabase.from('resources').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        payload.campus_id = campusIdForInsert;
        const { error } = await supabase.from('resources').insert(payload);
        if (error) throw error;
      }
      setModalOpen(false);
      refreshShared();
    } catch (err) {
      console.error('Save resource error:', err);
      toast.error('Nie udało się zapisać zasobu: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r) => {
    if (!confirm(`Usunąć „${r.name}"? Wszystkie rezerwacje tego zasobu również zostaną usunięte.`)) return;
    try {
      const { error } = await supabase.from('resources').delete().eq('id', r.id);
      if (error) throw error;
      refreshShared();
    } catch (err) {
      toast.error('Nie udało się usunąć: ' + (err.message || err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">Sale i sprzęt, które można rezerwować. Kolor ułatwia rozpoznanie w harmonogramie.</p>
        <button onClick={openCreate} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium flex items-center gap-2 text-sm shadow-md hover:shadow-lg transition">
          <Plus size={16} /> Dodaj zasób
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {loading && (
          <Spinner center />
        )}
        {!loading && (resources || []).length === 0 && (
          <div className="col-span-full p-12 text-center bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
            <Boxes size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400">Brak zasobów. Dodaj pierwszą salę lub sprzęt.</p>
          </div>
        )}
        {!loading && (resources || []).map(r => {
          const TypeIcon = r.type === 'equipment' ? Package : DoorOpen;
          return (
            <div key={r.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: (r.color || '#3b82f6') + '22' }}>
                  <TypeIcon size={18} style={{ color: r.color || '#3b82f6' }} />
                </span>
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900 dark:text-white truncate">{r.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>{typeLabel(r.type)}</span>
                    {r.capacity != null && <span className="inline-flex items-center gap-1"><Users size={12} /> {r.capacity}</span>}
                    {r.location && <span className="inline-flex items-center gap-1 truncate"><MapPin size={12} /> {r.location}</span>}
                  </div>
                  {r.is_active === false && (
                    <span className="inline-block mt-2 text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">nieaktywny</span>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button onClick={() => openEdit(r)} className="p-2 rounded-lg text-gray-400 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-gray-700"><Edit2 size={15} /></button>
                <button onClick={() => remove(r)} className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"><Trash2 size={15} /></button>
              </div>
            </div>
          );
        })}
      </div>

      <Modal isOpen={modalOpen}>
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !saving && setModalOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Edytuj zasób' : 'Nowy zasób'}</h3>
              <button onClick={() => setModalOpen(false)} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Nazwa</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="np. Sala główna, Rzutnik" className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <CustomSelect label="Typ" value={form.type} onChange={v => setForm(f => ({ ...f, type: v }))} options={RESOURCE_TYPES} />
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Pojemność</label>
                  <input type="number" min="0" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} placeholder="opcjonalnie" className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Lokalizacja</label>
                <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="np. Parter, Budynek B" className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
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
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded accent-emerald-500" />
                Aktywny (dostępny do rezerwacji)
              </label>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100 dark:border-gray-700 sticky bottom-0 bg-white dark:bg-gray-800">
              <button onClick={() => setModalOpen(false)} disabled={saving} className="px-4 py-2.5 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm">Anuluj</button>
              <button onClick={save} disabled={saving} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium text-sm shadow-md disabled:opacity-60">{saving ? 'Zapisywanie...' : 'Zapisz'}</button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
