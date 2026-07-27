import React, { useState } from 'react';
import { Database, Plus, Pencil, Trash2, X, Save } from 'lucide-react';
import { tr } from '../../../i18n';
import { useModuleRecords } from '../../../hooks/useModuleRecords';
import { evaluateVisibility } from '../../Forms/utils/fieldTypes';

function formatValue(field, value) {
  if (value == null || value === '') return '—';
  if (field.type === 'checkbox') return value ? tr('Tak') : tr('Nie');
  if (field.type === 'select') return (field.options || []).find((o) => o.value === value)?.label || value;
  return String(value);
}

const inputCls =
  'w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light';

function FieldInput({ field, value, onChange }) {
  switch (field.type) {
    case 'textarea':
      return <textarea rows={3} className={inputCls} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'number':
      return <input type="number" className={inputCls} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />;
    case 'date':
      return <input type="date" className={inputCls} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'email':
      return <input type="email" className={inputCls} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'phone':
      return <input type="tel" className={inputCls} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'checkbox':
      return (
        <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
          {tr('Tak')}
        </label>
      );
    case 'select':
      return (
        <select className={inputCls} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">{tr('— wybierz —')}</option>
          {(field.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    default:
      return <input type="text" className={inputCls} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
}

function RecordForm({ fields, initial, onCancel, onSubmit }) {
  const [values, setValues] = useState(() => ({ ...(initial || {}) }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    for (const f of fields) {
      // Pomiń walidację pól ukrytych warunkowo.
      if (!evaluateVisibility(f, values)) continue;
      if (f.required && (values[f.key] == null || values[f.key] === '')) {
        setErr(tr('Wypełnij wymagane pola')); return;
      }
    }
    setSaving(true);
    const res = await onSubmit(values);
    setSaving(false);
    if (!res?.success) setErr(res?.error || tr('Błąd zapisu'));
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[160]">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center shrink-0">
          <h3 className="font-bold text-xl bg-gradient-to-r from-accent-primary to-accent-secondary bg-clip-text text-transparent">
            {initial ? tr('Edytuj wpis') : tr('Nowy wpis')}
          </h3>
          <button onClick={onCancel} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition"><X size={20} className="text-gray-500" /></button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {err && <div className="text-sm text-red-500">{err}</div>}
          {fields.length === 0 && <p className="text-sm text-gray-400">{tr('Ta kolekcja nie ma jeszcze zdefiniowanych pól.')}</p>}
          {fields.map((f) => {
            if (!evaluateVisibility(f, values)) return null; // logika warunkowa
            return (
              <div key={f.key}>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
                  {f.label}{f.required ? ' *' : ''}
                </label>
                <FieldInput field={f} value={values[f.key]} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
              </div>
            );
          })}
        </div>
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 shrink-0">
          <button onClick={onCancel} className="px-5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition font-medium">{tr('Anuluj')}</button>
          <button onClick={submit} disabled={saving} className="px-5 py-2.5 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl hover:shadow-lg transition font-medium flex items-center gap-2 disabled:opacity-50">
            <Save size={16} /> {saving ? tr('Zapisywanie...') : tr('Zapisz')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CollectionView({ element, ctx }) {
  const p = element?.props || {};
  const fields = p.fields || [];
  const view = p.view || 'list';
  const { records, loading, create, update, remove } = useModuleRecords({
    moduleId: ctx?.moduleId, moduleKey: ctx?.moduleKey, tabId: ctx?.tabId, collectionKey: p.collectionKey,
  });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const submit = async (values) => {
    const res = editing ? await update(editing.id, values) : await create(values);
    if (res.success) { setFormOpen(false); setEditing(null); }
    return res;
  };
  const onDelete = async (rec) => {
    if (window.confirm(tr('Usunąć ten wpis?'))) await remove(rec.id);
  };

  const RowActions = ({ rec }) => (
    <div className="flex items-center gap-1">
      {p.allowEdit !== false && (
        <button onClick={() => { setEditing(rec); setFormOpen(true); }} className="p-1.5 text-gray-400 hover:text-accent-primary rounded-lg" title={tr('Edytuj')}><Pencil size={15} /></button>
      )}
      {p.allowDelete !== false && (
        <button onClick={() => onDelete(rec)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg" title={tr('Usuń')}><Trash2 size={15} /></button>
      )}
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-gray-900 dark:text-white">
          <Database size={18} className="text-accent-primary" />
          <h3 className="text-lg font-semibold">{p.title || tr('Kolekcja danych')}</h3>
        </div>
        {p.allowCreate !== false && (
          <button onClick={() => { setEditing(null); setFormOpen(true); }}
            className="px-3 py-2 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl hover:shadow-lg transition flex items-center gap-2 text-sm">
            <Plus size={16} /> {tr('Dodaj')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-10 text-center text-gray-400 text-sm">{tr('Ładowanie...')}</div>
      ) : records.length === 0 ? (
        <div className="py-10 text-center text-gray-400 text-sm border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">{tr('Brak wpisów.')}</div>
      ) : view === 'table' ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500">
                {fields.map((f) => <th key={f.key} className="py-2 px-3 font-medium">{f.label}</th>)}
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {records.map((rec) => (
                <tr key={rec.id} className="border-b border-gray-100 dark:border-gray-800">
                  {fields.map((f) => <td key={f.key} className="py-2 px-3 text-gray-800 dark:text-gray-200">{formatValue(f, rec.data?.[f.key])}</td>)}
                  <td className="py-2 px-3 text-right"><RowActions rec={rec} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : view === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {records.map((rec) => (
            <div key={rec.id} className="p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <div className="flex justify-between items-start mb-2"><span /><RowActions rec={rec} /></div>
              {fields.map((f) => (
                <div key={f.key} className="mb-1.5">
                  <div className="text-[11px] uppercase text-gray-400">{f.label}</div>
                  <div className="text-sm text-gray-800 dark:text-gray-200">{formatValue(f, rec.data?.[f.key])}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {records.map((rec) => (
            <div key={rec.id} className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-start justify-between gap-3">
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                {fields.map((f) => (
                  <div key={f.key} className="text-sm">
                    <span className="text-gray-400">{f.label}: </span>
                    <span className="text-gray-800 dark:text-gray-200">{formatValue(f, rec.data?.[f.key])}</span>
                  </div>
                ))}
              </div>
              <RowActions rec={rec} />
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <RecordForm
          fields={fields}
          initial={editing?.data}
          onCancel={() => { setFormOpen(false); setEditing(null); }}
          onSubmit={submit}
        />
      )}
    </div>
  );
}
