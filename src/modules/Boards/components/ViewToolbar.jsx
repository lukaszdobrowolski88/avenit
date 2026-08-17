import React, { useState, useRef } from 'react';
import { Search, SlidersHorizontal, ArrowUpDown, Plus, X, Filter, MoreHorizontal, Download, Upload } from 'lucide-react';
import Popover from './Popover';
import ColumnIcon from './ColumnIcon';
import CustomSelect from '../../../components/CustomSelect';
import CustomDatePicker from '../../../components/CustomDatePicker';
import Button from '../../../components/Button';
import { tr } from '../../../i18n';
import { getColumnType, cellToText } from '../lib/columnTypes';
import { parseCsv } from '../lib/csv';

// Wybór wartości do filtra zależny od typu kolumny.
function FilterValue({ column, value, onChange }) {
  const t = column.type;
  if (t === 'status' || t === 'priority') {
    return (
      <div className="w-40">
        <CustomSelect compact placeholder={tr('— wybierz —')} value={value ?? ''} onChange={(v) => onChange(v || null)}
          options={column.settings?.labels || []} mapOptionToValue={(l) => l.id} mapOptionToLabel={(l) => l.title} />
      </div>
    );
  }
  if (t === 'dropdown') {
    return (
      <div className="w-40">
        <CustomSelect compact placeholder={tr('— wybierz —')} value={value ?? ''} onChange={(v) => onChange(v || null)}
          options={column.settings?.options || []} mapOptionToValue={(o) => o.id} mapOptionToLabel={(o) => o.title} />
      </div>
    );
  }
  if (t === 'checkbox') {
    return (
      <div className="w-40">
        <CustomSelect compact value={String(value)} onChange={(v) => onChange(v === 'true')}
          options={[{ value: 'true', label: tr('Zaznaczone') }, { value: 'false', label: tr('Niezaznaczone') }]} />
      </div>
    );
  }
  if (t === 'date') return <div className="w-40"><CustomDatePicker compact value={value || ''} onChange={(v) => onChange(v)} /></div>;
  if (t === 'number') return <input type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value)} className="text-sm bg-gray-100 dark:bg-gray-700/50 rounded px-2 py-1 w-20 outline-none" />;
  return <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={tr('wartość')} className="text-sm bg-gray-100 dark:bg-gray-700/50 rounded px-2 py-1 outline-none" />;
}

function defaultOp(type) {
  if (type === 'number') return 'eq';
  if (type === 'date') return 'on';
  if (['text', 'long_text', 'link'].includes(type)) return 'contains';
  return 'is';
}

export default function ViewToolbar({ columns, config, onUpdateConfig, search, onSearch, onAddItem, onExport, onImport }) {
  const filters = config.filters || [];
  const sorts = config.sorts || [];
  const fileRef = useRef(null);

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { const { records } = parseCsv(String(reader.result || '')); onImport?.(records); };
    reader.readAsText(f);
    e.target.value = '';
  };
  const filterableCols = columns.filter(c => c.type !== 'files');

  const addFilter = (col) => onUpdateConfig({ filters: [...filters, { columnId: col.id, op: defaultOp(col.type), value: col.type === 'checkbox' ? true : null }] });
  const updateFilter = (i, patch) => onUpdateConfig({ filters: filters.map((f, j) => j === i ? { ...f, ...patch } : f) });
  const removeFilter = (i) => onUpdateConfig({ filters: filters.filter((_, j) => j !== i) });

  const addSort = (col) => onUpdateConfig({ sorts: [{ columnId: col.id, dir: 'asc' }] });
  const clearSort = () => onUpdateConfig({ sorts: [] });

  return (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      <Button size="sm" icon={Plus} onClick={onAddItem}>Nowy element</Button>

      <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-700/50 rounded-lg px-2.5 py-1.5">
        <Search size={14} className="text-gray-400" />
        <input value={search || ''} onChange={(e) => onSearch(e.target.value)} placeholder="Szukaj..."
          className="bg-transparent text-sm outline-none w-32 text-gray-700 dark:text-gray-200" />
      </div>

      {/* Filtry */}
      <Popover width={340} triggerClassName="inline-flex" trigger={
        <button className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg ${filters.length ? 'bg-accent-primary/10 text-accent-primary' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'}`}>
          <SlidersHorizontal size={14} /> Filtruj {filters.length ? `(${filters.length})` : ''}
        </button>
      }>
        {() => (
          <div className="p-3">
            {filters.map((f, i) => {
              const col = columns.find(c => c.id === f.columnId);
              if (!col) return null;
              return (
                <div key={i} className="flex items-center gap-1.5 mb-2">
                  <span className="text-xs text-gray-500 w-16 truncate">{col.name}</span>
                  {col.type === 'number' && (
                    <div className="w-14 shrink-0"><CustomSelect compact value={f.op} onChange={(v) => updateFilter(i, { op: v })}
                      options={[{ value: 'eq', label: '=' }, { value: 'gt', label: '>' }, { value: 'lt', label: '<' }]} /></div>
                  )}
                  {col.type === 'date' && (
                    <div className="w-16 shrink-0"><CustomSelect compact value={f.op} onChange={(v) => updateFilter(i, { op: v })}
                      options={[{ value: 'on', label: '=' }, { value: 'after', label: tr('po') }, { value: 'before', label: tr('przed') }]} /></div>
                  )}
                  <FilterValue column={col} value={f.value} onChange={(v) => updateFilter(i, { value: v })} />
                  <button onClick={() => removeFilter(i)} className="text-gray-400 hover:text-red-500 ml-auto"><X size={14} /></button>
                </div>
              );
            })}
            <Popover width={200} trigger={<button className="flex items-center gap-1 text-sm text-accent-primary mt-1"><Plus size={14} /> Dodaj filtr</button>}>
              {({ close }) => (
                <div className="p-1 max-h-56 overflow-y-auto custom-scrollbar">
                  {filterableCols.map(c => {
                    const t = getColumnType(c.type);
                    return (
                      <button key={c.id} onClick={() => { addFilter(c); close(); }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 text-left text-sm">
                        <ColumnIcon name={t.icon} size={14} className="text-gray-400" /> {c.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </Popover>
          </div>
        )}
      </Popover>

      {/* Sortowanie */}
      <Popover width={220} triggerClassName="inline-flex" trigger={
        <button className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg ${sorts.length ? 'bg-accent-primary/10 text-accent-primary' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'}`}>
          <ArrowUpDown size={14} /> Sortuj
        </button>
      }>
        {({ close }) => (
          <div className="p-2">
            {sorts.length > 0 && (
              <div className="flex items-center justify-between px-2 py-1 mb-1">
                <span className="text-xs text-gray-500">{columns.find(c => c.id === sorts[0].columnId)?.name}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => onUpdateConfig({ sorts: [{ ...sorts[0], dir: sorts[0].dir === 'asc' ? 'desc' : 'asc' }] })} className="text-xs text-accent-primary">{sorts[0].dir === 'asc' ? '↑ rosnąco' : '↓ malejąco'}</button>
                  <button onClick={clearSort} className="text-gray-400 hover:text-red-500"><X size={13} /></button>
                </div>
              </div>
            )}
            <div className="max-h-52 overflow-y-auto custom-scrollbar">
              {columns.map(c => {
                const t = getColumnType(c.type);
                return (
                  <button key={c.id} onClick={() => { addSort(c); close(); }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 text-left text-sm">
                    <ColumnIcon name={t.icon} size={14} className="text-gray-400" /> {c.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Popover>

      {/* Więcej: Eksport / Import CSV */}
      <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
      <Popover align="right" width={190} triggerClassName="inline-flex" trigger={
        <button className="flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50"><MoreHorizontal size={16} /></button>
      }>
        {({ close }) => (
          <div className="p-1.5">
            <button onClick={() => { onExport?.(); close(); }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 text-sm text-gray-700 dark:text-gray-200"><Download size={14} /> Eksportuj CSV</button>
            <button onClick={() => { fileRef.current?.click(); close(); }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 text-sm text-gray-700 dark:text-gray-200"><Upload size={14} /> Importuj CSV</button>
          </div>
        )}
      </Popover>
    </div>
  );
}
