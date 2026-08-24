import React, { useRef } from 'react';
import { Clock } from 'lucide-react';

// Pole godziny HH:MM z auto-przeskokiem: po wpisaniu godziny kursor sam wskakuje do minut.
// Wartość i onChange operują na stringu "HH:MM" (jak natywne <input type=time>).
export default function TimeInput({ value = '', onChange, className = '', placeholder = '--:--' }) {
  const [hhRaw = '', mmRaw = ''] = String(value || '').split(':');
  const mmRef = useRef(null);
  const hhRef = useRef(null);

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
    const h = String(Math.min(23, parseInt(hhRaw || '0', 10) || 0)).padStart(2, '0');
    const m = String(Math.min(59, parseInt(mmRaw || '0', 10) || 0)).padStart(2, '0');
    emit(h, m);
  };

  const seg = 'w-8 bg-transparent text-center outline-none tabular-nums text-gray-800 dark:text-white';
  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      <Clock size={16} className="text-gray-400 mr-1 shrink-0" />
      <input ref={hhRef} inputMode="numeric" value={hhRaw} onChange={onHour} onBlur={normalize}
        placeholder="--" aria-label="Godzina" className={seg} />
      <span className="text-gray-400">:</span>
      <input ref={mmRef} inputMode="numeric" value={mmRaw} onChange={onMinute} onKeyDown={onMinuteKey} onBlur={normalize}
        placeholder="--" aria-label="Minuty" className={seg} />
    </div>
  );
}
