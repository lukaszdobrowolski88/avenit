import React, { useState, useEffect, useRef } from 'react';
import { Mail, Phone, MapPin, ThumbsUp, Play, Pause, ExternalLink } from 'lucide-react';
import { formatDuration, formatDate } from '../../lib/columnTypes';
import { CELL_INPUT } from './BasicCells';
import { appLocale, tr } from '../../../../i18n';

// Podpowiedź pola widoczna dopiero przy fokusie — wcześniej „email@…”, „+48…”, „Adres…” stały
// w każdym pustym wierszu (pusta komórka ma być pusta).
const FOCUS_HINT = 'placeholder:text-transparent focus:placeholder:text-gray-400';
// Mała ikona-akcja (napisz / zadzwoń / mapa) — pokazuje się po najechaniu na wiersz.
const ROW_ACTION = 'shrink-0 mr-1 p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/50';
const READ_LINK = 'min-w-0 px-2 text-sm text-gray-800 dark:text-gray-100 truncate flex items-center gap-1.5 hover:underline underline-offset-2 rounded outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/50';

const telHref = (v) => `tel:${String(v).replace(/[^\d+]/g, '')}`;
const mapsHref = (v) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v)}`;

// Pole w komórce: zapis na blur/Enter, Esc przywraca poprzednią wartość.
function InlineInput({ value, onChange, type = 'text', inputMode, hint, label, action }) {
  const [v, setV] = useState(value ?? '');
  const skip = useRef(false);
  useEffect(() => { setV(value ?? ''); }, [value]);
  return (
    <div className="w-full h-full flex items-center min-w-0">
      <input
        type={type}
        inputMode={inputMode}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          if (skip.current) { skip.current = false; setV(value ?? ''); return; }
          const t = v.trim();
          if (t !== (value ?? '')) onChange(t);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') { skip.current = true; e.currentTarget.blur(); }
        }}
        placeholder={hint}
        aria-label={label}
        className={`${CELL_INPUT} min-w-0 ${FOCUS_HINT}`}
      />
      {value ? action : null}
    </div>
  );
}

// ── E-mail ───────────────────────────────────────────────────────────
export function EmailCell({ column, value, onChange, readOnly }) {
  if (readOnly) return value ? <a href={`mailto:${value}`} className={READ_LINK}><Mail size={12} className="shrink-0 text-gray-400" aria-hidden="true" /><span className="truncate">{value}</span></a> : null;
  return (
    <InlineInput type="email" inputMode="email" value={value} onChange={onChange}
      hint={tr('Adres e-mail')} label={column?.name || tr('E-mail')}
      action={<a href={`mailto:${value}`} className={ROW_ACTION} aria-label={tr('Napisz e-mail do {email}', { email: value })}><Mail size={12} aria-hidden="true" /></a>} />
  );
}

// ── Telefon ──────────────────────────────────────────────────────────
export function PhoneCell({ column, value, onChange, readOnly }) {
  if (readOnly) return value ? <a href={telHref(value)} className={`${READ_LINK} tabular-nums`}><Phone size={12} className="shrink-0 text-gray-400" aria-hidden="true" /><span className="truncate">{value}</span></a> : null;
  return (
    <InlineInput type="tel" inputMode="tel" value={value} onChange={onChange}
      hint={tr('Numer telefonu')} label={column?.name || tr('Telefon')}
      action={<a href={telHref(value)} className={ROW_ACTION} aria-label={tr('Zadzwoń pod {phone}', { phone: value })}><Phone size={12} aria-hidden="true" /></a>} />
  );
}

// ── Lokalizacja ──────────────────────────────────────────────────────
export function LocationCell({ column, value, onChange, readOnly }) {
  if (readOnly) {
    return value ? (
      <a href={mapsHref(value)} target="_blank" rel="noopener noreferrer" className={READ_LINK}>
        <MapPin size={12} className="shrink-0 text-gray-400" aria-hidden="true" /><span className="truncate">{value}</span>
      </a>
    ) : null;
  }
  return (
    <InlineInput value={value} onChange={onChange} hint={tr('Adres')} label={column?.name || tr('Lokalizacja')}
      action={
        <a href={mapsHref(value)} target="_blank" rel="noopener noreferrer" className={ROW_ACTION} aria-label={tr('Pokaż na mapie')}>
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      } />
  );
}

// ── Głosowanie ───────────────────────────────────────────────────────
// Bez głosów = pusto (kciuk dopiero po najechaniu na wiersz); liczba tylko, gdy > 0.
// Oddany głos = wypełniony kciuk na miękkim tle, bez nasyconego bloku z białym tekstem.
export function VoteCell({ value = [], onChange, me, readOnly }) {
  const votes = Array.isArray(value) ? value : [];
  const n = votes.length;
  const voted = !!me && votes.includes(me);
  if (readOnly || !me) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        {n > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300 tabular-nums" role="img" aria-label={tr('Głosy: {n}', { n })}>
            <ThumbsUp size={12} aria-hidden="true" /> {n}
          </span>
        )}
      </div>
    );
  }
  const toggle = () => onChange(voted ? votes.filter(e => e !== me) : [...votes, me]);
  return (
    <div className="w-full h-full flex items-center justify-center">
      <button type="button" onClick={toggle} aria-pressed={voted}
        aria-label={voted ? tr('Cofnij głos (głosy: {n})', { n }) : tr('Zagłosuj (głosy: {n})', { n })}
        className={`inline-flex items-center gap-1 h-6 px-2 rounded-full text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/50 transition-opacity ${voted
          ? 'bg-gray-900/[0.07] dark:bg-white/10 text-gray-900 dark:text-white font-semibold'
          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-800 dark:hover:text-gray-100'} ${n === 0
          ? 'opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100' : ''}`}>
        <ThumbsUp size={12} aria-hidden="true" className={voted ? 'fill-current' : ''} />
        {n > 0 && <span>{n}</span>}
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
  const zero = elapsed === 0 && !v.running;
  return (
    <div className="w-full h-full flex items-center justify-between px-2 gap-1">
      <span className={`text-xs tabular-nums ${v.running ? 'text-gray-900 dark:text-white font-semibold' : 'text-gray-600 dark:text-gray-300'}`}>{zero ? '' : formatDuration(elapsed)}</span>
      {!readOnly && (
        <button type="button" onClick={toggle} aria-pressed={!!v.running}
          aria-label={v.running ? tr('Zatrzymaj licznik czasu') : tr('Uruchom licznik czasu')}
          className={`p-1 rounded text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/50 ${zero ? 'opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity' : ''}`}>
          {v.running ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
        </button>
      )}
    </div>
  );
}

// ── Metadane (item_id / created_log / last_updated) — tylko odczyt ────
// Data dd.mm.yyyy + imię i nazwisko z listy osób (zamiast surowego e-maila); pełny czas w dymku.
function fmtDateTime(iso) {
  try { return new Date(iso).toLocaleString(appLocale(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
}
function personName(email, people) {
  if (!email) return '';
  const p = (people || []).find(x => (x.email || '').toLowerCase() === String(email).toLowerCase());
  return p?.name && p.name !== p.email ? p.name : String(email).split('@')[0];
}
export function MetaCell({ column, item, people }) {
  if (column.type === 'item_id') {
    return <div className="w-full h-full flex items-center px-2 text-xs text-gray-500 dark:text-gray-400 tabular-nums truncate">{item?.id ? `#${String(item.id).slice(0, 8)}` : ''}</div>;
  }
  const at = column.type === 'created_log' ? item?.created_at : item?.updated_at;
  const who = column.type === 'created_log' ? item?.created_by : null;
  if (!at) return <div className="w-full h-full" />;
  const name = personName(who, people);
  const title = [fmtDateTime(at), who].filter(Boolean).join(' · ');
  return (
    <div className="w-full h-full flex items-center gap-1.5 px-2 text-xs min-w-0" title={title}>
      <span className="tabular-nums text-gray-500 dark:text-gray-400 shrink-0">{formatDate(at)}</span>
      {name && <span className="truncate text-gray-600 dark:text-gray-300">{name}</span>}
    </div>
  );
}
