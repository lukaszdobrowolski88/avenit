import React from 'react';
import { tr } from '../../i18n';

// Pasek poziomu wejścia (0–1): zielony, żółty powyżej ~85%, czerwony przy przesterowaniu.
export function LevelMeter({ level = 0, label }) {
  const pct = Math.round(Math.max(0, Math.min(1, level)) * 100);
  const state = pct >= 97 ? 'clip' : pct >= 85 ? 'high' : 'ok';
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
        <span>{label || tr('Poziom wejścia')}</span>
        {state === 'clip' && <span className="font-semibold text-red-600 dark:text-red-400">{tr('Za głośno — przycisz wejście')}</span>}
      </div>
      <div className="ip-meter" data-level={state} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label || tr('Poziom wejścia')}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// Wybór wejścia audio (mikrofon / wejście z miksera). devices: MediaDeviceInfo[].
export function InputSelect({ id, label, devices, value, onChange, disabled }) {
  return (
    <div>
      <label htmlFor={id} className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      <select id={id} value={value || ''} onChange={(e) => onChange(e.target.value)} disabled={disabled}
        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100">
        {!devices.length && <option value="">{tr('Domyślne wejście')}</option>}
        {devices.map((d, i) => (
          <option key={d.deviceId} value={d.deviceId}>{d.label || tr('Wejście {n}', { n: i + 1 })}</option>
        ))}
      </select>
    </div>
  );
}

// Suwak głośności odsłuchu (Oryginał / partner).
export function VolumeSlider({ id, label, value, onChange, disabled }) {
  return (
    <div>
      <label htmlFor={id} className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
        <span>{label}</span><span className="tabular-nums normal-case font-medium">{Math.round(value * 100)}%</span>
      </label>
      <input id={id} type="range" min="0" max="1" step="0.05" value={value} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-amber-600" />
    </div>
  );
}
