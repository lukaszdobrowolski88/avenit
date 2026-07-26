import React, { useState } from 'react';
import { Copy, Check, Sparkles, AlertTriangle } from 'lucide-react';

// Panel wyniku AI: stan ładowania, błąd, wynik z przyciskiem „Kopiuj".
export default function ResultPanel({ loading, error, result, title = 'Wynik', emptyHint }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: zaznaczenie nie jest krytyczne — po cichu ignorujemy.
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8">
        <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
          <Sparkles size={18} className="animate-pulse text-accent-primary dark:text-accent-primary-light" />
          <span className="text-sm">Asystent generuje odpowiedź…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-900/20 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-500 dark:text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">Nie udało się wygenerować odpowiedzi</p>
            <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40 p-8 text-center">
        <Sparkles size={28} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
        <p className="text-sm text-gray-500 dark:text-gray-400">{emptyHint || 'Wynik pojawi się tutaj.'}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-700">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h4>
        <button
          onClick={copy}
          className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 text-xs font-medium transition"
        >
          {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
          {copied ? 'Skopiowano' : 'Kopiuj'}
        </button>
      </div>
      <div className="p-5">
        <pre className="whitespace-pre-wrap break-words font-sans text-sm text-gray-800 dark:text-gray-100 leading-relaxed">{result}</pre>
      </div>
    </div>
  );
}
