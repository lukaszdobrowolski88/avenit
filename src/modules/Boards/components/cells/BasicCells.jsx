import React, { useState, useEffect, useRef } from 'react';
import { Star, Paperclip, Plus, X, ExternalLink, Check, Upload } from 'lucide-react';
import Popover from '../Popover';
import { evalFormula } from '../../lib/formula';
import { formatDate, formatDateRange, formatNumber, filesCountText, isOverdue, isImageFile } from '../../lib/columnTypes';
import CustomDatePicker from '../../../../components/CustomDatePicker';
import Spinner from '../../../../components/Spinner';
import { STATUS_COLORS } from '../../../../components/ui/DataTable';
import { supabase } from '../../../../lib/supabase';
import { thumbUrl } from '../../../../lib/imageThumb';
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
// Zmiana z zewnątrz (realtime, odświeżenie) nie nadpisuje pola, w którym ktoś właśnie pisze;
// pole bez własnych zmian przyjmuje nową wartość (i nie odsyła starej przy wyjściu).
export function TextCell({ column, value, onChange, readOnly, align = 'left' }) {
  const [v, setV] = useState(value ?? '');
  const ref = useRef(null);
  const dirty = useRef(false);
  useEffect(() => {
    if (dirty.current && document.activeElement === ref.current) return;
    dirty.current = false;
    setV(value ?? '');
  }, [value]);
  if (readOnly) return <div className={`px-2 text-sm text-gray-700 dark:text-gray-200 truncate w-full text-${align}`}>{value}</div>;
  return (
    <input
      ref={ref}
      value={v}
      onChange={(e) => { dirty.current = true; setV(e.target.value); }}
      onBlur={() => { if (dirty.current && v !== (value ?? '')) onChange(v); dirty.current = false; }}
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
      {unit && shown && draft === null && <span className="text-xs text-gray-500 dark:text-gray-400 pr-2 shrink-0">{unit}</span>}
    </div>
  );
}

// ── Data ─────────────────────────────────────────────────────────────
// Spokojnie jak w Notion: data to zwykły tekst, pusto = „+” na hover wiersza. Kliknięcie otwiera
// ten sam kalendarz co w formularzach aplikacji (wcześniej w komórce pojawiało się całe pole).
// Po terminie (przed dziś, zadanie niezakończone) — data na czerwono, także w tabeli na komputerze.
const OVERDUE_TEXT = 'text-red-600 dark:text-red-400 font-semibold';
const OVERDUE_WRAP = '[&_.tabular-nums]:!text-red-600 dark:[&_.tabular-nums]:!text-red-400 [&_.tabular-nums]:font-semibold';
export function DateCell({ column, value, onChange, readOnly, item, columns }) {
  const overdue = !!item && isOverdue(value, item, columns || []);
  const hint = overdue ? <span className="sr-only">{tr('Po terminie')}</span> : null;
  if (readOnly) {
    return (
      <div className={`px-2 text-sm w-full text-center tabular-nums ${overdue ? OVERDUE_TEXT : 'text-gray-600 dark:text-gray-300'}`} title={overdue ? tr('Po terminie') : undefined}>
        {value ? formatDate(String(value).slice(0, 10)) : ''}{hint}
      </div>
    );
  }
  return (
    <div className={`w-full h-full ${overdue ? OVERDUE_WRAP : ''}`} title={overdue ? tr('Po terminie') : undefined}>
      <CustomDatePicker variant="cell" value={value ? String(value).slice(0, 10) : ''}
        onChange={(v) => onChange(v || null)} aria-label={column?.name || tr('Data')} />
      {hint}
    </div>
  );
}

// ── Oś czasu (start → koniec) ────────────────────────────────────────
// Zakres jako tekst „12.10 – 18.10.2026” w miękkiej, neutralnej pigułce (nie nasycony pasek
// z białym tekstem). Edycja: dwa kalendarze aplikacji, koniec nie wcześniej niż początek.
export function TimelineCell({ column, value, onChange, readOnly, item, columns }) {
  const v = value || {};
  const text = formatDateRange(v.start, v.end);
  const overdue = !!item && isOverdue(v, item, columns || []);
  const pill = text
    ? (
      <span title={overdue ? tr('Po terminie') : undefined}
        className={`inline-flex max-w-full items-center px-2 py-0.5 rounded-full text-xs font-medium tabular-nums whitespace-nowrap overflow-hidden ${overdue
          ? 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300'
          : 'bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-200'}`}>
        {text}{overdue && <span className="sr-only"> · {tr('Po terminie')}</span>}
      </span>
    )
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

// ── Pliki ────────────────────────────────────────────────────────────
// Wgrywanie do magazynu (bucket public-assets, board_files/<tablica>/…) albo link http(s).
// Zdjęcia z naszego magazynu pokazujemy jako miniatury (thumbUrl — serwer zmniejsza raz i trzyma).
// Usunięcie z listy nie kasuje pliku z magazynu (kopia zadania może wskazywać ten sam plik).
export async function uploadBoardFiles(boardId, fileList) {
  const out = [];
  for (const file of Array.from(fileList || [])) {
    const safe = (file.name || 'plik').replace(/[^\w.\-]+/g, '_').slice(-120);
    const path = `board_files/${boardId || 'inne'}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safe}`;
    const { error } = await supabase.storage.from('public-assets').upload(path, file);
    if (error) throw error;
    const { data } = supabase.storage.from('public-assets').getPublicUrl(path);
    out.push({ name: file.name || safe, url: data?.publicUrl, path, type: file.type || '', size: file.size || 0 });
  }
  return out;
}

function FileThumb({ file, size = 28 }) {
  const href = safeHref(file.url);
  if (href && isImageFile(file)) {
    return <img src={thumbUrl(href, size)} alt="" loading="lazy" decoding="async" width={size} height={size}
      className="shrink-0 rounded-md object-cover bg-gray-100 dark:bg-white/10" style={{ width: size, height: size }} />;
  }
  return (
    <span className="shrink-0 grid place-items-center rounded-md bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400" style={{ width: size, height: size }} aria-hidden="true">
      <Paperclip size={Math.round(size / 2)} />
    </span>
  );
}

function FilesEditor({ files, onChange, boardId }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const latest = useRef(files);
  latest.current = files;
  const add = () => {
    const norm = normalizeUrl(url);
    if (!norm) { setInvalid(true); return; }
    onChange([...files, { name: name.trim() || norm, url: norm }]);
    setName(''); setUrl(''); setInvalid(false);
  };
  const upload = async (list) => {
    if (!list?.length) return;
    setUploading(true);
    try {
      const added = await uploadBoardFiles(boardId, list);
      if (added.length) onChange([...(latest.current || []), ...added]);
    } catch (e) {
      toast.error(e, { fallback: tr('Nie udało się wgrać pliku.') });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  return (
    <div className="flex flex-col">
      {files.length > 0 && (
        <ul className="py-1 max-h-56 overflow-y-auto custom-scrollbar">
          {files.map((f, i) => {
            const href = safeHref(f.url);
            return (
              <li key={`${f.url || f.name}:${i}`} className="flex items-center gap-2 px-3 min-h-[38px]">
                <FileThumb file={f} />
                {href
                  ? <a href={href} target="_blank" rel="noopener noreferrer" className={`${LINK_TEXT} flex-1 min-w-0`}>{f.name || f.url}</a>
                  : <span className="flex-1 min-w-0 truncate text-sm text-gray-500">{f.name || f.url}</span>}
                <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))}
                  aria-label={tr('Usuń plik {name}', { name: f.name || f.url })}
                  className="shrink-0 p-1 rounded-full text-gray-500 hover:text-red-600 hover:bg-red-50 dark:text-gray-400 dark:hover:bg-red-500/10 outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/50">
                  <X size={13} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className={`p-3 space-y-2 ${files.length ? 'border-t border-gray-100 dark:border-white/10' : ''}`}>
        <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} autoFocus
          className="w-full inline-flex items-center justify-center gap-1.5 h-8 rounded-lg text-sm font-medium bg-[rgba(42,35,18,0.06)] dark:bg-white/10 text-gray-800 dark:text-gray-100 hover:bg-[rgba(42,35,18,0.1)] dark:hover:bg-white/15 disabled:opacity-60 outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/50">
          {uploading ? <Spinner size={14} /> : <Upload size={14} aria-hidden="true" />}
          {uploading ? tr('Wgrywanie…') : tr('Wgraj plik')}
        </button>
        <div className="pick-section !px-0 !pt-1">{tr('albo dodaj link')}</div>
        <input value={url} onChange={(e) => { setUrl(e.target.value); setInvalid(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="https://" inputMode="url" aria-label={tr('Adres pliku (URL)')} aria-invalid={invalid || undefined}
          className={`${POP_INPUT} ${invalid ? 'ring-2 ring-red-500/60' : ''}`} />
        <input value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={tr('Nazwa (opcjonalnie)')} aria-label={tr('Nazwa (opcjonalnie)')} className={POP_INPUT} />
        {invalid && <p className="text-xs text-red-600 dark:text-red-400" role="alert">{tr('Dozwolone są tylko adresy http(s)')}</p>}
        <button type="button" onClick={add} disabled={!url.trim()}
          className="inline-flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed rounded px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/50">
          <Plus size={13} aria-hidden="true" /> {tr('Dodaj link')}
        </button>
      </div>
    </div>
  );
}

// W komórce: miniatury zdjęć (do trzech) albo spinacz z liczbą plików.
function FilesSummary({ files }) {
  if (!files.length) return null;
  const images = files.filter((f) => isImageFile(f) && safeHref(f.url));
  if (images.length) {
    const shown = images.slice(0, 3);
    const rest = files.length - shown.length;
    return (
      <span className="flex items-center gap-1 min-w-0">
        <span className="flex -space-x-1.5">
          {shown.map((f, i) => (
            <img key={`${f.url}:${i}`} src={thumbUrl(safeHref(f.url), 24)} alt="" loading="lazy" decoding="async" width={24} height={24}
              className="w-6 h-6 rounded-md object-cover ring-2 ring-white dark:ring-gray-800 bg-gray-100 dark:bg-white/10" />
          ))}
        </span>
        {rest > 0 && <span className="text-xs text-gray-600 dark:text-gray-300 tabular-nums">+{rest}</span>}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300 tabular-nums">
      <Paperclip size={13} aria-hidden="true" /> {files.length}
    </span>
  );
}

export function FilesCell({ column, value = [], onChange, readOnly, item }) {
  const files = Array.isArray(value) ? value : [];
  const count = files.length ? <FilesSummary files={files} /> : null;
  if (readOnly) {
    return <div className="w-full h-full flex items-center justify-center" title={files.length ? filesCountText(files.length) : undefined}>{count}</div>;
  }
  const name = column?.name || tr('Pliki');
  return (
    <Popover width={300} bare className="pick-pop overflow-hidden" trigger={
      <button type="button" aria-label={files.length ? `${name}: ${filesCountText(files.length)}` : name} className={`${CELL_TRIGGER} justify-center`}>
        {count || (
          <Paperclip size={13} aria-hidden="true" className="text-gray-300 dark:text-gray-600 opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 transition-opacity" />
        )}
      </button>
    }>
      {() => <FilesEditor files={files} onChange={onChange} boardId={item?.board_id} />}
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
