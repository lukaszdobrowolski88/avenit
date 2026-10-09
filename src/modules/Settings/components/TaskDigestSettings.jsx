import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { tr } from '../../../i18n';
import Button from '../../../components/Button';
import { Toggle } from './SettingsUI';
import { digestConfig, serializeDigestConfig, clampOverdueDays, MAX_OVERDUE_DAYS } from '@avenit/shared/src/lib/taskDigest.js';

// Poranny przegląd zadań — ustawienie całej organizacji (app_settings 'task_digest' = JSON
// {enabled, overdue_days}; czyta fn task-digest). Zapis app_settings wymaga
// action:settings:manage_integrations — bramkuje rodzic (<Can>), serwer i tak sprawdza.
export default function TaskDigestSettings({ raw, onSave }) {
  const initial = digestConfig(raw);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [days, setDays] = useState(String(initial.overdue_days));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const c = digestConfig(raw);
    setEnabled(c.enabled);
    setDays(String(c.overdue_days));
  }, [raw]);

  const daysNum = Number(days);
  const valid = days.trim() !== '' && Number.isInteger(daysNum) && daysNum >= 0 && daysNum <= MAX_OVERDUE_DAYS;
  const dirty = enabled !== initial.enabled || (valid && clampOverdueDays(daysNum) !== initial.overdue_days);

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await onSave(serializeDigestConfig({ enabled, overdue_days: daysNum }));
    } finally {
      setSaving(false);
    }
  };

  const toggleLabel = tr('Wysyłaj poranny przegląd zadań');
  return (
    <div className="mt-10">
      <div className="mb-4 border-b border-gray-100 dark:border-gray-700 pb-4">
        <h3 className="text-lg font-bold text-gray-800 dark:text-white">{tr('Poranny przegląd zadań')}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {tr('Codziennie o 7:00 każda osoba dostaje e-mail i push z zadaniami na dziś i zaległymi. Każdy może go wyłączyć u siebie w profilu.')}
        </p>
      </div>
      <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
        <span className="font-medium text-gray-800 dark:text-gray-200">{toggleLabel}</span>
        <Toggle label={toggleLabel} checked={enabled} disabled={saving} onChange={setEnabled} />
      </div>
      {enabled && (
        <div className="mt-4">
          <label htmlFor="task-digest-days" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">
            {tr('Zaległe z ostatnich (dni)')}
          </label>
          <input
            id="task-digest-days"
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_OVERDUE_DAYS}
            step={1}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            aria-invalid={!valid}
            aria-describedby="task-digest-days-hint"
            className="w-32 p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:border-accent-primary-light outline-none transition"
          />
          <p id="task-digest-days-hint" className={`mt-1 text-xs ${valid ? 'text-gray-400' : 'text-red-600 dark:text-red-400'}`}>
            {valid
              ? tr('Starsze zaległe zadania nie trafiają do przeglądu. 0 — tylko zadania na dziś.')
              : tr('Podaj liczbę od 0 do {max}.', { max: MAX_OVERDUE_DAYS })}
          </p>
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <Button icon={Save} onClick={save} loading={saving} disabled={!valid || !dirty}>{tr('Zapisz')}</Button>
      </div>
    </div>
  );
}
