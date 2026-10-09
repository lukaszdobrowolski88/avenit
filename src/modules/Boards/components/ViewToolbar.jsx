import React, { useMemo, useState } from 'react';
import { Search, SlidersHorizontal, ArrowUpDown, X, Check, ChevronDown, UserCheck } from 'lucide-react';
import Popover from './Popover';
import ColumnIcon from './ColumnIcon';
import { Avatar } from './cells/PeopleCell';
import { listArrowNav } from './cells/StatusCell';
import CustomSelect from '../../../components/CustomSelect';
import CustomDatePicker from '../../../components/CustomDatePicker';
import '../../../components/toolbar.css';
import '../../../components/pickList.css';
import { tr } from '../../../i18n';
import { getColumnType } from '../lib/columnTypes';
import { ME, filterHasValue } from '../lib/viewData';

const lower = (v) => String(v ?? '').trim().toLowerCase();

// Lista osób do wyboru (pick-pop): szukajka, „Ja” na górze, potem pozostali. Wspólna dla filtra
// „Osoby” i zbiorczego przypisania w tabeli. value: e-mail albo ME; extra — dodatkowe pozycje na dole.
export function PeoplePickList({ people = [], me, value, onPick, label, extra = null }) {
  const [q, setQ] = useState('');
  const s = q.trim().toLowerCase();
  const list = useMemo(() => {
    const meL = lower(me);
    return people.filter(p => lower(p.email) !== meL)
      .filter(p => !s || (p.name || '').toLowerCase().includes(s) || (p.email || '').toLowerCase().includes(s));
  }, [s, people, me]);
  const meRow = !!me && (!s || tr('Ja').toLowerCase().includes(s) || lower(me).includes(s));
  const opt = (key, sel, content, pick) => (
    <button key={key} type="button" role="option" aria-selected={sel} onClick={pick} className="pick-opt text-gray-800 dark:text-gray-100">
      {content}
      {sel && <Check size={15} className="ml-auto shrink-0" aria-hidden="true" />}
    </button>
  );
  return (
    <div className="flex flex-col" onKeyDown={listArrowNav}>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Szukaj osoby...')}
        aria-label={tr('Szukaj osoby...')} className="pick-search bg-transparent text-gray-800 dark:text-gray-100" />
      <div role="listbox" aria-label={label} className="max-h-64 overflow-y-auto custom-scrollbar py-1">
        {meRow && opt('__me__', value === ME, (
          <><span className="w-[22px] h-[22px] shrink-0 grid place-items-center rounded-full bg-[rgb(var(--accent-primary-lighter))] text-[rgb(var(--accent-primary-darkest))]" aria-hidden="true"><UserCheck size={13} /></span>
            <span className="truncate font-semibold">{tr('Ja')}</span></>
        ), () => onPick(ME))}
        {list.map(p => opt(p.email, !!value && lower(value) === lower(p.email), (
          <><Avatar person={p} size={22} /><span className="truncate">{p.name || p.email}</span></>
        ), () => onPick(p.email, p)))}
        {!list.length && !meRow && <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">{tr('Brak wyników')}</div>}
      </div>
      {extra}
    </div>
  );
}

// Wybór osoby do filtra „Osoby” („Ja” zapisuje się jako bieżący użytkownik — wspólny widok z „Ja”
// działa dla każdego).
function PersonPicker({ value, onChange, people = [], me, label }) {
  const selected = value === ME ? { name: tr('Ja') } : people.find(p => lower(p.email) === lower(value)) || (value ? { name: value } : null);
  return (
    <Popover width={280} bare className="pick-pop overflow-hidden" triggerClassName="w-full" trigger={
      <button type="button" aria-label={selected ? `${label}: ${selected.name}` : label}
        className="w-full h-8 px-2.5 flex items-center gap-1.5 rounded-lg text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/40">
        <span className={`flex-1 min-w-0 truncate ${selected ? 'text-gray-800 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>{selected ? selected.name : tr('— wybierz —')}</span>
        <ChevronDown size={14} className="shrink-0 text-gray-500 dark:text-gray-400" aria-hidden="true" />
      </button>
    }>
      {({ close }) => <PeoplePickList people={people} me={me} value={value} label={label} onPick={(v) => { onChange(v); close(); }} />}
    </Popover>
  );
}

// Wybór wartości do filtra zależny od typu kolumny.
function FilterValue({ column, value, onChange, people, me }) {
  const t = column.type;
  if (t === 'people') return <PersonPicker value={value} onChange={onChange} people={people} me={me} label={column.name} />;
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

export default function ViewToolbar({ columns, config, onUpdateConfig, search, onSearch, people = [], me = null, searchRef }) {
  const filters = config.filters || [];
  const sorts = config.sorts || [];
  const filterableCols = columns.filter(c => c.type !== 'files');
  const activeFilters = filters.filter(filterHasValue).length;
  // „Moje” — jedno kliknięcie: tylko zadania przypisane do mnie (osobiste, jak inne filtry).
  const canMine = !!me && columns.some(c => c.type === 'people');

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
        <input ref={searchRef} type="search" className="tool-search-input bg-transparent" value={search || ''} onChange={(e) => onSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape' && e.currentTarget.value === '') e.currentTarget.blur(); }}
          placeholder={tr('Szukaj...')} aria-label={tr('Szukaj')} aria-keyshortcuts="/" />
      </label>

      {canMine && (
        <button type="button" className="tool-btn" aria-pressed={!!config.mine} onClick={() => onUpdateConfig({ mine: !config.mine })}
          title={tr('Tylko zadania przypisane do mnie')}>
          <UserCheck size={15} aria-hidden="true" /> {tr('Moje')}
        </button>
      )}

      {/* Filtry */}
      <Popover width={360} bare className="pick-pop" triggerClassName="inline-flex" trigger={
        <button type="button" className={`tool-btn${activeFilters ? ' tool-btn--active' : ''}`}>
          <SlidersHorizontal size={15} aria-hidden="true" /> {tr('Filtruj')}{activeFilters ? ` · ${activeFilters}` : ''}
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
                  <div className="min-w-0 flex-1"><FilterValue column={col} value={f.value} people={people} me={me} onChange={(v) => updateFilter(i, { value: v })} /></div>
                  <button type="button" onClick={() => removeFilter(i)} aria-label={tr('Usuń filtr {name}', { name: col.name })}
                    className="shrink-0 p-1 rounded-full text-gray-500 dark:text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"><X size={14} aria-hidden="true" /></button>
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
                  className="p-1 rounded-full text-gray-500 dark:text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"><X size={14} aria-hidden="true" /></button>
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
