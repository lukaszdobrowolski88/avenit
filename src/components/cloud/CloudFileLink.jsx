import React from 'react';
import { ExternalLink, X } from 'lucide-react';
import CloudProviderIcon from './CloudProviderIcon';
import { cloudItemOf, cloudOpenText, cloudProviderName, fmtCloudSize } from './cloudFilesLogic';
import { tr } from '../../i18n';

// Odnośnik do pliku w Dysku Google / OneDrive / SharePoint: ikona dostawcy, nazwa, „Otwórz w …”.
// Plik otwiera się u dostawcy (nowa karta) — Avenit nie pobiera ani nie pośredniczy w treści,
// a adres przechodzi przez białą listę hostów (inaczej link jest nieaktywny).
//   item    — załącznik wiadomości (kind 'cloud') albo wiersz materials_files (external_*)
//   variant — 'card' (domyślnie) | 'own' (dymek własnej wiadomości) | 'chip' (podgląd w polu wiadomości)
export default function CloudFileLink({ item, variant = 'card', onRemove, className = '' }) {
  const c = cloudItemOf(item);
  if (!c) return null;
  const href = c.web_url;
  const open = cloudOpenText(c.provider);
  const meta = [cloudProviderName(c.provider), fmtCloudSize(c.size)].filter(Boolean).join(' · ');
  const tone = variant === 'own'
    ? 'bg-white/10 hover:bg-white/20 text-white'
    : 'bg-gray-100 dark:bg-gray-700/50 hover:bg-gray-200 dark:hover:bg-gray-600/50 text-gray-900 dark:text-gray-100';

  if (variant === 'chip') {
    return (
      <div className={`relative group flex items-center gap-2 px-3 py-2 bg-white/80 dark:bg-gray-800/80 rounded-xl border border-gray-200/50 dark:border-gray-700/50 ${className}`} data-testid="cloud-chip">
        <span className="w-10 h-10 rounded-lg bg-gray-50 dark:bg-gray-900 flex items-center justify-center shrink-0">
          <CloudProviderIcon provider={c.provider} size={22} />
        </span>
        <div className="max-w-[140px] min-w-0">
          <p className="text-xs font-medium truncate text-gray-700 dark:text-gray-300">{c.name}</p>
          <p className="text-[10px] text-gray-500 truncate">{meta}</p>
        </div>
        {onRemove && (
          <button type="button" onClick={onRemove} aria-label={tr('Usuń załącznik {name}', { name: c.name })} title={tr('Usuń załącznik')}
            className="absolute -top-1.5 -right-1.5 p-1 bg-red-500 text-white rounded-full opacity-100 lg:opacity-0 lg:group-hover:opacity-100 focus-visible:opacity-100 transition shadow-sm">
            <X size={10} aria-hidden="true" />
          </button>
        )}
      </div>
    );
  }

  const body = (
    <>
      <span className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${variant === 'own' ? 'bg-white/90' : 'bg-white dark:bg-gray-800'}`}>
        <CloudProviderIcon provider={c.provider} size={22} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium truncate">{c.name}</span>
        <span className="block text-xs opacity-70 truncate">{meta}</span>
      </span>
      <span className="flex items-center gap-1 text-xs font-medium shrink-0 opacity-80">
        <span className="hidden sm:inline">{href ? open : tr('Nieprawidłowy adres')}</span>
        {href && <ExternalLink size={14} aria-hidden="true" />}
      </span>
    </>
  );
  const cls = `flex items-center gap-3 p-3 rounded-xl transition-all duration-200 ${tone} ${className}`;
  if (!href) return <div className={`${cls} opacity-60`} data-testid="cloud-link">{body}</div>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls} title={open} aria-label={`${c.name} — ${open}`} data-testid="cloud-link">
      {body}
    </a>
  );
}
