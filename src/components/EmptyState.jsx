import React from 'react';

// Wspólny pusty stan — zamiast dziesiątek ad-hoc „Brak …". Ikona + tytuł + podtytuł + akcja.
//   <EmptyState icon={Inbox} title="Brak elementów" subtitle="Dodaj pierwszy" action={<Button/>} />
// compact — w widżetach, panelach bocznych i listach w oknach (mniej powietrza, mniejsza ikona).
export default function EmptyState({ icon: Icon, title, subtitle, action, compact = false, className = '' }) {
  return (
    <div className={`text-center ${compact ? 'py-8' : 'py-14'} px-4 ${className}`}>
      {/* Ikona w kółku; w motywie Avenit kółko w jasnej kurkumie (data-tone 1). */}
      {Icon && (
        <div data-tone={1} className={`${compact ? 'w-12 h-12 mb-3' : 'w-16 h-16 mb-4'} mx-auto rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center`}>
          <Icon size={compact ? 22 : 28} className="text-gray-400 dark:text-gray-500" />
        </div>
      )}
      {title && <p className={`text-gray-600 dark:text-gray-300 font-medium ${compact ? 'text-sm' : ''}`}>{title}</p>}
      {subtitle && <p className={`${compact ? 'text-xs' : 'text-sm'} text-gray-400 dark:text-gray-500 mt-1`}>{subtitle}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
