import React, { useState, useEffect, useCallback } from 'react';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { subscribeToasts } from '../lib/toast';

const CONF = {
  error: { icon: AlertCircle, accent: 'text-red-500', ring: 'border-red-200 dark:border-red-800/50' },
  success: { icon: CheckCircle2, accent: 'text-green-500', ring: 'border-green-200 dark:border-green-800/50' },
  info: { icon: Info, accent: 'text-accent-primary', ring: 'border-gray-200 dark:border-gray-700' },
};

function ToastItem({ t, onClose }) {
  const c = CONF[t.type] || CONF.info;
  const Icon = c.icon;
  useEffect(() => {
    const ms = t.duration || (t.type === 'error' ? 7000 : 4000);
    const timer = setTimeout(() => onClose(t.id), ms);
    return () => clearTimeout(timer);
  }, [t.id]);
  return (
    <div className={`pointer-events-auto max-w-sm w-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border ${c.ring} overflow-hidden animate-[slideIn_.2s_ease]`}>
      <div className="flex items-start gap-3 p-3.5">
        <Icon size={20} className={`${c.accent} shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          {t.title && <div className="text-sm font-semibold text-gray-900 dark:text-white">{t.title}</div>}
          <div className="text-sm text-gray-600 dark:text-gray-300 break-words">{t.message}</div>
          {t.action && (
            <button onClick={() => { t.action.onClick?.(); onClose(t.id); }}
              className={`mt-1.5 text-xs font-semibold ${c.accent} hover:underline`}>{t.action.label}</button>
          )}
        </div>
        <button onClick={() => onClose(t.id)} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg shrink-0"><X size={15} /></button>
      </div>
    </div>
  );
}

// Globalny kontener toastów feedbacku. Montowany raz w App. Subskrybuje lib/toast.
export default function Toaster() {
  const [toasts, setToasts] = useState([]);
  const close = useCallback((id) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  useEffect(() => subscribeToasts((t) => setToasts((ts) => [...ts.slice(-4), t])), []);
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[9998] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => <ToastItem key={t.id} t={t} onClose={close} />)}
    </div>
  );
}
