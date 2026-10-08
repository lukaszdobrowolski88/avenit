import React, { useState, useEffect, useRef } from 'react';
import { Star, Paperclip, Plus, X, ExternalLink, Check } from 'lucide-react';
import Popover from '../Popover';
import { evalFormula } from '../../lib/formula';
import { formatDate, formatDateRange, formatNumber, filesCountText } from '../../lib/columnTypes';
import CustomDatePicker from '../../../../components/CustomDatePicker';
import { STATUS_COLORS } from '../../../../components/ui/DataTable';
import { toast } from '../../../../lib/toast';
import { tr, appLocale } from '../../../../i18n';
import '../../../../components/pickList.css';

// ── Wspólne klocki komórek ───────────────────────────────────────────
// Pole edytowalne w komórce: przezroczyste, pierścień fokusu taki jak w kalendarzu komórki.
export const CELL_INPUT = 'w-full h-full bg-transparent px-2 text-sm text-gray-700 dark:text-gray-200 outline-none rounded focus-visible:ring-2 focus-visible:ring-accent-primary-light/50';
// Wyzwalacz popovera w komórce = prawdziwy przycisk (Tab + Enter), nie goły div.
export const CELL_TRIGGER = 'w-full h-full flex items-center px-2 gap-1.5 min-w-0 text-left outline-none rounded focus-visible:ring-2 focus-visible:ring-accent-primary-light/50';
// Pole tekstowe wewnątrz popovera (link, pliki).
const POP_INPUT = 'w-full text-sm bg-gray-100 dark:bg-white/5 rounded-lg px-2.5 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/50 text-gray-800 dark:text-gray-100 placeholder:text-gray-400';

// Pusta komórka = pusto; tylko blady „+” po najechaniu na wiersz (nie „—” w każdym wierszu).
export function HoverPlus({ label }) {
  return (
    <span className="text-gray-300 dark:text-gray-600 text-base leading-none opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 transition-opacity">
      <span aria-hidden="true">+</span>{label && <span className="sr-only">{label}</span>}
    </span>
  );
}

// Edytor w popoverze zapisuje przy blur/Enter ORAZ przy zamknięciu popovera — Esc i klik poza
// odmontowują edytor, a wtedy wpisany tekst ginął.
function useSaveOnUnmount(save) {
  const ref = useRef(save);
  ref.current = save;
  useEffect(() => () => ref.current(), []);
}

// Adres tylko http(s): bez schematu dopisujemy https://, inne schematy (javascript:, data:…) odrzucamy.
// Zwraca '' dla pustego, null dla nieprawidłowego.
export function normalizeUrl(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[^:/]+:\d/.test(s); // „host:8080” to nie schemat
  const candidate = hasScheme ? s : `https://${s.replace(/^\/+/, '')}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname) return null;
    return candidate;
  } catch { return null; }
}
// Bezpieczny href dla zapisanych wartości (stare dane mogły mieć dowolny schemat).
const safeHref = (url) => normalizeUrl(url) || null;

// ── Tekst (inline) ───────────────────────────────────────────────────
export function TextCell({ column, value, onChange, readOnly, align = 'left' }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => { setV(value ?? ''); }, [value]);
  if (readOnly) return <div className={`px-2 text-sm text-gray-700 dark:text-gray-200 truncate w-full text-${align}`}>{value}</div>;
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v !== (value ?? '')) onChange(v); }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      aria-label={column?.name || tr('Tekst')}
      className={`${CELL_INPUT} text-${align}`}
    />
  );
}

// ── Liczba ───────────────────────────────────────────────────────────
// Separator dziesiętny bieżącego języka („,” po polsku) — do wartości w trakcie edycji.
const decimalSep = () => { try { return (1.5).toLocaleString(appLocale()).charAt(1) || '.'; } catch { return '.'; } };
// „1,5” / „1.5” / „1 234,5” / „1,234.5” → liczba; '' → null; śmieci → NaN.
function parseNumberInput(raw) {
  let s = String(raw ?? '').replace(/[\s  ']/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // Oba znaki: ostatni jest dziesiętnym, drugi to separator tysięcy.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else {
    s = s.replace(',', '.');
  }
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  return Number(s);
}

// Pole tekstowe z inputMode="decimal" zamiast type="number": kółko myszy nie zmienia wartości,
// a polski przecinek („1,5”) nie ginie. Zapis tylko na blur/Enter.
export function NumberCell({ column, value, onChange, readOnly }) {
  const unit = column?.settings?.unit;
  const shown = formatNumber(value, column?.settings?.decimals);
  const [draft, setDraft] = useState(null); // null = nie edytujemy (pokazujemy sformatowaną)
  const cancelled = useRef(false);
  if (readOnly) {
    return <div className="px-2 text-sm text-gray-700 dark:text-gray-200 text-right w-full tabular-nums truncate">{shown}{shown && unit ? ` ${unit}` : ''}</div>;
  }
  const commit = () => {
    const raw = draft;
    setDraft(null);
    if (cancelled.current) { cancelled.current = false; return; }
    if (raw === null) return;
    const n = parseNumberInput(raw);
    if (Number.isNaN(n)) { toast.error(tr('„{value}” nie jest liczbą', { value: raw.trim() })); return; }
    if (n !== (value ?? null)) onChange(n);
  };
  return (
    <div className="w-full h-full flex items-center">
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={draft ?? shown}
        onFocus={() => setDraft(value == null || value === '' ? '' : String(value).replace('.', decimalSep()))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') { cancelled.current = true; e.currentTarget.blur(); }
        }}
        aria-label={column?.name || tr('Liczba')}
        className={`${CELL_INPUT} text-right tabular-nums`}
      />
      {unit && shown && draft === null && <span className="text-xs text-gray-400 pr-2 shrink-0">{unit}</span>}
    </div>
  );
}

// ── Data ─────────────────────────────────────────────────────────────
// Spokojnie jak w Notion: data to zwykły tekst, pusto = „+” na hover wiersza. Kliknięcie otwiera
// ten sam kalendarz co w formularzach aplikacji (wcześniej w komórce pojawiało się całe pole).
export function DateCell({ column, value, onChange, readOnly }) {
  if (readOnly) {
    return <div className="px-2 text-sm text-gray-600 dark:text-gray-300 w-full text-center tabular-nums">{value ? formatDate(String(value).slice(0, 10)) : ''}</div>;
  }
  return (
    <CustomDatePicker variant="cell" value={value ? String(value).slice(0, 10) : ''}
      onChange={(v) => onChange(v || null)} aria-label={column?.name || tr('Data')} />
  );
}

// ── Oś czasu (start → koniec) ────────────────────────────────────────
// Zakres jako tekst „12.10 – 18.10.2026” w miękkiej, neutralnej pigułce (nie nasycony pasek
// z białym tekstem). Edycja: dwa kalendarze aplikacji, koniec nie wcześniej niż początek.
export function TimelineCell({ column, value, onChange, readOnly }) {
  const v = value || {};
  const text = formatDateRange(v.start, v.end);
  const pill = text
    ? <span className="inline-flex max-w-full items-center px-2 py-0.5 rounded-full bg-gray-100 dark:bg-white/10 text-xs font-medium text-gray-700 dark:text-gray-200 tabular-nums whitespace-nowrap overflow-hidden">{text}</span>
    : null;
  if (readOnly) return <div className="w-full h-full flex items-center justify-center px-2">{pill}</div>;

  const set = (patch) => {
    const next = { ...v, ...patch };
    // Początek przesunięty za koniec → koniec idzie za nim (zakres zawsze poprawny).
    if (next.start && next.end && next.end < next.start) next.end = next.start;
    onChange(next.start || next.end ? { start: next.start || null, end: next.end || null } : null);
  };
  const name = column?.name || tr('Oś czasu');
  return (
    <Popover width={260} bare className="pick-pop" trigger={
      <button type="button" aria-label={text ? `${name}: ${text}` : name} className={`${CELL_TRIGGER} justify-center`}>
        {pill || <HoverPlus />}
      </button>
    }>
      {({ close }) => (
        <div className="p-3 space-y-3">
          <CustomDatePicker compact label={tr('Początek')} value={v.start || ''} onChange={(d) => set({ start: d || null })} />
          <CustomDatePicker compact label={tr('Koniec')} value={v.end || ''} min={v.start || undefined} onChange={(d) => set({ end: d || null })} />
          {(v.start || v.end) && (
            <button type="button" onClick={() => { onChange(null); close(); }}
              className="text-xs text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 rounded px-1 outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/50">
              {tr('Wyczyść')}
            </button>
          )}
        </div>
      )}
    </Popover>
  );
}

// ── Pole wyboru ──────────────────────────────────────────────────────
export function CheckboxCell({ column, value, onChange, readOnly }) {
  const label = column?.name || tr('Pole wyboru');
  if (readOnly) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        {value ? <Check size={16} className="text-gray-700 dark:text-gray-200" role="img" aria-label={`${label}: ${tr('Zaznaczone')}`} /> : null}
      </div>
    );
  }
  return (
    <div className="w-full h-full flex items-center justify-center">
      <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} aria-label={label}
        className="w-4 h-4 rounded accent-accent-primary cursor-pointer" />
    </div>
  );
}

// ── Link ─────────────────────────────────────────────────────────────
const LINK_TEXT = 'truncate text-sm text-gray-800 dark:text-gray-100 underline decoration-gray-300 dark:decoration-gray-600 underline-offset-2 hover:decoration-current';

// Edycja w stanie lokalnym, zapis na blur/Enter/zamknięcie (wcześniej każdy znak = zapis do bazy).
function LinkEditor({ value, onChange, close }) {
  const [url, setUrl] = useState(value?.url || '');
  const [text, setText] = useState(value?.text || '');
  const [invalid, setInvalid] = useState(false);
  const saved = useRef(JSON.stringify(value?.url ? { url: value.url, text: value.text || '' } : null));

  // Zwraca false, gdy adres jest nieprawidłowy (nic nie zapisujemy).
  const save = ({ silent = false } = {}) => {
    const norm = normalizeUrl(url);
    if (norm === null) {
      setInvalid(true);
      if (silent) toast.error(tr('Nie zapisano linku — dozwolone są tylko adresy http(s)'));
      return false;
    }
    setInvalid(false);
    if (norm !== url) setUrl(norm);
    const next = norm ? { url: norm, text: text.trim() } : null;
    const key = JSON.stringify(next);
    if (key !== saved.current) { saved.current = key; onChange(next); }
    return true;
  };
  useSaveOnUnmount(() => save({ silent: true }));
  const onKeyDown = (e) => { if (e.key === 'Enter') { e.preventDefault(); if (save()) close(); } };
  const href = safeHref(url);

  return (
    <div className="p-3 space-y-2">
      <input autoFocus value={url} onChange={(e) => { setUrl(e.target.value); setInvalid(false); }} onBlur={() => save()} onKeyDown={onKeyDown}
        placeholder="https://" inputMode="url" aria-label={tr('Adres (URL)')} aria-invalid={invalid || undefined}
        className={`${POP_INPUT} ${invalid ? 'ring-2 ring-red-500/60' : ''}`} />
      {invalid && <p className="text-xs text-red-600 dark:text-red-400" role="alert">{tr('Dozwolone są tylko adresy http(s)')}</p>}
      <input value={text} onChange={(e) => setText(e.target.value)} onBlur={() => save()} onKeyDown={onKeyDown}
        placeholder={tr('Tekst (opcjonalnie)')} aria-label={tr('Tekst (opcjonalnie)')} className={POP_INPUT} />
      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white rounded outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/50">
          <ExternalLink size={12} aria-hidden="true" /> {tr('Otwórz')}
        </a>
      )}
    </div>
  );
}

export function LinkCell({ column, value, onChange, readOnly }) {
  const v = value || {};
  const href = v.url ? safeHref(v.url) : null;
  const label = v.text || v.url || '';
  const linkEl = href
    ? <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className={`${LINK_TEXT} min-w-0 rounded outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/50`}>{label}</a>
    : label ? <span className="truncate text-sm text-gray-500 min-w-0">{label}</span> : null;
  if (readOnly) return <div className="w-full h-full flex items-center px-2 min-w-0">{linkEl}</div>;
  const name = column?.name || tr('Link');
  return (
    <Popover width={280} bare className="pick-pop" trigger={
      // Klik w sam link otwiera adres; reszta komórki (przycisk) otwiera edycję.
      <div className="w-full h-full flex items-center pl-2 min-w-0">
        {linkEl}
        <button type="button" aria-label={label ? tr('Edytuj link') : name}
          className={`h-full flex-1 min-w-[1.5rem] flex items-center pr-2 ${label ? 'pl-2' : ''} outline-none rounded focus-visible:ring-2 focus-visible:ring-accent-primary-light/50`}>
          {!label && <HoverPlus />}
        </button>
      </div>
    }>
      {({ close }) => <LinkEditor value={value} onChange={onChange} close={close} />}
    </Popover>
  );
}

// ── Ocena (gwiazdki) ─────────────────────────────────────────────────
// Puste gwiazdki dopiero po najechaniu na wiersz (pusto = pusto); na ekranach dotykowych zawsze.
export function RatingCell({ column, value, onChange, readOnly }) {
  const max = Math.max(1, Math.min(10, Number(column?.settings?.max) || 5));
  const cur = Math.max(0, Math.min(max, Math.floor(Number(value) || 0)));
  if (readOnly) {
    return (
      <div className="w-full h-full flex items-center justify-center gap-0.5">
        {cur > 0 && (
          <span className="flex items-center gap-0.5" role="img" aria-label={tr('Ocena {n} z {max}', { n: cur, max })}>
            {Array.from({ length: cur }).map((_, i) => <Star key={i} size={15} className="text-amber-400 fill-amber-400" aria-hidden="true" />)}
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="w-full h-full flex items-center justify-center gap-0.5" role="group" aria-label={column?.name || tr('Ocena')}>
      {Array.from({ length: max }).map((_, i) => {
        const filled = i < cur;
        return (
          <button key={i} type="button" onClick={() => onChange(i + 1 === cur ? 0 : i + 1)}
            aria-label={tr('Ocena {n} z {max}', { n: i + 1, max })} aria-pressed={i + 1 === cur}
            className={`p-0.5 rounded outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/50 transition-opacity ${filled ? '' : 'opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100'}`}>
            <Star size={15} aria-hidden="true" className={filled ? 'text-amber-400 fill-amber-400' : 'text-gray-300 dark:text-gray-600'} />
          </button>
        );
      })}
    </div>
  );
}

// ── Pliki (metadane; upload w kolejnej fazie) ────────────────────────
function FilesEditor({ files, onChange }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [invalid, setInvalid] = useState(false);
  const add = () => {
    const norm = normalizeUrl(url);
    if (!norm) { setInvalid(true); return; }
    onChange([...files, { name: name.trim() || norm, url: norm }]);
    setName(''); setUrl(''); setInvalid(false);
  };
  return (
    <div className="flex flex-col">
      {files.length > 0 && (
        <ul className="py-1 max-h-56 overflow-y-auto custom-scrollbar">
          {files.map((f, i) => {
            const href = safeHref(f.url);
            return (
              <li key={i} className="flex items-center gap-2 px-3 min-h-[34px]">
                <Paperclip size={13} className="shrink-0 text-gray-400" aria-hidden="true" />
                {href
                  ? <a href={href} target="_blank" rel="noopener noreferrer" className={`${LINK_TEXT} flex-1 min-w-0`}>{f.name || f.url}</a>
                  : <span className="flex-1 min-w-0 truncate text-sm text-gray-500">{f.name || f.url}</span>}
                <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))}
                  aria-label={tr('Usuń plik {name}', { name: f.name || f.url })}
                  className="shrink-0 p-1 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/50">
                  <X size={13} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className={`p-3 space-y-1.5 ${files.length ? 'border-t border-gray-100 dark:border-white/10' : ''}`}>
        <input autoFocus value={url} onChange={(e) => { setUrl(e.target.value); setInvalid(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="https://" inputMode="url" aria-label={tr('Adres pliku (URL)')} aria-invalid={invalid || undefined}
          className={`${POP_INPUT} ${invalid ? 'ring-2 ring-red-500/60' : ''}`} />
        <input value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={tr('Nazwa (opcjonalnie)')} aria-label={tr('Nazwa (opcjonalnie)')} className={POP_INPUT} />
        {invalid && <p className="text-xs text-red-600 dark:text-red-400" role="alert">{tr('Dozwolone są tylko adresy http(s)')}</p>}
        <button type="button" onClick={add} disabled={!url.trim()}
          className="inline-flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed rounded px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/50">
          <Plus size={13} aria-hidden="true" /> {tr('Dodaj plik')}
        </button>
      </div>
    </div>
  );
}

export function FilesCell({ column, value = [], onChange, readOnly }) {
  const files = Array.isArray(value) ? value : [];
  const count = files.length ? (
    <span className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300 tabular-nums">
      <Paperclip size={13} aria-hidden="true" /> {files.length}
    </span>
  ) : null;
  if (readOnly) {
    return <div className="w-full h-full flex items-center justify-center" title={files.length ? filesCountText(files.length) : undefined}>{count}</div>;
  }
  const name = column?.name || tr('Pliki');
  return (
    <Popover width={280} bare className="pick-pop overflow-hidden" trigger={
      <button type="button" aria-label={files.length ? `${name}: ${filesCountText(files.length)}` : name} className={`${CELL_TRIGGER} justify-center`}>
        {count || (
          <Paperclip size={13} aria-hidden="true" className="text-gray-300 dark:text-gray-600 opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 transition-opacity" />
        )}
      </button>
    }>
      {() => <FilesEditor files={files} onChange={onChange} />}
    </Popover>
  );
}

// ── Postęp (0-100%) ──────────────────────────────────────────────────
// Kolory aplikacji (nie Monday). Suwak zmienia stan lokalny; zapis dopiero po puszczeniu
// (pointerup/keyup) — wcześniej każdy krok suwaka był zapisem do bazy.
const progressColor = (v) => (v >= 100 ? STATUS_COLORS.success : v >= 50 ? STATUS_COLORS.warning : STATUS_COLORS.info);

function ProgressBar({ v }) {
  return (
    <>
      <span className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
        <span className="block h-full rounded-full" style={{ width: `${v}%`, backgroundColor: progressColor(v) }} />
      </span>
      <span className="text-[11px] text-gray-500 dark:text-gray-400 w-8 text-right tabular-nums">{v}%</span>
    </>
  );
}

function ProgressEditor({ value, onChange, label }) {
  const [v, setV] = useState(value);
  const cur = useRef(value);
  const saved = useRef(value);
  const save = () => { if (cur.current !== saved.current) { saved.current = cur.current; onChange(cur.current); } };
  useSaveOnUnmount(save);
  return (
    <div className="p-3">
      <input type="range" min={0} max={100} step={5} value={v} autoFocus
        onChange={(e) => { const n = Number(e.target.value); cur.current = n; setV(n); }}
        onPointerUp={save} onKeyUp={save}
        aria-label={label} aria-valuetext={`${v}%`}
        className="w-full accent-accent-primary" />
      <div className="text-center text-sm text-gray-600 dark:text-gray-300 mt-1 tabular-nums">{v}%</div>
    </div>
  );
}

export function ProgressCell({ column, value, onChange, readOnly }) {
  const v = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  const label = column?.name || tr('Postęp');
  // 0% = pusto (domyślna wartość każdego wiersza) — pasek dopiero od pierwszego postępu.
  if (readOnly) {
    return (
      <div className="w-full h-full flex items-center gap-1.5 px-2" role={v > 0 ? 'img' : undefined} aria-label={v > 0 ? `${label}: ${v}%` : undefined}>
        {v > 0 && <ProgressBar v={v} />}
      </div>
    );
  }
  return (
    <Popover width={220} bare className="pick-pop" trigger={
      <button type="button" aria-label={`${label}: ${v}%`} className={`${CELL_TRIGGER} ${v > 0 ? '' : 'justify-center'}`}>
        {v > 0 ? <ProgressBar v={v} /> : <HoverPlus />}
      </button>
    }>
      {() => <ProgressEditor value={v} onChange={onChange} label={label} />}
    </Popover>
  );
}

// ── Formuła (wyliczana, tylko do odczytu) ────────────────────────────
export function FormulaCell({ column, item, columns }) {
  const result = evalFormula(column?.settings?.expression, item || { cells: {} }, columns || []);
  const text = result == null ? '' : typeof result === 'number' ? formatNumber(result, column?.settings?.decimals) : String(result);
  return (
    <div className="w-full h-full flex items-center justify-end px-2 text-sm font-medium text-gray-700 dark:text-gray-200 tabular-nums truncate">
      {text}
    </div>
  );
}

// ── Długi tekst ──────────────────────────────────────────────────────
function LongTextEditor({ value, onChange, label, close }) {
  const [v, setV] = useState(value ?? '');
  const cur = useRef(value ?? '');
  const saved = useRef(value ?? '');
  const save = () => { if (cur.current !== saved.current) { saved.current = cur.current; onChange(cur.current); } };
  // Esc / klik poza zamyka popover — zapisujemy przy odmontowaniu, tekst nie ginie.
  useSaveOnUnmount(save);
  return (
    <div className="p-2">
      <textarea autoFocus rows={6} value={v} aria-label={label}
        onChange={(e) => { cur.current = e.target.value; setV(e.target.value); }}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); close(); } }}
        className="w-full text-sm bg-gray-50 dark:bg-white/5 rounded-lg p-2 outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/50 resize-y text-gray-700 dark:text-gray-200" />
    </div>
  );
}

export function LongTextCell({ column, value, onChange, readOnly }) {
  const preview = (value || '').split('\n')[0];
  if (readOnly) return <div className="px-2 text-sm text-gray-600 dark:text-gray-300 truncate w-full" title={value || undefined}>{preview}</div>;
  const label = column?.name || tr('Długi tekst');
  return (
    <Popover width={320} bare className="pick-pop" trigger={
      <button type="button" aria-label={label} className={CELL_TRIGGER}>
        {preview ? <span className="truncate text-sm text-gray-600 dark:text-gray-300">{preview}</span> : <HoverPlus />}
      </button>
    }>
      {({ close }) => <LongTextEditor value={value} onChange={onChange} label={label} close={close} />}
    </Popover>
  );
}
