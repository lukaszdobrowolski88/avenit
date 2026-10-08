import React from 'react';
import { Search, SlidersHorizontal, ArrowUpDown, Plus, X } from 'lucide-react';
import Popover from './Popover';
import ColumnIcon from './ColumnIcon';
import CustomSelect from '../../../components/CustomSelect';
import CustomDatePicker from '../../../components/CustomDatePicker';
import '../../../components/toolbar.css';
import '../../../components/pickList.css';
import { tr } from '../../../i18n';
import { getColumnType, cellToText } from '../lib/columnTypes';

// Wybór wartości do filtra zależny od typu kolumny.
function FilterValue({ column, value, onChange }) {
  const t = column.type;
  if (t === 'status' || t === 'priority') {
    return (
      <div className="w-full">
        <CustomSelect compact placeholder={tr('— wybierz —')} value={value ?? ''} onChange={(v) => onChange(v || null)}
          options={column.settings?.labels || []} mapOptionToValue={(l) => l.id} mapOptionToLabel={(l) => l.title} />
      </div>
    );
  }
  if (t === 'dropdown') {
    return (
      <div className="w-full">
        <CustomSelect compact placeholder={tr('— wybierz —')} value={value ?? ''} onChange={(v) => onChange(v || null)}
          options={column.settings?.options || []} mapOptionToValue={(o) => o.id} mapOptionToLabel={(o) => o.title} />
      </div>
    );
  }
  if (t === 'checkbox') {
    return (
      <div className="w-full">
        <CustomSelect compact value={String(value)} onChange={(v) => onChange(v === 'true')}
          options={[{ value: 'true', label: tr('Zaznaczone') }, { value: 'false', label: tr('Niezaznaczone') }]} />
      </div>
    );
  }
  if (t === 'date') return <div className="w-full"><CustomDatePicker compact value={value || ''} onChange={(v) => onChange(v)} /></div>;
  const field = 'w-full h-8 px-2.5 rounded-lg text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 outline-none focus:ring-2 focus:ring-accent-primary-light/40';
  if (t === 'number') return <input type="number" inputMode="decimal" value={value ?? ''} onChange={(e) => onChange(e.target.value)} aria-label={column.name} className={field} />;
  return <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={tr('wartość')} aria-label={column.name} className={field} />;
}

function defaultOp(type) {
  if (type === 'number') return 'eq';
  if (type === 'date') return 'on';
  if (['text', 'long_text', 'link'].includes(type)) return 'contains';
  return 'is';
}

export default function ViewToolbar({ columns, config, onUpdateConfig, search, onSearch }) {
  const filters = config.filters || [];
  const sorts = config.sorts || [];
  const filterableCols = columns.filter(c => c.type !== 'files');

  const addFilter = (col) => onUpdateConfig({ filters: [...filters, { columnId: col.id, op: defaultOp(col.type), value: col.type === 'checkbox' ? true : null }] });
  const updateFilter = (i, patch) => onUpdateConfig({ filters: filters.map((f, j) => j === i ? { ...f, ...patch } : f) });
  const removeFilter = (i) => onUpdateConfig({ filters: filters.filter((_, j) => j !== i) });

  const addSort = (col) => onUpdateConfig({ sorts: [{ columnId: col.id, dir: 'asc' }] });
  const clearSort = () => onUpdateConfig({ sorts: [] });

  // Pasek jak narzędzia Grafiku (toolbar.css): szukanie, Filtruj, Sortuj — jedna wysokość i kształt.
  // „Dodaj zadanie”, eksport/import CSV i widoki są w nagłówku zakładki (BoardView).
  return (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      <label className="tool-search">
        <Search size={15} aria-hidden="true" />
        <input type="search" className="tool-search-input bg-transparent" value={search || ''} onChange={(e) => onSearch(e.target.value)} placeholder={tr('Szukaj...')} aria-label={tr('Szukaj')} />
      </label>

      {/* Filtry */}
      <Popover width={360} bare className="pick-pop" triggerClassName="inline-flex" trigger={
        <button type="button" className={`tool-btn${filters.length ? ' tool-btn--active' : ''}`}>
          <SlidersHorizontal size={15} aria-hidden="true" /> {tr('Filtruj')}{filters.length ? ` · ${filters.length}` : ''}
        </button>
      }>
        {() => (
          <div className="py-1">
            <div className="pick-section">{tr('Filtry')}</div>
            {filters.length === 0 && (
              <p className="px-3 pb-2 text-xs text-gray-500 dark:text-gray-400">{tr('Pokaż tylko zadania spełniające warunki — wybierz kolumnę poniżej.')}</p>
            )}
            {filters.map((f, i) => {
              const col = columns.find(c => c.id === f.columnId);
              if (!col) return null;
              return (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 w-20 truncate" title={col.name}>{col.name}</span>
                  {col.type === 'number' && (
                    <div className="w-16 shrink-0"><CustomSelect compact value={f.op} onChange={(v) => updateFilter(i, { op: v })}
                      options={[{ value: 'eq', label: '=' }, { value: 'gt', label: '>' }, { value: 'lt', label: '<' }]} /></div>
                  )}
                  {col.type === 'date' && (
                    <div className="w-20 shrink-0"><CustomSelect compact value={f.op} onChange={(v) => updateFilter(i, { op: v })}
                      options={[{ value: 'on', label: tr('w dniu') }, { value: 'after', label: tr('po') }, { value: 'before', label: tr('przed') }]} /></div>
                  )}
                  <div className="min-w-0 flex-1"><FilterValue column={col} value={f.value} onChange={(v) => updateFilter(i, { value: v })} /></div>
                  <button type="button" onClick={() => removeFilter(i)} aria-label={tr('Usuń filtr {name}', { name: col.name })}
                    className="shrink-0 p-1 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"><X size={14} aria-hidden="true" /></button>
                </div>
              );
            })}
            <div className="mt-1 border-t border-gray-100 dark:border-white/10">
              <div className="pick-section">{tr('Dodaj filtr')}</div>
              <div className="max-h-56 overflow-y-auto custom-scrollbar">
                {filterableCols.map(c => {
                  const t = getColumnType(c.type);
                  return (
                    <button key={c.id} type="button" onClick={() => addFilter(c)} className="pick-opt text-gray-800 dark:text-gray-100">
                      <ColumnIcon name={t.icon} size={15} className="text-gray-400 shrink-0" /> <span className="truncate">{c.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Popover>

      {/* Sortowanie */}
      <Popover width={240} bare className="pick-pop" triggerClassName="inline-flex" trigger={
        <button type="button" className={`tool-btn${sorts.length ? ' tool-btn--active' : ''}`}>
          <ArrowUpDown size={15} aria-hidden="true" /> {tr('Sortuj')}
        </button>
      }>
        {({ close }) => (
          <div className="py-1">
            {sorts.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-white/10">
                <span className="flex-1 min-w-0 truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{columns.find(c => c.id === sorts[0].columnId)?.name}</span>
                <button type="button" onClick={() => onUpdateConfig({ sorts: [{ ...sorts[0], dir: sorts[0].dir === 'asc' ? 'desc' : 'asc' }] })}
                  className="text-xs font-semibold px-2.5 h-7 rounded-full bg-[rgba(42,35,18,0.06)] dark:bg-white/10 text-gray-700 dark:text-gray-200">
                  {sorts[0].dir === 'asc' ? tr('rosnąco') : tr('malejąco')}
                </button>
                <button type="button" onClick={clearSort} aria-label={tr('Wyłącz sortowanie')}
                  className="p-1 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"><X size={14} aria-hidden="true" /></button>
              </div>
            )}
            <div className="pick-section">{tr('Sortuj według')}</div>
            <div className="max-h-52 overflow-y-auto custom-scrollbar" role="listbox" aria-label={tr('Sortuj według')}>
              {columns.map(c => {
                const t = getColumnType(c.type);
                const sel = sorts[0]?.columnId === c.id;
                return (
                  <button key={c.id} type="button" role="option" aria-selected={sel} onClick={() => { addSort(c); close(); }} className="pick-opt text-gray-800 dark:text-gray-100">
                    <ColumnIcon name={t.icon} size={15} className="text-gray-400 shrink-0" /> <span className="truncate">{c.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Popover>

    </div>
  );
}
