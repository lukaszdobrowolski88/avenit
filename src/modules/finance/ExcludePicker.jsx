import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { tr } from '../../i18n';

// Wybór, co wliczyć do raportu: zaznaczone = wliczone, odznaczone = wykluczone.
// options: [{ value, label, color? }]; excluded: tablica wykluczonych wartości.
export default function ExcludePicker({ label, options, excluded = [], onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const ex = new Set(excluded.map(String));
  const total = options.length;
  const included = options.filter((o) => !ex.has(String(o.value))).length;
  const summary = included === total ? tr('wszystkie') : included === 0 ? tr('wyłączone') : tr('{n} z {total}', { n: included, total });
  const toggle = (v) => {
    const k = String(v);
    onChange(ex.has(k) ? excluded.filter((x) => String(x) !== k) : [...excluded, k]);
  };
  const q = query.trim().toLowerCase();
  const visible = q ? options.filter((o) => String(o.label).toLowerCase().includes(q)) : options;

  return (
    <div className="relative" ref={ref}>
      <span className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{label}</span>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} disabled={total === 0}
        className={`w-full px-3 py-2.5 rounded-xl border text-sm flex items-center justify-between gap-2 bg-white dark:bg-gray-800 disabled:opacity-50 ${included < total ? 'border-accent-primary text-gray-900 dark:text-white' : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200'}`}>
        <span className="truncate">{total === 0 ? tr('brak') : summary}</span>
        <ChevronDown size={15} className="shrink-0 text-gray-400" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 sm:right-auto sm:w-72 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-30 p-2">
          <div className="flex items-center gap-3 px-1 pb-2 mb-1 border-b border-gray-100 dark:border-gray-800 text-xs">
            <button type="button" onClick={() => onChange([])} className="text-accent-primary hover:underline">{tr('Wszystkie')}</button>
            <button type="button" onClick={() => onChange(options.map((o) => String(o.value)))} className="text-gray-500 hover:underline">{tr('Żadne')}</button>
            <span className="ml-auto text-gray-400 tabular-nums">{included}/{total}</span>
          </div>
          {options.length > 8 && (
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr('Szukaj…')} aria-label={tr('Szukaj…')}
              className="w-full mb-1 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" />
          )}
          <div className="max-h-64 overflow-y-auto custom-scrollbar">
            {visible.map((o) => (
              <label key={String(o.value)} className="flex items-center gap-2 px-1.5 py-1.5 rounded-lg text-sm text-gray-700 dark:text-gray-200 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                <input type="checkbox" checked={!ex.has(String(o.value))} onChange={() => toggle(o.value)} className="rounded border-gray-300 text-accent-primary focus:ring-accent-primary" />
                {o.color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: o.color }} />}
                <span className={`truncate ${o.muted ? 'italic text-gray-500' : ''}`}>{o.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
