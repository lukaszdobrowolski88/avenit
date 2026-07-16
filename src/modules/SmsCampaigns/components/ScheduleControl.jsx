import React from 'react';
import { Send, Clock, Sparkles, Moon } from 'lucide-react';
import { tr } from '../../../i18n';

const MODES = [
  { id: 'now', label: tr('Wyślij teraz'), icon: Send, description: tr('SMS idą natychmiast po zapisie.') },
  { id: 'scheduled', label: 'Zaplanuj', icon: Clock, description: tr('Wybierz datę i godzinę wysyłki.') },
  { id: 'smart', label: 'Smart delivery', icon: Sparkles, description: tr('Wyślij gdy odbiorca jest aktywny (max okno czasu).') },
];

export default function ScheduleControl({
  sendMode = 'now',
  scheduledAt,
  smartWindowHours,
  quietHoursStart,
  quietHoursEnd,
  frequencyCapPerDay,
  onChange,
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {MODES.map(m => (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange({ sendMode: m.id })}
            className={`p-3 rounded-lg border-2 text-left transition-all ${
              sendMode === m.id
                ? 'border-accent-primary bg-accent-primary-lightest dark:bg-accent-primary-darkest/30'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <m.icon size={16} className={sendMode === m.id ? 'text-accent-primary' : 'text-gray-500'} />
              <span className="text-sm font-medium text-gray-900 dark:text-white">{m.label}</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{m.description}</p>
          </button>
        ))}
      </div>

      {sendMode === 'scheduled' && (
        <div>
          <label className="text-xs text-gray-500 mb-1 block">{tr('Data i godzina wysyłki')}</label>
          <input
            type="datetime-local"
            value={scheduledAt ? toLocalDatetime(scheduledAt) : ''}
            onChange={e => onChange({ scheduledAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
            className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
          />
        </div>
      )}

      {sendMode === 'smart' && (
        <div>
          <label className="text-xs text-gray-500 mb-1 block">{tr('Maksymalne okno opóźnienia')}</label>
          <select
            value={smartWindowHours || 12}
            onChange={e => onChange({ smartWindowHours: parseInt(e.target.value, 10) })}
            className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
          >
            <option value={2}>2 godziny</option>
            <option value={6}>6 godzin</option>
            <option value={12}>12 godzin</option>
            <option value={24}>24 godziny</option>
            <option value={48}>2 dni</option>
          </select>
        </div>
      )}

      <details className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
        <summary className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer flex items-center gap-2">
          <Moon size={14} />
          Ograniczenia (opcjonalne)
        </summary>
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Cisza nocna od</label>
              <input
                type="time"
                value={quietHoursStart || ''}
                onChange={e => onChange({ quietHoursStart: e.target.value || null })}
                className="w-full px-2 py-1.5 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">do</label>
              <input
                type="time"
                value={quietHoursEnd || ''}
                onChange={e => onChange({ quietHoursEnd: e.target.value || null })}
                className="w-full px-2 py-1.5 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">{tr('Max SMS-ów dziennie do jednego odbiorcy')}</label>
            <input
              type="number"
              min={1}
              max={20}
              value={frequencyCapPerDay || ''}
              onChange={e => onChange({ frequencyCapPerDay: e.target.value ? parseInt(e.target.value, 10) : null })}
              placeholder="brak limitu"
              className="w-full px-2 py-1.5 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded"
            />
          </div>
        </div>
      </details>
    </div>
  );
}

function toLocalDatetime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}
