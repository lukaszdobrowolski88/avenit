import React, { useState, useEffect } from 'react';
import { Star, Link as LinkIcon, Paperclip, Plus, X, ExternalLink } from 'lucide-react';
import Popover from '../Popover';
import { evalFormula } from '../../lib/formula';

// ── Tekst (inline) ───────────────────────────────────────────────────
export function TextCell({ value, onChange, readOnly, align = 'left' }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => { setV(value ?? ''); }, [value]);
  if (readOnly) return <div className="px-2 text-sm text-gray-700 dark:text-gray-200 truncate w-full">{value}</div>;
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v !== (value ?? '')) onChange(v); }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      className={`w-full h-full bg-transparent px-2 text-sm text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-accent-primary/40 rounded text-${align}`}
    />
  );
}

// ── Liczba ───────────────────────────────────────────────────────────
export function NumberCell({ column, value, onChange, readOnly }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => { setV(value ?? ''); }, [value]);
  const unit = column?.settings?.unit;
  if (readOnly) return <div className="px-2 text-sm text-gray-700 dark:text-gray-200 text-right w-full">{value != null ? `${value}${unit ? ' ' + unit : ''}` : ''}</div>;
  return (
    <div className="w-full h-full flex items-center">
      <input type="number" value={v} onChange={(e) => setV(e.target.value)}
        onBlur={() => { const n = v === '' ? null : Number(v); if (n !== value) onChange(n); }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        className="w-full h-full bg-transparent px-2 text-sm text-right text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-accent-primary/40 rounded" />
      {unit && value != null && <span className="text-xs text-gray-400 pr-2">{unit}</span>}
    </div>
  );
}

// ── Data ─────────────────────────────────────────────────────────────
export function DateCell({ value, onChange, readOnly }) {
  if (readOnly) return <div className="px-2 text-sm text-gray-600 dark:text-gray-300 w-full text-center">{value || ''}</div>;
  return (
    <input type="date" value={value || ''} onChange={(e) => onChange(e.target.value || null)}
      className="w-full h-full bg-transparent px-2 text-sm text-gray-600 dark:text-gray-300 outline-none text-center focus:ring-2 focus:ring-accent-primary/40 rounded [color-scheme:light] dark:[color-scheme:dark]" />
  );
}

// ── Oś czasu (start → koniec) ────────────────────────────────────────
export function TimelineCell({ value, onChange, readOnly }) {
  const v = value || {};
  const label = v.start ? `${v.start}${v.end ? ' → ' + v.end : ''}` : '';
  const Bar = (
    <div className="w-full h-full flex items-center px-2">
      {v.start ? (
        <div className="w-full rounded-full h-5 flex items-center justify-center text-[11px] text-white bg-accent-primary/80 px-2 truncate">{label}</div>
      ) : <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>}
    </div>
  );
  if (readOnly) return Bar;
  return (
    <Popover width={240} trigger={Bar}>
      {() => (
        <div className="p-3 space-y-2">
          <label className="block text-xs text-gray-500">Początek
            <input type="date" value={v.start || ''} onChange={(e) => onChange({ ...v, start: e.target.value || null })}
              className="mt-1 w-full text-sm bg-gray-100 dark:bg-gray-700/50 rounded px-2 py-1.5 outline-none [color-scheme:light] dark:[color-scheme:dark]" />
          </label>
          <label className="block text-xs text-gray-500">Koniec
            <input type="date" value={v.end || ''} onChange={(e) => onChange({ ...v, end: e.target.value || null })}
              className="mt-1 w-full text-sm bg-gray-100 dark:bg-gray-700/50 rounded px-2 py-1.5 outline-none [color-scheme:light] dark:[color-scheme:dark]" />
          </label>
          {(v.start || v.end) && <button onClick={() => onChange(null)} className="text-xs text-gray-400 hover:text-red-500">Wyczyść</button>}
        </div>
      )}
    </Popover>
  );
}

// ── Pole wyboru ──────────────────────────────────────────────────────
export function CheckboxCell({ value, onChange, readOnly }) {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <input type="checkbox" checked={!!value} disabled={readOnly} onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded accent-accent-primary cursor-pointer" />
    </div>
  );
}

// ── Link ─────────────────────────────────────────────────────────────
export function LinkCell({ value, onChange, readOnly }) {
  const v = value || {};
  if (readOnly) return v.url ? <a href={v.url} target="_blank" rel="noreferrer" className="px-2 text-sm text-accent-primary truncate hover:underline">{v.text || v.url}</a> : null;
  return (
    <Popover width={240} trigger={
      <div className="w-full h-full flex items-center px-2 gap-1 text-sm">
        {v.url ? <><LinkIcon size={13} className="text-accent-primary" /><span className="text-accent-primary truncate">{v.text || v.url}</span></>
          : <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>}
      </div>
    }>
      {() => (
        <div className="p-3 space-y-2">
          <input value={v.url || ''} onChange={(e) => onChange({ ...v, url: e.target.value })} placeholder="https://..."
            className="w-full text-sm bg-gray-100 dark:bg-gray-700/50 rounded px-2 py-1.5 outline-none" />
          <input value={v.text || ''} onChange={(e) => onChange({ ...v, text: e.target.value })} placeholder="Tekst (opcjonalnie)"
            className="w-full text-sm bg-gray-100 dark:bg-gray-700/50 rounded px-2 py-1.5 outline-none" />
          {v.url && <a href={v.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-accent-primary"><ExternalLink size={12} /> Otwórz</a>}
        </div>
      )}
    </Popover>
  );
}

// ── Ocena (gwiazdki) ─────────────────────────────────────────────────
export function RatingCell({ column, value, onChange, readOnly }) {
  const max = column?.settings?.max || 5;
  return (
    <div className="w-full h-full flex items-center justify-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <button key={i} disabled={readOnly} onClick={() => onChange(i + 1 === value ? 0 : i + 1)}>
          <Star size={15} className={i < (value || 0) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300 dark:text-gray-600'} />
        </button>
      ))}
    </div>
  );
}

// ── Pliki (metadane; upload w kolejnej fazie) ────────────────────────
export function FilesCell({ value = [], onChange, readOnly }) {
  const files = value || [];
  const [name, setName] = useState(''); const [url, setUrl] = useState('');
  const Trigger = (
    <div className="w-full h-full flex items-center justify-center gap-1 text-xs text-gray-500">
      <Paperclip size={13} /> {files.length > 0 ? files.length : ''}
    </div>
  );
  if (readOnly) return Trigger;
  return (
    <Popover width={240} trigger={Trigger}>
      {() => (
        <div className="p-2 space-y-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <a href={f.url} target="_blank" rel="noreferrer" className="flex-1 text-accent-primary truncate">{f.name || f.url}</a>
              <button onClick={() => onChange(files.filter((_, j) => j !== i))}><X size={13} className="text-gray-400 hover:text-red-500" /></button>
            </div>
          ))}
          <div className="space-y-1 pt-1 border-t border-gray-100 dark:border-gray-700">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nazwa" className="w-full text-xs bg-gray-100 dark:bg-gray-700/50 rounded px-2 py-1 outline-none" />
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL" className="w-full text-xs bg-gray-100 dark:bg-gray-700/50 rounded px-2 py-1 outline-none" />
            <button onClick={() => { if (url) { onChange([...files, { name: name || url, url }]); setName(''); setUrl(''); } }}
              className="flex items-center gap-1 text-xs text-accent-primary"><Plus size={13} /> Dodaj plik</button>
          </div>
        </div>
      )}
    </Popover>
  );
}

// ── Postęp (0-100%) ──────────────────────────────────────────────────
export function ProgressCell({ value, onChange, readOnly }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const color = v >= 100 ? '#00c875' : v >= 50 ? '#fdab3d' : '#579bfc';
  const bar = (
    <div className="w-full h-full flex items-center gap-1.5 px-2">
      <div className="flex-1 h-2 rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${v}%`, backgroundColor: color }} />
      </div>
      <span className="text-[11px] text-gray-500 w-8 text-right">{v}%</span>
    </div>
  );
  if (readOnly) return bar;
  return (
    <Popover width={200} trigger={bar}>
      {() => (
        <div className="p-3">
          <input type="range" min={0} max={100} step={5} value={v} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-accent-primary" />
          <div className="text-center text-sm text-gray-500 mt-1">{v}%</div>
        </div>
      )}
    </Popover>
  );
}

// ── Formuła (wyliczana, tylko do odczytu) ────────────────────────────
export function FormulaCell({ column, item, columns }) {
  const result = evalFormula(column?.settings?.expression, item || { cells: {} }, columns || []);
  return (
    <div className="w-full h-full flex items-center justify-end px-2 text-sm font-medium text-gray-700 dark:text-gray-200">
      {result == null ? <span className="text-gray-300 dark:text-gray-600 text-xs">—</span> : result}
    </div>
  );
}

// ── Długi tekst ──────────────────────────────────────────────────────
export function LongTextCell({ value, onChange, readOnly }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => { setV(value ?? ''); }, [value]);
  const preview = (value || '').split('\n')[0];
  if (readOnly) return <div className="px-2 text-sm text-gray-600 dark:text-gray-300 truncate w-full">{preview}</div>;
  return (
    <Popover width={300} trigger={
      <div className="w-full h-full flex items-center px-2 text-sm text-gray-600 dark:text-gray-300 truncate">
        {preview || <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>}
      </div>
    }>
      {() => (
        <div className="p-2">
          <textarea autoFocus rows={5} value={v} onChange={(e) => setV(e.target.value)}
            onBlur={() => { if (v !== (value ?? '')) onChange(v); }}
            className="w-full text-sm bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 outline-none resize-y text-gray-700 dark:text-gray-200" />
        </div>
      )}
    </Popover>
  );
}
