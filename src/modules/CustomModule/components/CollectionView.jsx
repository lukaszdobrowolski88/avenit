import React, { useState, useMemo } from 'react';
import { Database, Plus, Pencil, Trash2, X, Save, Star, Search, ArrowUpDown, Download } from 'lucide-react';
import { tr } from '../../../i18n';
import { useModuleRecords } from '../../../hooks/useModuleRecords';
import { evaluateVisibility } from '../../Forms/utils/fieldTypes';

function formatValue(field, value) {
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) return '—';
  switch (field.type) {
    case 'checkbox': return value ? tr('Tak') : tr('Nie');
    case 'select': return (field.options || []).find((o) => o.value === value)?.label || value;
    case 'multiselect': {
      const arr = Array.isArray(value) ? value : [value];
      return arr.map((v) => (field.options || []).find((o) => o.value === v)?.label || v).join(', ');
    }
    case 'currency': return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(Number(value) || 0);
    case 'rating': { const n = Math.max(0, Math.min(5, Number(value) || 0)); return '★'.repeat(n) + '☆'.repeat(5 - n); }
    case 'image': return <img src={value} alt="" className="h-10 w-10 object-cover rounded-lg" />;
    case 'file': return <a href={value} target="_blank" rel="noreferrer" className="text-accent-primary underline">{tr('Otwórz plik')}</a>;
    default: return String(value);
  }
}

// Wartość do szukania/sortowania/CSV (płaski string).
function rawValue(field, value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map((v) => (field.options || []).find((o) => o.value === v)?.label || v).join('; ');
  if (field.type === 'select') return (field.options || []).find((o) => o.value === value)?.label || String(value);
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
    case 'currency':
      return <input type="number" step="0.01" className={inputCls} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />;
    case 'date':
      return <input type="date" className={inputCls} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'email':
      return <input type="email" className={inputCls} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'phone':
      return <input type="tel" className={inputCls} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'image':
    case 'file':
      return (
        <div>
          <input type="url" className={inputCls} placeholder="https://…" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
          {field.type === 'image' && value ? <img src={value} alt="" className="mt-2 h-20 rounded-lg object-cover" /> : null}
        </div>
      );
    case 'rating':
      return (
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => onChange(n === value ? 0 : n)} className={n <= (value || 0) ? 'text-amber-400' : 'text-gray-300 dark:text-gray-600'}>
              <Star size={22} fill={n <= (value || 0) ? 'currentColor' : 'none'} />
            </button>
          ))}
        </div>
      );
    case 'checkbox':
      return (
        <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
          {tr('Tak')}
        </label>
      );
    case 'multiselect': {
      const arr = Array.isArray(value) ? value : [];
      const toggle = (v) => onChange(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
      return (
        <div className="flex flex-wrap gap-1.5">
          {(field.options || []).map((o) => (
            <button key={o.value} type="button" onClick={() => toggle(o.value)}
              className={`px-3 py-1.5 rounded-lg text-sm transition ${arr.includes(o.value) ? 'bg-accent-primary text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
              {o.label}
            </button>
          ))}
        </div>
      );
    }
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
      if (!evaluateVisibility(f, values)) continue; // pomiń pola ukryte warunkowo
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

function exportCsv(fields, records, title) {
  const header = fields.map((f) => f.label);
  const rows = records.map((r) => fields.map((f) => rawValue(f, r.data?.[f.key])));
  const esc = (c) => `"${String(c).replace(/"/g, '""')}"`;
  const csv = [header, ...rows].map((row) => row.map(esc).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${(title || 'kolekcja').replace(/[^a-z0-9]+/gi, '_')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = records;
    if (q) list = list.filter((r) => fields.some((f) => rawValue(f, r.data?.[f.key]).toLowerCase().includes(q)));
    if (sortField) {
      const f = fields.find((x) => x.key === sortField);
      list = [...list].sort((a, b) => {
        const av = a.data?.[sortField], bv = b.data?.[sortField];
        let cmp;
        if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
        else cmp = rawValue(f, av).localeCompare(rawValue(f, bv), 'pl');
        return sortDir === 'desc' ? -cmp : cmp;
      });
    }
    return list;
  }, [records, fields, search, sortField, sortDir]);

  const submit = async (values) => {
    const res = editing ? await update(editing.id, values) : await create(values);
    if (res.success) { setFormOpen(false); setEditing(null); }
    return res;
  };
  const onDelete = async (rec) => { if (window.confirm(tr('Usunąć ten wpis?'))) await remove(rec.id); };
  const toggleSort = (key) => {
    if (sortField === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(key); setSortDir('asc'); }
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
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 text-gray-900 dark:text-white">
          <Database size={18} className="text-accent-primary" />
          <h3 className="text-lg font-semibold">{p.title || tr('Kolekcja danych')}</h3>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr('Szukaj...')}
              className="pl-8 pr-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:border-accent-primary-light w-40" />
          </div>
          {records.length > 0 && (
            <button onClick={() => exportCsv(fields, displayed, p.title)} className="p-2 text-gray-500 hover:text-accent-primary rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700" title={tr('Eksport CSV')}>
              <Download size={17} />
            </button>
          )}
          {p.allowCreate !== false && (
            <button onClick={() => { setEditing(null); setFormOpen(true); }}
              className="px-3 py-2 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl hover:shadow-lg transition flex items-center gap-2 text-sm">
              <Plus size={16} /> {tr('Dodaj')}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-10 text-center text-gray-400 text-sm">{tr('Ładowanie...')}</div>
      ) : records.length === 0 ? (
        <div className="py-10 text-center text-gray-400 text-sm border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">{tr('Brak wpisów.')}</div>
      ) : displayed.length === 0 ? (
        <div className="py-10 text-center text-gray-400 text-sm">{tr('Brak wyników dla wyszukiwania.')}</div>
      ) : view === 'table' ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500">
                {fields.map((f) => (
                  <th key={f.key} className="py-2 px-3 font-medium cursor-pointer select-none" onClick={() => toggleSort(f.key)}>
                    <span className="inline-flex items-center gap-1">{f.label}<ArrowUpDown size={12} className={sortField === f.key ? 'text-accent-primary' : 'text-gray-300'} /></span>
                  </th>
                ))}
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((rec) => (
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
          {displayed.map((rec) => (
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
          {displayed.map((rec) => (
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
