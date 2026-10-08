import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, X } from 'lucide-react';
import { tr } from '../i18n';
import { useAnchoredPopover, useOutsideClose, stopOutside } from './pickers/useAnchoredPopover';

const pad = (n) => String(n).padStart(2, '0');
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));

// Pole godziny HH:MM: wpisywanie z klawiatury (auto-przeskok do minut) ALBO wybór z listy —
// kliknięcie pola otwiera panel z kolumnami godzin i minut (jak kółka w aplikacji mobilnej).
// Wartość i onChange operują na stringu "HH:MM" (jak natywne <input type=time>).
// Dostępność: `id` trafia na pole godzin (działa <label htmlFor>), `aria-label`/`aria-labelledby`
// nazywają całą grupę „godzina : minuty”.
export default function TimeInput({ value = '', onChange, className = '', placeholder = '--', disabled = false, minuteStep = 5, compact = false, id, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy, 'aria-describedby': ariaDescribedBy }) {
  const [hhRaw = '', mmRaw = ''] = String(value || '').split(':');
  const wrapRef = useRef(null);
  const mmRef = useRef(null);
  const hhRef = useRef(null);
  const hourListRef = useRef(null);
  const minuteListRef = useRef(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const refs = useMemo(() => [wrapRef], []);
  const pos = useAnchoredPopover(wrapRef, open, { height: 300, width: 220 });
  useOutsideClose(open, refs, close);

  const minutes = useMemo(() => {
    const list = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => pad(i * minuteStep));
    // Wpisana ręcznie minuta spoza kroku (np. 07) też ma być widoczna i zaznaczona.
    if (/^\d{2}$/.test(mmRaw) && !list.includes(mmRaw)) { list.push(mmRaw); list.sort(); }
    return list;
  }, [minuteStep, mmRaw]);

  // Po otwarciu przewiń kolumny do wybranej godziny/minuty (albo do 08:00, gdy pusto).
  const hasPos = pos !== null;
  useEffect(() => {
    if (!open || !hasPos) return;
    const scrollTo = (list, key) => {
      const el = list.current?.querySelector(`[data-v="${key}"]`);
      if (el) list.current.scrollTop = el.offsetTop - list.current.clientHeight / 2 + el.clientHeight / 2;
    };
    scrollTo(hourListRef, /^\d{2}$/.test(hhRaw) ? hhRaw : '08');
    scrollTo(minuteListRef, /^\d{2}$/.test(mmRaw) ? mmRaw : '00');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hasPos]);

  const emit = (h, m) => onChange(`${h}:${m}`);

  const onHour = (e) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 2);
    emit(v, mmRaw);
    // Auto-przeskok: dwie cyfry, albo pierwsza cyfra > 2 (np. „8" nie zacznie „8x").
    if (v.length === 2 || (v.length === 1 && parseInt(v, 10) > 2)) mmRef.current?.focus();
  };
  const onMinute = (e) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 2);
    emit(hhRaw, v);
  };
  // Backspace na pustych minutach → wróć do godziny.
  const onMinuteKey = (e) => { if (e.key === 'Backspace' && !mmRaw) hhRef.current?.focus(); };

  const normalize = () => {
    if (hhRaw === '' && mmRaw === '') return; // puste — zostaw
    const h = pad(Math.min(23, parseInt(hhRaw || '0', 10) || 0));
    const m = pad(Math.min(59, parseInt(mmRaw || '0', 10) || 0));
    emit(h, m);
  };

  // Wybór z listy: godzina zostawia panel otwarty (dobierz minuty), minuta zamyka.
  const pickHour = (h) => emit(h, /^\d{2}$/.test(mmRaw) ? mmRaw : '00');
  const pickMinute = (m) => { emit(/^\d{2}$/.test(hhRaw) ? hhRaw : '08', m); setOpen(false); };

  const seg = `${compact ? 'w-6 text-xs' : 'w-8'} bg-transparent text-center outline-none tabular-nums text-gray-800 dark:text-white`;
  const cell = (active) =>
    `w-full h-9 shrink-0 rounded-lg text-sm tabular-nums font-medium transition ${active
      ? 'bg-accent-primary text-white'
      : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'}`;

  return (
    <div
      ref={wrapRef}
      role="group"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      onMouseDown={(e) => {
        if (disabled) return;
        // Klik w cyfry: pisanie z klawiatury + lista obok; klik w resztę pola przełącza listę.
        if (e.target.tagName === 'INPUT') setOpen(true);
        else { e.preventDefault(); setOpen((o) => !o); }
      }}
      className={`ui-field inline-flex items-center gap-1 cursor-pointer ${disabled ? 'opacity-50 pointer-events-none' : ''} ${open ? 'ui-field--open' : ''} ${className}`}
    >
      <Clock size={compact ? 14 : 16} className="text-gray-400 mr-1 shrink-0" aria-hidden="true" />
      <input ref={hhRef} id={id} inputMode="numeric" value={hhRaw} onChange={onHour} onBlur={normalize} disabled={disabled}
        placeholder={placeholder} aria-label={tr('Godzina')} className={seg} />
      <span className="text-gray-400" aria-hidden="true">:</span>
      <input ref={mmRef} inputMode="numeric" value={mmRaw} onChange={onMinute} onKeyDown={onMinuteKey} onBlur={normalize} disabled={disabled}
        placeholder={placeholder} aria-label={tr('Minuty')} className={seg} />

      {open && pos && createPortal(
        <div
          {...stopOutside}
          className="portal-timepicker fixed z-[9999] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-2 animate-in fade-in zoom-in-95 duration-100"
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: 220 }}
        >
          <div className="grid grid-cols-2 gap-2 px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            <span className="text-center">{tr('Godz.')}</span>
            <span className="text-center">{tr('Min.')}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div ref={hourListRef} className="relative h-56 overflow-y-auto custom-scrollbar flex flex-col gap-0.5 pr-0.5">
              {HOURS.map((h) => (
                <button key={h} type="button" data-v={h} onClick={() => pickHour(h)} className={cell(h === hhRaw)}>{h}</button>
              ))}
            </div>
            <div ref={minuteListRef} className="relative h-56 overflow-y-auto custom-scrollbar flex flex-col gap-0.5 pr-0.5">
              {minutes.map((m) => (
                <button key={m} type="button" data-v={m} onClick={() => pickMinute(m)} className={cell(m === mmRaw)}>{m}</button>
              ))}
            </div>
          </div>
          {(hhRaw || mmRaw) && (
            <button type="button" onClick={() => { onChange(''); setOpen(false); }}
              className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
              <X size={13} /> {tr('Wyczyść')}
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
