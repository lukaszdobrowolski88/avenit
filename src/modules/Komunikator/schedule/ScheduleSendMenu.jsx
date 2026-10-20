import React, { useEffect, useMemo, useRef } from 'react';
import { Clock } from 'lucide-react';
import { tr } from '../../../i18n';
import TimePresetPicker from './TimePresetPicker';
import { schedulePresets } from './scheduleUi';

// „Zaplanuj wysyłkę” — menu nad przyciskiem Wyślij (długie przytrzymanie / prawy klik / zegar).
export default function ScheduleSendMenu({ open, onClose, onPick, busy = false }) {
  const ref = useRef(null);
  // Gotowe terminy liczone przy otwarciu (po 18:00 „Dziś 18:00” znika).
  const presets = useMemo(() => (open ? schedulePresets(new Date()) : []), [open]);

  useEffect(() => {
    if (!open) return undefined;
    // Przycisk otwierający (data-schedule-toggle) sam przełącza menu — bez zamknięcia i ponownego otwarcia.
    const onDown = (e) => {
      if (e.target?.closest?.('[data-schedule-toggle]')) return;
      if (ref.current && !ref.current.contains(e.target)) onClose?.();
    };
    const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) onClose?.(); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div ref={ref} role="dialog" aria-label={tr('Zaplanuj wysyłkę')}
      className="absolute bottom-full right-4 mb-2 z-30 w-[300px] max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl p-2">
      <p className="flex items-center gap-2 px-3 pt-1.5 pb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        <Clock size={13} aria-hidden="true" /> {tr('Zaplanuj wysyłkę')}
      </p>
      <TimePresetPicker presets={presets} onPick={onPick} busy={busy} confirmLabel={tr('Zaplanuj')} compact />
    </div>
  );
}
