import React, { useState, useEffect, useCallback } from 'react';
import { Save, SlidersHorizontal, Settings2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import CustomSelect from '../../../components/CustomSelect';
import { DateInput } from '../../../components/pickers';
import { toast } from '../../../lib/toast';
import Spinner from '../../../components/Spinner';
import { tr } from '../../../i18n';

export default function CustomValuesTab({ member, fields, onGoToDefinitions }) {
  const [values, setValues] = useState({}); // field_key -> value
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    if (!member?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from('member_custom_values').select('*').eq('member_id', member.id);
      if (error) throw error;
      const map = {};
      (data || []).forEach(v => { map[v.field_key] = v.value ?? ''; });
      setValues(map);
      setDirty(false);
    } catch (err) {
      console.error('Load custom values error:', err);
      setValues({});
    } finally {
      setLoading(false);
    }
  }, [member?.id]);

  useEffect(() => { load(); }, [load]);

  const setValue = (key, val) => {
    setValues(prev => ({ ...prev, [key]: val }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const rows = (fields || []).map(f => ({
        member_id: member.id,
        field_key: f.field_key,
        value: values[f.field_key] ?? '',
      }));
      if (rows.length > 0) {
        const { error } = await supabase.from('member_custom_values').upsert(rows, { onConflict: 'member_id,field_key' });
        if (error) throw error;
      }
      setDirty(false);
      load();
    } catch (err) {
      toast.error(tr('Nie udało się zapisać pól własnych: {msg}', { msg: err.message || err }));
    } finally {
      setSaving(false);
    }
  };

  const renderInput = (f) => {
    const val = values[f.field_key] ?? '';
    if (f.field_type === 'select') {
      const opts = [
        { value: '', label: tr('— wybierz —') },
        ...(Array.isArray(f.options) ? f.options : []).map(o => ({ value: String(o), label: String(o) })),
      ];
      return <CustomSelect value={val} onChange={v => setValue(f.field_key, v)} options={opts} />;
    }
    if (f.field_type === 'date') return <DateInput value={val} onChange={e => setValue(f.field_key, e.target.value)} />;
    const type = f.field_type === 'number' ? 'number' : 'text';
    return (
      <input
        type={type}
        value={val}
        onChange={e => setValue(f.field_key, e.target.value)}
        className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-accent-primary-light/30 focus:border-accent-primary-light outline-none"
      />
    );
  };

  if (loading) return <Spinner center />;

  if (!fields || fields.length === 0) {
    return (
      <div className="p-12 text-center bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
        <SlidersHorizontal size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-500 dark:text-gray-400 mb-4">{tr('Nie zdefiniowano żadnych pól własnych.')}</p>
        {onGoToDefinitions && (
          <button onClick={onGoToDefinitions} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium inline-flex items-center gap-2 text-sm shadow-md">
            <Settings2 size={16} /> {tr('Przejdź do definicji pól')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-4">
        {fields.map(f => (
          <div key={f.field_key}>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{f.label}</label>
            {renderInput(f)}
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <button onClick={save} disabled={saving || !dirty} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium flex items-center gap-2 text-sm shadow-md disabled:opacity-60">
          <Save size={16} /> {saving ? tr('Zapisywanie...') : tr('Zapisz pola')}
        </button>
      </div>
    </div>
  );
}
