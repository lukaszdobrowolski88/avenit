import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { subscribeToasts, listenWriteErrors } from '../lib/toast';
import { tr } from '../i18n';

const CONF = {
  error: { icon: AlertCircle, accent: 'text-red-600 dark:text-red-400', ring: 'border-red-200 dark:border-red-800/50' },
  success: { icon: CheckCircle2, accent: 'text-green-700 dark:text-green-400', ring: 'border-green-200 dark:border-green-800/50' },
  info: { icon: Info, accent: 'text-accent-primary', ring: 'border-gray-200 dark:border-gray-700' },
};

// Błąd trzeba zdążyć przeczytać (także wolniej czytającym): 12 s zamiast 7 s, a najechanie
// kursorem lub fokus na toaście wstrzymuje odliczanie. Sukces/info — 4 s.
const ERROR_MS = 12000;
const DEFAULT_MS = 4000;

function ToastItem({ t, onClose }) {
  const c = CONF[t.type] || CONF.info;
  const Icon = c.icon;
  const isError = t.type === 'error';
  const [paused, setPaused] = useState(false);
  const left = useRef(t.duration || (isError ? ERROR_MS : DEFAULT_MS));

  useEffect(() => {
    if (paused) return undefined;
    const started = Date.now();
    const timer = setTimeout(() => onClose(t.id), left.current);
    return () => {
      clearTimeout(timer);
      left.current = Math.max(1500, left.current - (Date.now() - started));
    };
  }, [t.id, paused]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      aria-atomic="true"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false); }}
      className={`pointer-events-auto max-w-sm w-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border ${c.ring} overflow-hidden animate-[slideIn_.2s_ease]`}
    >
      <div className="flex items-start gap-3 p-3.5">
        <Icon size={20} className={`${c.accent} shrink-0 mt-0.5`} aria-hidden="true" />
        <div className="flex-1 min-w-0">
          {t.title && <div className="text-sm font-semibold text-gray-900 dark:text-white">{t.title}</div>}
          <div className="text-sm text-gray-600 dark:text-gray-300 break-words">{t.message}</div>
          {t.action && (
            <button type="button" onClick={() => { t.action.onClick?.(); onClose(t.id); }}
              className={`mt-1.5 text-xs font-semibold ${c.accent} hover:underline`}>{t.action.label}</button>
          )}
        </div>
        <button type="button" onClick={() => onClose(t.id)} aria-label={tr('Zamknij powiadomienie')} title={tr('Zamknij')}
          className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg shrink-0"><X size={15} aria-hidden="true" /></button>
      </div>
    </div>
  );
}

// Globalny kontener toastów feedbacku. Montowany raz w App. Subskrybuje lib/toast oraz
// nasłuchuje nieudanych zapisów z apiClient (komunikat, gdy wywołujący sam go nie pokazał).
// Kontener jest zawsze w DOM (region z aria-live) — czytnik ekranu ogłasza nowe komunikaty.
export default function Toaster() {
  const [toasts, setToasts] = useState([]);
  const close = useCallback((id) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  useEffect(() => subscribeToasts((t) => setToasts((ts) => [...ts.slice(-4), t])), []);
  useEffect(() => listenWriteErrors(), []);
  return (
    <div
      role="region"
      aria-label={tr('Powiadomienia')}
      className="fixed bottom-4 right-4 z-[9998] flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((t) => <ToastItem key={t.id} t={t} onClose={close} />)}
    </div>
  );
}
