import React, { useState, useEffect, useRef } from 'react';
import { Mail, Phone, MapPin, ThumbsUp, Play, Pause, ExternalLink } from 'lucide-react';
import { formatDuration } from '../../lib/columnTypes';

// ── E-mail ───────────────────────────────────────────────────────────
export function EmailCell({ value, onChange, readOnly }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => { setV(value ?? ''); }, [value]);
  if (readOnly) return value ? <a href={`mailto:${value}`} className="px-2 text-sm text-accent-primary truncate hover:underline flex items-center gap-1"><Mail size={12} />{value}</a> : null;
  return <input type="email" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== (value ?? '') && onChange(v)}
    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} placeholder="email@..."
    className="w-full h-full bg-transparent px-2 text-sm text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-accent-primary/40 rounded" />;
}

// ── Telefon ──────────────────────────────────────────────────────────
export function PhoneCell({ value, onChange, readOnly }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => { setV(value ?? ''); }, [value]);
  if (readOnly) return value ? <a href={`tel:${value}`} className="px-2 text-sm text-accent-primary truncate hover:underline flex items-center gap-1"><Phone size={12} />{value}</a> : null;
  return <input type="tel" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== (value ?? '') && onChange(v)}
    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} placeholder="+48..."
    className="w-full h-full bg-transparent px-2 text-sm text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-accent-primary/40 rounded" />;
}

// ── Lokalizacja ──────────────────────────────────────────────────────
export function LocationCell({ value, onChange, readOnly }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => { setV(value ?? ''); }, [value]);
  if (readOnly) return value ? <span className="px-2 text-sm text-gray-600 dark:text-gray-300 truncate flex items-center gap-1"><MapPin size={12} />{value}</span> : null;
  return (
    <div className="w-full h-full flex items-center">
      <input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== (value ?? '') && onChange(v)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} placeholder="Adres..."
        className="flex-1 h-full bg-transparent px-2 text-sm text-gray-700 dark:text-gray-200 outline-none" />
      {value && <a href={`https://maps.google.com/?q=${encodeURIComponent(value)}`} target="_blank" rel="noreferrer" className="pr-2 text-gray-400 hover:text-accent-primary"><ExternalLink size={12} /></a>}
    </div>
  );
}

// ── Głosowanie ───────────────────────────────────────────────────────
export function VoteCell({ value = [], onChange, me, readOnly }) {
  const votes = value || [];
  const voted = me && votes.includes(me);
  const toggle = () => { if (!me) return; onChange(voted ? votes.filter(e => e !== me) : [...votes, me]); };
  return (
    <div className="w-full h-full flex items-center justify-center gap-1.5">
      <button disabled={readOnly || !me} onClick={toggle}
        className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${voted ? 'bg-accent-primary text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300'} ${!me ? 'opacity-60' : 'hover:opacity-90'}`}>
        <ThumbsUp size={12} /> {votes.length || 0}
      </button>
    </div>
  );
}

// ── Śledzenie czasu ──────────────────────────────────────────────────
export function TimeTrackingCell({ value, onChange, readOnly }) {
  const v = value || { seconds: 0, running: false, startedAt: null };
  const [, force] = useState(0);
  const timer = useRef(null);
  useEffect(() => {
    if (v.running) { timer.current = setInterval(() => force(x => x + 1), 1000); return () => clearInterval(timer.current); }
  }, [v.running]);
  const elapsed = (v.seconds || 0) + (v.running && v.startedAt ? Math.floor((Date.now() - new Date(v.startedAt).getTime()) / 1000) : 0);
  const toggle = () => {
    if (v.running) onChange({ seconds: elapsed, running: false, startedAt: null });
    else onChange({ seconds: v.seconds || 0, running: true, startedAt: new Date().toISOString() });
  };
  return (
    <div className="w-full h-full flex items-center justify-between px-2 gap-1">
      <span className={`text-xs tabular-nums ${v.running ? 'text-accent-primary font-medium' : 'text-gray-600 dark:text-gray-300'}`}>{formatDuration(elapsed)}</span>
      {!readOnly && (
        <button onClick={toggle} className={`p-1 rounded ${v.running ? 'text-red-500' : 'text-green-500'} hover:bg-gray-100 dark:hover:bg-gray-700`}>
          {v.running ? <Pause size={13} /> : <Play size={13} />}
        </button>
      )}
    </div>
  );
}

// ── Metadane (item_id / created_log / last_updated) — tylko odczyt ────
function fmtDate(iso) { try { return new Date(iso).toLocaleString('pl-PL', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } }
export function MetaCell({ column, item }) {
  let text = '';
  if (column.type === 'item_id') text = item?.id ? `#${String(item.id).slice(0, 8)}` : '';
  else if (column.type === 'created_log') text = item?.created_at ? `${fmtDate(item.created_at)}${item.created_by ? ' · ' + item.created_by : ''}` : '';
  else if (column.type === 'last_updated') text = item?.updated_at ? fmtDate(item.updated_at) : '';
  return <div className="w-full h-full flex items-center px-2 text-xs text-gray-400 truncate">{text}</div>;
}
