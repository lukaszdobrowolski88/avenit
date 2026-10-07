import React from 'react';
import { tr } from '../../../i18n';

// Liczba modlących się w poprawnej formie (1 osoba / 2–4 osoby / 5+ osób).
function prayingLabel(n) {
  if (n === 1) return tr('1 osoba się modli');
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return tr('{n} osoby się modlą', { n });
  return tr('{n} osób się modli', { n });
}

// Karta prośby o modlitwę. Przycisk "🙏 Modlę się" z licznikiem.
export default function PrayerCard({ message, prayer, onTogglePraying }) {
  const meta = message.metadata || {};
  const title = meta.title || message.content || tr('Prośba o modlitwę');
  const count = prayer?.count || 0;
  const hasPrayed = prayer?.hasPrayed || false;

  return (
    <div className="w-72 sm:w-80 rounded-2xl bg-gradient-to-br from-accent-primary-lightest to-accent-secondary-lightest dark:from-accent-primary-darkest/20 dark:to-accent-secondary-darkest/20 border border-accent-primary-lighter/60 dark:border-accent-primary-dark/40 shadow-sm overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-start gap-2">
        <span className="text-2xl leading-none flex-shrink-0">🙏</span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-accent-primary dark:text-accent-primary-light">
            {tr('Prośba o modlitwę')}
          </p>
          <p className="font-medium text-gray-900 dark:text-white break-words leading-snug mt-0.5 whitespace-pre-wrap">
            {title}
          </p>
        </div>
      </div>

      <div className="px-4 pb-3 pt-1 flex items-center justify-between gap-2">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {count === 0 ? tr('Nikt się jeszcze nie modli') : prayingLabel(count)}
        </span>
        <button
          type="button"
          onClick={() => onTogglePraying?.(message.id)}
          aria-pressed={hasPrayed}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all ${
            hasPrayed
              ? 'bg-accent-primary text-white shadow-md shadow-accent-primary/30'
              : 'bg-white/80 dark:bg-gray-800/80 text-accent-primary dark:text-accent-primary-light border border-accent-primary-light/50 hover:scale-105'
          }`}
        >
          <span>🙏</span>
          {tr('Modlę się')}
        </button>
      </div>
    </div>
  );
}
