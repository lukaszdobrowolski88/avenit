import React, { useState } from 'react';
import { Tag, X, Plus } from 'lucide-react';
import { tr } from '../../i18n';

// Tagi transakcji / pozycji budżetu: wybrane jako kolorowe chipy + podpowiedzi z palety
// (klik = dodaj) + wpisanie nowego (Enter albo „+”). Nowe tagi dopisuje do palety rodzic.
export default function TagPicker({ value = [], onChange, palette = [], colorOf, id }) {
  const [draft, setDraft] = useState('');
  const tags = Array.isArray(value) ? value : [];
  const color = (name) => (colorOf ? colorOf(name) : '#6b7280');
  const add = (raw) => {
    const t = String(raw || '').trim();
    if (!t) return;
    // Istniejący tag o innej wielkości liter — użyj nazwy z palety (bez „Remont” i „remont”).
    const known = palette.find((p) => String(p.name).toLowerCase() === t.toLowerCase());
    const name = known ? known.name : t;
    if (!tags.includes(name)) onChange([...tags, name]);
    setDraft('');
  };
  const remove = (t) => onChange(tags.filter((x) => x !== t));
  const q = draft.trim().toLowerCase();
  const suggestions = palette
    .filter((p) => !tags.includes(p.name) && (!q || String(p.name).toLowerCase().includes(q)))
    .slice(0, 12);

  return (
    <div>
      {tags.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mb-2">
          {tags.map((t) => (
            <span key={t} className="pl-2 pr-1 py-0.5 rounded-full text-xs flex items-center gap-1 font-medium"
              style={{ background: `${color(t)}22`, color: color(t) }}>
              <Tag size={11} />{t}
              <button type="button" onClick={() => remove(t)} className="p-0.5 rounded-full hover:bg-black/10" aria-label={tr('Usuń tag {name}', { name: t })}><X size={11} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          id={id}
          className="flex-1 min-w-0 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(draft); } }}
          placeholder={tr('Wpisz tag i naciśnij Enter')}
        />
        <button type="button" onClick={() => add(draft)} disabled={!draft.trim()}
          className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition disabled:opacity-50"
          aria-label={tr('Dodaj tag')}>
          <Plus size={18} />
        </button>
      </div>
      {suggestions.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mt-2">
          {suggestions.map((p) => (
            <button key={p.id || p.name} type="button" onClick={() => add(p.name)}
              className="px-2 py-0.5 rounded-full text-xs font-medium border border-dashed hover:border-solid transition"
              style={{ borderColor: color(p.name), color: color(p.name) }}>
              + {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Tylko do odczytu: chipy tagów w tabelach.
export function TagChips({ tags, colorOf, className = '' }) {
  if (!Array.isArray(tags) || tags.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {tags.map((t) => {
        const c = colorOf ? colorOf(t) : '#6b7280';
        return (
          <span key={t} className="px-1.5 py-0.5 rounded-full text-[11px] flex items-center gap-1 font-medium" style={{ background: `${c}22`, color: c }}>
            <Tag size={10} />{t}
          </span>
        );
      })}
    </div>
  );
}
