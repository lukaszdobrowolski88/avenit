import React from 'react';
import { Star } from 'lucide-react';
import CustomDatePicker from '../../../components/CustomDatePicker';
import { boardColor } from '../lib/palette';
import { tr } from '../../../i18n';

// Pole formularza tablicy (podgląd w widoku Formularz + publiczny formularz /formularz/:token).
// Zwykłe kontrolki aplikacji zamiast komórek tabeli — komórki chowają edytor do najechania
// (w formularzu wyglądały jak puste prostokąty). Wartości w tym samym formacie co komórki,
// więc zapis (addItem / board-form-submit) się nie zmienia.

export const FORM_LABEL = 'block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5';
export const FORM_INPUT = 'w-full px-4 py-3 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400';

const CHIP = 'inline-flex items-center gap-2 h-9 px-3.5 rounded-full text-sm font-medium transition-colors outline-none disabled:opacity-50 disabled:cursor-not-allowed';
const CHIP_OFF = 'bg-[rgba(42,35,18,0.055)] hover:bg-[rgba(42,35,18,0.09)] text-gray-700 dark:bg-white/[0.07] dark:hover:bg-white/[0.12] dark:text-gray-200';
const CHIP_ON = 'bg-[#2A2312] text-white dark:bg-[#FFBE0B] dark:text-[#2A2312]';

// Wybór z etykiet (status, priorytet, lista) jako pigułki — kilka opcji widać od razu, jeden klik.
function Chips({ options, selected, onToggle, multi, disabled, labelledBy }) {
  if (!options.length) return <p className="text-sm text-gray-400">{tr('Brak opcji')}</p>;
  return (
    <div role={multi ? 'group' : 'radiogroup'} aria-labelledby={labelledBy} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o.id);
        return (
          <button key={o.id} type="button" disabled={disabled} onClick={() => onToggle(o.id)}
            {...(multi ? { 'aria-pressed': on } : { role: 'radio', 'aria-checked': on })}
            className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}>
            {o.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: boardColor(o.color) }} aria-hidden="true" />}
            {o.title || tr('Bez etykiety')}
          </button>
        );
      })}
    </div>
  );
}

export default function FormField({ column, value, onChange, disabled = false, id }) {
  const labelId = `${id}-label`;
  const s = column.settings || {};
  switch (column.type) {
    case 'text':
      return <input id={id} value={value || ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} maxLength={2000} className={FORM_INPUT} />;
    case 'long_text':
      return <textarea id={id} value={value || ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} rows={4} maxLength={10000} className={`${FORM_INPUT} resize-y`} />;
    case 'number':
      return (
        <input id={id} type="number" inputMode="decimal" value={value ?? ''} disabled={disabled}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} className={FORM_INPUT} />
      );
    case 'link':
      return (
        <input id={id} type="url" inputMode="url" value={value?.url || ''} placeholder="https://" disabled={disabled}
          onChange={(e) => onChange(e.target.value ? { url: e.target.value, text: value?.text || '' } : null)} className={FORM_INPUT} />
      );
    case 'date':
      return <CustomDatePicker id={id} value={value || ''} onChange={(v) => onChange(v || null)} disabled={disabled} />;
    case 'timeline': {
      const v = value || {};
      const set = (patch) => {
        const next = { ...v, ...patch };
        if (next.start && next.end && next.end < next.start) next.end = next.start;
        onChange(next.start || next.end ? { start: next.start || null, end: next.end || null } : null);
      };
      return (
        <div className="grid grid-cols-2 gap-3">
          <CustomDatePicker id={id} value={v.start || ''} onChange={(d) => set({ start: d || null })} placeholder={tr('Od')} aria-label={tr('{name}: od', { name: column.name })} disabled={disabled} />
          <CustomDatePicker value={v.end || ''} min={v.start || undefined} onChange={(d) => set({ end: d || null })} placeholder={tr('Do')} aria-label={tr('{name}: do', { name: column.name })} disabled={disabled} />
        </div>
      );
    }
    case 'status':
    case 'priority':
      return (
        <Chips options={s.labels || []} selected={value ? [value] : []} disabled={disabled} labelledBy={labelId}
          onToggle={(lid) => onChange(value === lid ? null : lid)} />
      );
    case 'dropdown': {
      const multi = s.multi !== false;
      const ids = Array.isArray(value) ? value : value ? [value] : [];
      return (
        <Chips options={s.options || []} selected={ids} multi={multi} disabled={disabled} labelledBy={labelId}
          onToggle={(oid) => onChange(ids.includes(oid) ? ids.filter((x) => x !== oid) : (multi ? [...ids, oid] : [oid]))} />
      );
    }
    case 'checkbox':
      return (
        <label className="inline-flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-200 cursor-pointer select-none">
          <input id={id} type="checkbox" checked={!!value} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
          {tr('Tak')}
        </label>
      );
    case 'rating': {
      const max = Math.max(1, Math.min(10, Number(s.max) || 5));
      const v = Number(value) || 0;
      return (
        <div role="radiogroup" aria-labelledby={labelId} className="flex items-center gap-1">
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" role="radio" aria-checked={v === n} aria-label={tr('Ocena: {n}', { n })} disabled={disabled}
              onClick={() => onChange(v === n ? 0 : n)}
              className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 outline-none transition-colors">
              <Star size={22} aria-hidden="true" className={n <= v ? 'fill-[#FFBE0B] text-[#FFBE0B]' : 'text-gray-300 dark:text-gray-600'} />
            </button>
          ))}
        </div>
      );
    }
    case 'progress': {
      const v = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
      return (
        <div className="flex items-center gap-3">
          <input id={id} type="range" min={0} max={100} step={5} value={v} disabled={disabled}
            onChange={(e) => onChange(Number(e.target.value))} className="flex-1" />
          <span className="w-12 text-right text-sm font-semibold tabular-nums text-gray-700 dark:text-gray-200">{v}%</span>
        </div>
      );
    }
    default:
      return null;
  }
}

// Etykieta pola: <label for> dla pól tekstowych, zwykły tekst z id dla grup (pigułki, gwiazdki).
export function FormFieldLabel({ column, id, required = false }) {
  const grouped = ['status', 'priority', 'dropdown', 'rating'].includes(column.type);
  const content = <>{column.name}{required && <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>}</>;
  return grouped
    ? <span id={`${id}-label`} className={FORM_LABEL}>{content}</span>
    : <label id={`${id}-label`} htmlFor={id} className={FORM_LABEL}>{content}</label>;
}
