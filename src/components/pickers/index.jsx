import React, { useEffect, useState } from 'react';
import CustomDatePicker from '../CustomDatePicker';
import TimeInput from '../TimeInput';

// Zamienniki natywnych <input type="date|time|datetime-local"> z tym samym interfejsem
// (value + onChange(event) z event.target.value), ale z kalendarzem i wybierakiem godziny
// w stylu aplikacji — natywne pola wyglądały różnie w każdej przeglądarce, a godzinę
// trzeba było wpisywać ręcznie. Podmiana w miejscu użycia: <input type="date" …> → <DateInput …>.

const fakeEvent = (value, name) => ({ target: { value, name }, currentTarget: { value, name } });

// Z klas natywnego pola bierzemy tylko układ (szerokość/flex); wygląd daje motyw.
const layoutClasses = (className = '') =>
  (className.match(/(^|\s)((?:[a-z]+:)?(?:w-\S+|min-w-\S+|max-w-\S+|flex-1|flex-none|shrink-0|grow|col-span-\S+|mt-\S+|mb-\S+))/g) || [])
    .map((c) => c.trim()).join(' ');
// Atrybuty danych/dostępności (np. data-tour — kotwica samouczka) przechodzą na opakowanie.
const passthrough = (rest) => Object.fromEntries(Object.entries(rest).filter(([k]) => /^(data-|aria-)|^id$/.test(k)));
const isCompact = (className = '') => /(^|\s)(py-0\.5|py-1|py-1\.5|text-xs|h-7|h-8)(\s|$)/.test(className);

export function DateInput({ value, onChange, name, min, max, disabled, required, autoFocus, onBlur, placeholder, className = '', compact, ...rest }) {
  return (
    <div className={layoutClasses(className) || 'w-full'} {...passthrough(rest)}>
      <CustomDatePicker
        value={value ? String(value).slice(0, 10) : ''}
        onChange={(v) => onChange?.(fakeEvent(v, name))}
        min={min}
        max={max}
        disabled={disabled}
        autoFocus={autoFocus}
        onClose={onBlur}
        clearable={!required}
        compact={compact ?? isCompact(className)}
        placeholder={placeholder}
      />
    </div>
  );
}

// Godzina: TimeInput emituje też stany pośrednie przy pisaniu („1:”) — natywne pole oddaje
// tylko pełne „HH:MM” albo pusty string, więc tu filtrujemy (część miejsc zapisuje od razu do bazy).
export function TimeField({ value, onChange, name, disabled, className = '', compact, ...rest }) {
  const [local, setLocal] = useState(value || '');
  useEffect(() => { setLocal(value || ''); }, [value]);
  const handle = (v) => {
    setLocal(v);
    if (v === '' || v === ':') onChange?.(fakeEvent('', name));
    else if (/^\d{2}:\d{2}$/.test(v)) onChange?.(fakeEvent(v, name));
  };
  const small = compact ?? isCompact(className);
  return (
    <div className={layoutClasses(className) || 'w-full'} {...passthrough(rest)}>
      <TimeInput
        value={local}
        onChange={handle}
        disabled={disabled}
        compact={small}
        className={`w-full ${small ? 'px-2 py-1 rounded-xl border text-xs' : 'px-4 py-3 rounded-xl border'}`}
      />
    </div>
  );
}

// Data + godzina („YYYY-MM-DDTHH:MM”, jak datetime-local).
export function DateTimeInput({ value, onChange, name, min, max, disabled, required, className = '', ...rest }) {
  const [d = '', t = ''] = String(value || '').split('T');
  const [time, setTime] = useState(t.slice(0, 5));
  useEffect(() => { setTime(t.slice(0, 5)); }, [t]);
  const emit = (date, tm) => onChange?.(fakeEvent(date ? `${date}T${tm || '00:00'}` : '', name));
  return (
    <div className={`${layoutClasses(className) || 'w-full'} flex gap-2`} {...passthrough(rest)}>
      <div className="flex-1 min-w-0">
        <CustomDatePicker
          value={d}
          onChange={(v) => emit(v, time)}
          min={min ? String(min).slice(0, 10) : undefined}
          max={max ? String(max).slice(0, 10) : undefined}
          disabled={disabled}
          clearable={!required}
        />
      </div>
      <TimeInput
        value={time}
        onChange={(v) => { setTime(v); if (/^\d{2}:\d{2}$/.test(v) && d) emit(d, v); }}
        disabled={disabled}
        className="w-32 shrink-0 px-3 py-3 rounded-xl border"
      />
    </div>
  );
}
