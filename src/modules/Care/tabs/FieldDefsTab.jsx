import React, { useState } from 'react';
import { Plus, Edit2, Trash2, SlidersHorizontal, GripVertical } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import EmptyState from '../../../components/EmptyState';
import CustomSelect from '../../../components/CustomSelect';
import { FIELD_TYPES, fieldTypeLabel, slugifyFieldKey } from '../lib/careApi';
import { toast } from '../../../lib/toast';
import { confirmDialog } from '../../../lib/dialog';
import { tr } from '../../../i18n';

const emptyForm = { label: '', field_type: 'text', optionsText: '' };

export default function FieldDefsTab({ fields, refreshFields }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (f) => {
    setEditing(f);
    setForm({
      label: f.label || '',
      field_type: f.field_type || 'text',
      optionsText: (Array.isArray(f.options) ? f.options : []).join('\n'),
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.label.trim()) { toast.error(tr('Podaj etykietę pola.')); return; }
    setSaving(true);
    try {
      const options = form.field_type === 'select'
        ? form.optionsText.split('\n').map(s => s.trim()).filter(Boolean)
        : [];
      if (editing) {
        const { error } = await supabase.from('member_custom_fields').update({
          label: form.label.trim(),
          field_type: form.field_type,
          options,
        }).eq('id', editing.id);
        if (error) throw error;
      } else {
        // Wygeneruj unikalny field_key na podstawie etykiety
        const base = slugifyFieldKey(form.label);
        const existing = new Set((fields || []).map(f => f.field_key));
        let key = base; let i = 2;
        while (existing.has(key)) { key = `${base}_${i++}`; }
        const { error } = await supabase.from('member_custom_fields').insert({
          field_key: key,
          label: form.label.trim(),
          field_type: form.field_type,
          options,
          sort_order: (fields?.length || 0),
        });
        if (error) throw error;
      }
      setModalOpen(false);
      refreshFields();
    } catch (err) {
      toast.error(tr('Nie udało się zapisać pola: {msg}', { msg: err.message || err }));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (f) => {
    if (!await confirmDialog(tr('Usunąć pole „{label}"? Wartości tego pola u członków przestaną być widoczne.', { label: f.label }))) return;
    try {
      const { error } = await supabase.from('member_custom_fields').delete().eq('id', f.id);
      if (error) throw error;
      refreshFields();
    } catch (err) {
      toast.error(tr('Nie udało się usunąć: {msg}', { msg: err.message || err }));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <p className="text-sm text-gray-500 dark:text-gray-400">{tr('Zdefiniuj dodatkowe pola opisujące członków (widoczne w zakładce „Pola własne" u każdej osoby).')}</p>
        <button onClick={openCreate} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium flex items-center gap-2 text-sm shadow-md shrink-0"><Plus size={16} /> {tr('Dodaj pole')}</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {(fields || []).length === 0 && (
          <EmptyState icon={SlidersHorizontal} title={tr('Brak zdefiniowanych pól.')} subtitle={tr('Dodaj pierwsze.')} className="col-span-full bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700" />
        )}
        {(fields || []).map(f => (
          <div key={f.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              <GripVertical size={16} className="text-gray-300 dark:text-gray-600 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold text-gray-900 dark:text-white truncate">{f.label}</div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-accent-primary-lightest text-accent-primary dark:bg-accent-primary-darkest/30 dark:text-accent-primary-light">{tr(fieldTypeLabel(f.field_type))}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate">{f.field_key}</span>
                </div>
                {f.field_type === 'select' && Array.isArray(f.options) && f.options.length > 0 && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 line-clamp-2">{f.options.join(', ')}</div>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <button onClick={() => openEdit(f)} className="p-2 rounded-lg text-gray-400 hover:text-accent-primary hover:bg-gray-100 dark:hover:bg-gray-700"><Edit2 size={15} /></button>
              <button onClick={() => remove(f)} className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? tr('Edytuj pole') : tr('Nowe pole własne')}
        size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>{tr('Anuluj')}</Button>
          <Button onClick={save} loading={saving}>{tr('Zapisz')}</Button>
        </>}
      >
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Etykieta')}</label>
            <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder={tr('np. Rozmiar koszulki')} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
          </div>
          <CustomSelect label={tr('Typ pola')} value={form.field_type} onChange={v => setForm(f => ({ ...f, field_type: v }))} options={FIELD_TYPES.map((o) => ({ ...o, label: tr(o.label) }))} />
          {form.field_type === 'select' && (
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Opcje (jedna w wierszu)')}</label>
              <textarea value={form.optionsText} onChange={e => setForm(f => ({ ...f, optionsText: e.target.value }))} rows={4} placeholder={'S\nM\nL\nXL'} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 resize-none" />
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
