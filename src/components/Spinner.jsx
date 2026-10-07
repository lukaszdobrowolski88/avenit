import React from 'react';
import { Loader2 } from 'lucide-react';
import { tr } from '../i18n';

// Wspólny spinner — jedno źródło prawdy zamiast ~56 ad-hoc „border-circle" w akcencie.
// Spinner w kolorze marki (akcent), etykieta wyciszona.
export default function Spinner({ size = 24, className = '', center = false, label }) {
  const el = (
    // role="status": czytnik ekranu ogłasza ładowanie (bez etykiety — ukryte „Ładowanie…”).
    <span role="status" className={`inline-flex items-center gap-2 ${className}`}>
      <Loader2 size={size} className="animate-spin text-accent-primary" aria-hidden="true" />
      {label ? <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span> : <span className="sr-only">{tr('Ładowanie…')}</span>}
    </span>
  );
  return center ? <div className="flex items-center justify-center py-10 w-full">{el}</div> : el;
}
