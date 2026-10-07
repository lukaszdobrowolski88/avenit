import React, { useId, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { memberName } from '../lib/givingApi';
import { tr } from '../../../i18n';

// Bez polskich znaków i wielkości liter — „lukasz” znajdzie „Łukasz”.
export const foldText = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');

export function filterMembers(members, query, limit = 50) {
  const q = foldText(query).trim();
  const list = members || [];
  if (!q) return list.slice(0, limit);
  const parts = q.split(/\s+/);
  return list.filter((m) => {
    const hay = foldText(`${m.first_name || ''} ${m.last_name || ''} ${m.email || ''}`);
    return parts.every((p) => hay.includes(p));
  }).slice(0, limit);
}

/**
 * Wybór członka z wyszukiwaniem (zamiast długiej listy). Lista renderuje się pod polem
 * (nie w portalu), więc działa też w przewijanym oknie modalnym. Klawiatura: ↑/↓, Enter, Esc.
 */
export default function MemberPicker({ label, value, onChange, members, emptyLabel }) {
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = useMemo(() => (members || []).find((m) => m.id === value) || null, [members, value]);
  const results = useMemo(() => filterMembers(members, query), [members, query]);

  const pick = (m) => {
    onChange(m ? m.id : '');
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { if (open && results[active]) { e.preventDefault(); pick(results[active]); } }
    else if (e.key === 'Escape') { if (open) { e.stopPropagation(); setOpen(false); } }
  };

  return (
    <div>
      {label && <label htmlFor={id} className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{label}</label>}
      {selected && !open ? (
        <div className="flex items-center justify-between gap-2 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{memberName(selected)}</div>
            {selected.email && <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{selected.email}</div>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button type="button" onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }} aria-label={tr('Zmień darczyńcę')} className="px-2 py-1 text-xs rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">{tr('Zmień')}</button>
            <button type="button" onClick={() => pick(null)} className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700" aria-label={tr('Usuń wybór darczyńcy')}><X size={14} /></button>
          </div>
        </div>
      ) : (
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            id={id}
            ref={inputRef}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && results[active] ? `${id}-opt-${active}` : undefined}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
            placeholder={tr('Szukaj po imieniu, nazwisku lub e-mailu…')}
            className="w-full pl-9 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
          />
        </div>
      )}
      {open && (
        <ul id={listId} role="listbox" className="mt-1 max-h-56 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 divide-y divide-gray-50 dark:divide-gray-700/50">
          <li role="option" aria-selected={!value} onMouseDown={(e) => { e.preventDefault(); pick(null); }} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40">
            {emptyLabel || tr('— darczyńca spoza bazy —')}
          </li>
          {results.length === 0 ? (
            <li className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">{tr('Nikogo nie znaleziono.')}</li>
          ) : results.map((m, i) => (
            <li
              key={m.id}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={m.id === value}
              onMouseDown={(e) => { e.preventDefault(); pick(m); }}
              onMouseEnter={() => setActive(i)}
              className={`px-4 py-2 cursor-pointer ${i === active ? 'bg-gray-100 dark:bg-gray-700/60' : ''}`}
            >
              <div className="text-sm text-gray-900 dark:text-white">{memberName(m)}</div>
              {m.email && <div className="text-xs text-gray-500 dark:text-gray-400">{m.email}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
