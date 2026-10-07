import React, { useEffect, useRef } from 'react';
import { Bell, BellOff, Clock, Moon, Sun } from 'lucide-react';
import { tr, appLocale } from '../../../i18n';
import { muteState, muteUntilKind } from '../utils/chatLogic';

// Opis „do kiedy wyciszona” — wspólny dla listy rozmów, nagłówka i menu.
export function muteUntilLabel(until, now = Date.now()) {
  const k = muteUntilKind(until, now);
  if (!k) return '';
  const time = k.date.toLocaleTimeString(appLocale(), { hour: '2-digit', minute: '2-digit' });
  if (k.kind === 'today') return tr('do {time}', { time });
  if (k.kind === 'tomorrow') return tr('do jutra {time}', { time });
  return tr('do {date}', { date: k.date.toLocaleString(appLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) });
}

// Menu „Wycisz” (K4): 1 godzina / 8 godzin / do jutra 8:00 / zawsze / „Włącz powiadomienia”.
// Pozycjonowane względem rodzica (relative). onSelect('1h'|'8h'|'tomorrow'|'always'|'off').
export default function MuteMenu({ open, onClose, conversation, onSelect, align = 'right' }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose?.(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  const state = muteState(conversation);
  const item = 'flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 focus-visible:bg-gray-50 dark:focus-visible:bg-gray-800 outline-none transition text-left';
  const pick = (opt) => { onClose?.(); onSelect?.(opt); };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={tr('Wycisz powiadomienia')}
      className={`absolute top-full mt-1 z-50 w-60 bg-white dark:bg-gray-900 border border-gray-200/70 dark:border-gray-700/70 rounded-xl shadow-xl py-1 ${align === 'right' ? 'right-0' : 'left-0'}`}
    >
      {state.muted && (
        <p className="px-3 pt-1.5 pb-1 text-xs text-gray-500 dark:text-gray-400">
          {state.until ? tr('Wyciszona {until}', { until: muteUntilLabel(state.until) }) : tr('Wyciszona na stałe')}
        </p>
      )}
      <p className="px-3 pt-1 pb-0.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{tr('Wycisz')}</p>
      <button type="button" role="menuitem" className={item} onClick={() => pick('1h')}><Clock size={15} className="text-gray-400" />{tr('Na 1 godzinę')}</button>
      <button type="button" role="menuitem" className={item} onClick={() => pick('8h')}><Clock size={15} className="text-gray-400" />{tr('Na 8 godzin')}</button>
      <button type="button" role="menuitem" className={item} onClick={() => pick('tomorrow')}><Sun size={15} className="text-gray-400" />{tr('Do jutra, 8:00')}</button>
      <button type="button" role="menuitem" className={item} onClick={() => pick('always')}><Moon size={15} className="text-gray-400" />{tr('Zawsze')}</button>
      {state.muted && (
        <>
          <div className="my-1 border-t border-gray-200/60 dark:border-gray-700/60" />
          <button type="button" role="menuitem" className={item} onClick={() => pick('off')}><Bell size={15} className="text-gray-400" />{tr('Włącz powiadomienia')}</button>
        </>
      )}
      <p className="px-3 pt-1.5 pb-1 text-[11px] text-gray-400 dark:text-gray-500 flex items-start gap-1.5">
        <BellOff size={12} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
        {tr('Wzmianki o Tobie (@) przychodzą zawsze.')}
      </p>
    </div>
  );
}
