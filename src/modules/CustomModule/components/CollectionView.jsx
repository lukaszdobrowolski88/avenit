import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Database, Plus, Pencil, Trash2, X, Save, Star, Search, ArrowUpDown, Download, Upload, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { tr } from '../../../i18n';
import { useModuleRecords } from '../../../hooks/useModuleRecords';
import { evaluateVisibility } from '../../Forms/utils/fieldTypes';
import { STATUS_COLORS } from '../../Settings/components/ModuleBuilder/builderElements';

const statusColor = (field, value) => {
  const o = (field.options || []).find((x) => x.value === value);
  return o?.color || STATUS_COLORS[Math.max(0, (field.options || []).findIndex((x) => x.value === value)) % STATUS_COLORS.length];
};

function formatValue(field, value) {
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) return '—';
  switch (field.type) {
    case 'checkbox': return value ? tr('Tak') : tr('Nie');
    case 'select': return (field.options || []).find((o) => o.value === value)?.label || value;
    case 'multiselect': {
      const arr = Array.isArray(value) ? value : [value];
      return arr.map((v) => (field.options || []).find((o) => o.value === v)?.label || v).join(', ');
    }
    case 'status': {
      const o = (field.options || []).find((x) => x.value === value);
      return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium text-white" style={{ backgroundColor: statusColor(field, value) }}>{o?.label || value}</span>;
    }
    case 'tags': {
      const arr = Array.isArray(value) ? value : [value];
      return <span className="flex flex-wrap gap-1">{arr.filter(Boolean).map((t, i) => <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-accent-primary/10 text-accent-primary">{t}</span>)}</span>;
    }
    case 'person':
      return <span className="inline-flex items-center gap-1.5 text-sm"><span className="w-5 h-5 rounded-full bg-accent-primary/20 text-accent-primary text-[10px] font-bold flex items-center justify-center">{String(value).charAt(0).toUpperCase()}</span>{value}</span>;
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
  if (field.type === 'select' || field.type === 'status') return (field.options || []).find((o) => o.value === value)?.label || String(value);
  return String(value);
}

const inputCls =
  'w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light';

function TagsInput({ value, onChange }) {
  const arr = Array.isArray(value) ? value : [];
  const [text, setText] = useState('');
  const add = () => { const t = text.trim(); if (t && !arr.includes(t)) onChange([...arr, t]); setText(''); };
  return (
    <div className={inputCls + ' flex flex-wrap gap-1.5 items-center'}>
      {arr.map((t, i) => (
        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-accent-primary/10 text-accent-primary">
          {t}<button type="button" onClick={() => onChange(arr.filter((_, xi) => xi !== i))}><X size={11} /></button>
        </span>
      ))}
      <input value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }} onBlur={add}
        placeholder={tr('dodaj tag…')} className="flex-1 min-w-[80px] bg-transparent outline-none text-sm" />
    </div>
  );
}

function FieldInput({ field, value, onChange, people = [] }) {
  switch (field.type) {
    case 'status':
      return (
        <div className="flex flex-wrap gap-1.5">
          {(field.options || []).map((o) => (
            <button key={o.value} type="button" onClick={() => onChange(o.value === value ? '' : o.value)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-white transition" style={{ backgroundColor: o.color || statusColor(field, o.value), opacity: value === o.value ? 1 : 0.4 }}>
              {o.label}
            </button>
          ))}
        </div>
      );
    case 'tags':
      return <TagsInput value={value} onChange={onChange} />;
    case 'person':
      return (
        <select className={inputCls} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">{tr('— wybierz osobę —')}</option>
          {people.map((p) => <option key={p.email || p.name} value={p.name}>{p.name}</option>)}
        </select>
      );
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

function RecordForm({ fields, initial, onCancel, onSubmit, people = [] }) {
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
                <FieldInput field={f} value={values[f.key]} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} people={people} />
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

// Parser CSV (obsługa cudzysłowów i przecinków w polach).
function parseCsvRows(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

// Zamiana komórki CSV (string) na wartość zgodną z typem pola.
function coerceImport(field, cell) {
  const v = (cell || '').trim();
  const byLabel = (label) => (field.options || []).find((o) => o.label.toLowerCase() === label.toLowerCase())?.value || label;
  switch (field.type) {
    case 'number': case 'currency': case 'rating': return Number(v.replace(',', '.')) || 0;
    case 'checkbox': return /^(tak|true|1|yes|x)$/i.test(v);
    case 'multiselect': return v.split(/[;,]/).map((x) => byLabel(x.trim())).filter(Boolean);
    case 'tags': return v.split(/[;,]/).map((x) => x.trim()).filter(Boolean);
    case 'select': case 'status': return byLabel(v);
    default: return v;
  }
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
  const [people, setPeople] = useState([]);
  const [calCursor, setCalCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const importRef = useRef(null);

  const hasPerson = fields.some((f) => f.type === 'person');
  useEffect(() => {
    if (!hasPerson) return;
    supabase.from('app_users').select('email, full_name, name')
      .then(({ data }) => setPeople((data || []).map((u) => ({ email: u.email, name: u.full_name || u.name || u.email })).filter((u) => u.name)));
  }, [hasPerson]);

  const importCsv = async (file) => {
    if (!file) return;
    try {
      const rows = parseCsvRows(await file.text());
      if (rows.length < 2) { alert(tr('Plik nie zawiera danych.')); return; }
      const colFields = rows[0].map((h) => fields.find((f) => f.label.trim().toLowerCase() === h.trim().toLowerCase()));
      let n = 0;
      for (const row of rows.slice(1)) {
        const data = {};
        row.forEach((cell, i) => { const f = colFields[i]; if (f && cell.trim() !== '') data[f.key] = coerceImport(f, cell); });
        if (Object.keys(data).length) { await create(data); n++; }
      }
      alert(`${tr('Zaimportowano wpisów:')} ${n}`);
    } catch (e) { alert(tr('Błąd importu: ') + (e.message || e)); }
    if (importRef.current) importRef.current.value = '';
  };

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

  const openEdit = (rec) => { setEditing(rec); setFormOpen(true); };
  const groupField = fields.find((f) => f.type === 'status') || fields.find((f) => f.type === 'select');
  const dateField = fields.find((f) => f.type === 'date');
  const imageField = fields.find((f) => f.type === 'image');
  const titleField = fields.find((f) => ['text', 'textarea'].includes(f.type)) || fields.find((f) => !['image', 'file'].includes(f.type)) || fields[0];

  const renderKanban = () => {
    if (!groupField) return <div className="py-10 text-center text-gray-400 text-sm">{tr('Dodaj pole Status lub Lista wyboru, aby użyć widoku Kanban.')}</div>;
    const cols = [...(groupField.options || []).map((o) => ({ key: o.value, label: o.label, color: o.color })), { key: '__none', label: tr('Bez wartości'), color: '#cbd5e1' }];
    return (
      <div className="flex gap-3 overflow-x-auto custom-scrollbar pb-2">
        {cols.map((col) => {
          const items = displayed.filter((r) => (r.data?.[groupField.key] || '__none') === col.key);
          if (col.key === '__none' && items.length === 0) return null;
          return (
            <div key={col.key} className="w-64 shrink-0">
              <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.color || statusColor(groupField, col.key) }} />
                {col.label}<span className="text-gray-400 font-normal">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((rec) => (
                  <div key={rec.id} onClick={() => openEdit(rec)} className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 cursor-pointer hover:shadow-md">
                    <div className="font-medium text-sm text-gray-800 dark:text-gray-100 mb-1 truncate">{titleField ? formatValue(titleField, rec.data?.[titleField.key]) : tr('Wpis')}</div>
                    {fields.filter((f) => f.key !== titleField?.key && f.key !== groupField.key).slice(0, 2).map((f) => (
                      <div key={f.key} className="text-xs text-gray-500 truncate">{formatValue(f, rec.data?.[f.key])}</div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderGallery = () => {
    if (!imageField) return <div className="py-10 text-center text-gray-400 text-sm">{tr('Dodaj pole Obraz, aby użyć widoku Galeria.')}</div>;
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {displayed.map((rec) => {
          const url = rec.data?.[imageField.key];
          return (
            <div key={rec.id} onClick={() => openEdit(rec)} className="group cursor-pointer rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <div className="aspect-square bg-gray-100 dark:bg-gray-900">
                {url ? <img src={url} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition" /> : <div className="w-full h-full flex items-center justify-center text-gray-300"><Database size={28} /></div>}
              </div>
              {titleField && titleField.key !== imageField.key && <div className="p-2 text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{rawValue(titleField, rec.data?.[titleField.key])}</div>}
            </div>
          );
        })}
      </div>
    );
  };

  const renderCalendar = () => {
    if (!dateField) return <div className="py-10 text-center text-gray-400 text-sm">{tr('Dodaj pole Data, aby użyć widoku Kalendarz.')}</div>;
    const y = calCursor.getFullYear(), m = calCursor.getMonth();
    const startDay = (new Date(y, m, 1).getDay() + 6) % 7;
    const days = new Date(y, m + 1, 0).getDate();
    const byDate = {};
    displayed.forEach((r) => { const d = r.data?.[dateField.key]; if (d) (byDate[d] = byDate[d] || []).push(r); });
    const cells = [];
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= days; d++) cells.push(d);
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setCalCursor(new Date(y, m - 1, 1))} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><ChevronLeft size={18} /></button>
          <span className="text-sm font-semibold capitalize">{calCursor.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })}</span>
          <button onClick={() => setCalCursor(new Date(y, m + 1, 1))} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><ChevronRight size={18} /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-gray-400 uppercase mb-1">
          {[tr('Pn'), tr('Wt'), tr('Śr'), tr('Cz'), tr('Pt'), tr('So'), tr('Nd')].map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const items = byDate[key] || [];
            return (
              <div key={i} className="min-h-[64px] rounded-lg border border-gray-100 dark:border-gray-800 p-1">
                <div className="text-[11px] text-gray-400">{d}</div>
                {items.slice(0, 3).map((rec) => (
                  <button key={rec.id} onClick={() => openEdit(rec)} className="block w-full text-left text-[11px] px-1 py-0.5 rounded bg-accent-primary/10 text-accent-primary truncate mt-0.5">
                    {titleField ? rawValue(titleField, rec.data?.[titleField.key]) : tr('Wpis')}
                  </button>
                ))}
                {items.length > 3 && <div className="text-[10px] text-gray-400 mt-0.5">+{items.length - 3}</div>}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

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
          {p.allowCreate !== false && fields.length > 0 && (
            <>
              <input ref={importRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => importCsv(e.target.files?.[0])} />
              <button onClick={() => importRef.current?.click()} className="p-2 text-gray-500 hover:text-accent-primary rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700" title={tr('Import CSV')}>
                <Upload size={17} />
              </button>
            </>
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
      ) : view === 'kanban' ? (
        renderKanban()
      ) : view === 'calendar' ? (
        renderCalendar()
      ) : view === 'gallery' ? (
        renderGallery()
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
          people={people}
        />
      )}
    </div>
  );
}
