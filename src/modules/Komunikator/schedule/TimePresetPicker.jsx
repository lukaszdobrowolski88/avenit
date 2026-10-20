import React, { useMemo, useState } from 'react';
import { CalendarClock, ChevronRight } from 'lucide-react';
import { tr } from '../../../i18n';
import { DateInput, TimeField } from '../../../components/pickers';
import Button from '../../../components/Button';
import { presetLabel, whenLabel, fromWarsawYmdHm, warsawYmdHm, isValidChatTime } from './scheduleUi';

// Wybór terminu: gotowe terminy (lista) + „Wybierz datę i godzinę” (kalendarz i wybierak godziny).
// Godziny zawsze w czasie polskim (Europe/Warsaw); onPick dostaje ISO (UTC).
//   presets: [{ key, at: Date }] (shared/lib/chatSchedule.js), detailKeys — przy których pokazać termin.
const browserTz = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; }
})();

// Domyślny własny termin: za godzinę, zaokrąglony w górę do 5 minut.
const defaultCustom = () => {
  const ms = Date.now() + 60 * 60_000;
  return warsawYmdHm(Math.ceil(ms / (5 * 60_000)) * 5 * 60_000);
};

export default function TimePresetPicker({ presets, onPick, busy = false, detailKeys = [], confirmLabel, compact = false }) {
  const [custom, setCustom] = useState(false);
  const [{ ymd, hm }, setValue] = useState(defaultCustom);
  const at = useMemo(() => fromWarsawYmdHm(ymd, hm), [ymd, hm]);
  const valid = !!at && isValidChatTime(at);
  const today = warsawYmdHm(Date.now()).ymd;
  const row = `w-full flex items-center gap-3 px-3 ${compact ? 'py-2' : 'py-2.5'} rounded-xl text-left text-sm text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/50 disabled:opacity-50 transition`;

  return (
    <div className="space-y-0.5">
      {presets.map((p) => (
        <button key={p.key} type="button" disabled={busy} onClick={() => onPick(p.at.toISOString())} className={row}>
          <span className="flex-1 font-medium">{presetLabel(p.key)}</span>
          {detailKeys.includes(p.key) && <span className="text-xs text-gray-500 dark:text-gray-400">{whenLabel(p.at)}</span>}
        </button>
      ))}
      <button type="button" disabled={busy} onClick={() => setCustom((v) => !v)} aria-expanded={custom} className={row}>
        <CalendarClock size={16} className="text-gray-500 dark:text-gray-400" aria-hidden="true" />
        <span className="flex-1 font-medium">{tr('Wybierz datę i godzinę')}</span>
        <ChevronRight size={16} className={`text-gray-400 transition-transform ${custom ? 'rotate-90' : ''}`} aria-hidden="true" />
      </button>
      {custom && (
        <div className="px-3 pt-2 pb-1 space-y-2">
          <div className="flex gap-2">
            <div className="flex-1 min-w-0">
              <DateInput value={ymd} min={today} required onChange={(e) => setValue((v) => ({ ...v, ymd: e.target.value }))} aria-label={tr('Data')} compact />
            </div>
            <div className="w-28 shrink-0">
              <TimeField value={hm} onChange={(e) => setValue((v) => ({ ...v, hm: e.target.value }))} aria-label={tr('Godzina')} compact />
            </div>
          </div>
          {browserTz && browserTz !== 'Europe/Warsaw' && (
            <p className="text-xs text-gray-500 dark:text-gray-400">{tr('Godzina według czasu polskiego.')}</p>
          )}
          {!valid && ymd && hm && (
            <p className="text-xs text-red-600 dark:text-red-400" role="alert">{tr('Wybierz termin w przyszłości (najwyżej rok naprzód).')}</p>
          )}
          <Button size="sm" className="w-full justify-center" disabled={!valid || busy} onClick={() => valid && onPick(at.toISOString())}>
            {confirmLabel || tr('Zapisz')}{valid ? ` · ${whenLabel(at)}` : ''}
          </Button>
        </div>
      )}
    </div>
  );
}
