import React from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { tr } from '../../../../i18n';
import { COLLECTION_FIELD_TYPES, createCollectionField } from './builderElements';

const inputCls =
  'w-full px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light';

// Edytor definicji kolekcji danych (element 'collection'): pola, widok, uprawnienia.
export default function CollectionEditor({ element, update }) {
  const p = element.props || {};
  const fields = p.fields || [];

  const setProp = (key, val) => update(element.id, (el) => ({ ...el, props: { ...el.props, [key]: val } }));
  const setFields = (next) => setProp('fields', next);
  const patchField = (i, patch) => setFields(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  // Wartość opcji jest STAŁA i unikalna (niezależna od etykiety), by uniknąć kolizji
  // po usunięciu/edycji i by zapisane rekordy nie traciły odniesień.
  const newOption = (n) => ({ label: `Opcja ${n}`, value: 'opt_' + Math.random().toString(36).slice(2, 7) });
  const addOption = (i) => patchField(i, { options: [...(fields[i].options || []), newOption((fields[i].options?.length || 0) + 1)] });

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">{tr('Tytuł kolekcji')}</label>
        <input className={inputCls} value={p.title ?? ''} onChange={(e) => setProp('title', e.target.value)} />
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">{tr('Widok')}</label>
        <select className={inputCls} value={p.view || 'list'} onChange={(e) => setProp('view', e.target.value)}>
          <option value="list">{tr('Lista')}</option>
          <option value="table">{tr('Tabela')}</option>
          <option value="cards">{tr('Karty')}</option>
        </select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">{tr('Pola')}</label>
          <button onClick={() => setFields([...fields, createCollectionField()])} className="text-xs text-accent-primary inline-flex items-center gap-1 hover:underline">
            <Plus size={13} /> {tr('Dodaj pole')}
          </button>
        </div>
        {fields.length === 0 && <p className="text-xs text-gray-400">{tr('Brak pól — dodaj pierwsze.')}</p>}
        {fields.map((f, i) => (
          <div key={f.key} className="p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 space-y-2">
            <div className="flex items-center gap-2">
              <GripVertical size={14} className="text-gray-300 shrink-0" />
              <input className={inputCls} placeholder={tr('Etykieta')} value={f.label} onChange={(e) => patchField(i, { label: e.target.value })} />
              <button onClick={() => setFields(fields.filter((_, idx) => idx !== i))} className="p-1 text-gray-400 hover:text-red-500 shrink-0"><Trash2 size={14} /></button>
            </div>
            <div className="flex items-center gap-2">
              <select className={inputCls} value={f.type} onChange={(e) => patchField(i, { type: e.target.value, options: e.target.value === 'select' ? (f.options || [{ label: 'Opcja 1', value: 'opcja_1' }]) : undefined })}>
                {COLLECTION_FIELD_TYPES.map((t) => <option key={t.type} value={t.type}>{tr(t.label)}</option>)}
              </select>
              <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 shrink-0">
                <input type="checkbox" checked={!!f.required} onChange={(e) => patchField(i, { required: e.target.checked })} />
                {tr('Wymagane')}
              </label>
            </div>
            {f.type === 'select' && (
              <div className="pl-6 space-y-1">
                {(f.options || []).map((o, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <input className={inputCls} value={o.label}
                      onChange={(e) => patchField(i, { options: f.options.map((x, xi) => xi === oi ? { ...x, label: e.target.value } : x) })} />
                    <button onClick={() => patchField(i, { options: f.options.filter((_, xi) => xi !== oi) })} className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>
                  </div>
                ))}
                <button onClick={() => addOption(i)} className="text-xs text-accent-primary hover:underline">+ {tr('Opcja')}</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-1.5 pt-2 border-t border-gray-100 dark:border-gray-800">
        {[['allowCreate', 'Zezwól na dodawanie'], ['allowEdit', 'Zezwól na edycję'], ['allowDelete', 'Zezwól na usuwanie']].map(([key, label]) => (
          <label key={key} className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300">
            {tr(label)}
            <input type="checkbox" checked={p[key] !== false} onChange={(e) => setProp(key, e.target.checked)} />
          </label>
        ))}
      </div>
    </div>
  );
}
