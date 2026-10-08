import React, { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { tr } from '../../../i18n';

// Domyślne ustawienia automatycznych przypomnień (worker schedule-reminders, app_settings
// „schedule_reminders”). Te same wartości domyślne ma serwer — brak wpisu = włączone.
export const REMINDER_DEFAULTS = { enabled: true, days_before: 2, nudge_enabled: true, nudge_after_days: 3 };
const clamp = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
export function normalizeReminders(raw) {
  let v = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
  v = v && typeof v === 'object' ? v : {};
  return {
    enabled: v.enabled !== false,
    days_before: clamp(v.days_before, 1, 7, REMINDER_DEFAULTS.days_before),
    nudge_enabled: v.nudge_enabled !== false,
    nudge_after_days: clamp(v.nudge_after_days, 1, 14, REMINDER_DEFAULTS.nudge_after_days),
  };
}

function Switch({ checked, onChange, disabled, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full shrink-0 transition-colors disabled:opacity-50 ${checked ? 'bg-accent-primary' : 'bg-gray-300 dark:bg-gray-600'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  );
}

function DaysInput({ value, onChange, min, max, disabled, label }) {
  return (
    <input type="number" min={min} max={max} value={value} disabled={disabled} aria-label={label}
      onChange={(e) => onChange(clamp(e.target.value, min, max, value))}
      className="!w-16 !px-2 !py-1.5 !rounded-lg text-sm text-center border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 tabular-nums" />
  );
}

export default function ReminderSettingsModal({ isOpen, onClose, value, canEdit, onSave }) {
  const [cfg, setCfg] = useState(() => normalizeReminders(value));
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (isOpen) setCfg(normalizeReminders(value)); }, [isOpen, value]);
  const set = (patch) => setCfg((c) => ({ ...c, ...patch }));

  const save = async () => {
    setBusy(true);
    try { if (await onSave(cfg)) onClose(); } finally { setBusy(false); }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={tr('Automatyczne przypomnienia')}
      subtitle={tr('E-mail i push wysyłane codziennie o 18:00 — dla wszystkich służb.')}
      icon={BellRing}
      size="md"
      footer={canEdit ? (
        <>
          <Button variant="secondary" onClick={onClose}>{tr('Anuluj')}</Button>
          <Button loading={busy} onClick={save}>{tr('Zapisz')}</Button>
        </>
      ) : <Button variant="secondary" onClick={onClose}>{tr('Zamknij')}</Button>}
    >
      <div className="p-6 space-y-5">
        <div className="flex items-start gap-3">
          <Switch checked={cfg.enabled} disabled={!canEdit} onChange={(v) => set({ enabled: v })} label={tr('Przypomnienie dla potwierdzonych')} />
          <div className="text-sm text-gray-700 dark:text-gray-200">
            <div className="font-semibold text-gray-900 dark:text-gray-100">{tr('Przypomnienie dla potwierdzonych')}</div>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <DaysInput value={cfg.days_before} min={1} max={7} disabled={!canEdit || !cfg.enabled} onChange={(v) => set({ days_before: v })} label={tr('Ile dni przed służbą')} />
              <span>{tr('dni przed służbą')}</span>
            </div>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Switch checked={cfg.nudge_enabled} disabled={!canEdit} onChange={(v) => set({ nudge_enabled: v })} label={tr('Ponowna prośba do niepotwierdzonych')} />
          <div className="text-sm text-gray-700 dark:text-gray-200">
            <div className="font-semibold text-gray-900 dark:text-gray-100">{tr('Ponowna prośba do niepotwierdzonych')}</div>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <span>{tr('gdy brak odpowiedzi po')}</span>
              <DaysInput value={cfg.nudge_after_days} min={1} max={14} disabled={!canEdit || !cfg.nudge_enabled} onChange={(v) => set({ nudge_after_days: v })} label={tr('Po ilu dniach bez odpowiedzi')} />
              <span>{tr('dniach (jednorazowo)')}</span>
            </div>
          </div>
        </div>
        {!canEdit && (
          <p className="text-xs text-gray-500 dark:text-gray-400">{tr('Zmienić to może administrator (Ustawienia → integracje).')}</p>
        )}
      </div>
    </Modal>
  );
}
