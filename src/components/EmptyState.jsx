import React from 'react';

// Wspólny pusty stan — zamiast dziesiątek ad-hoc „Brak …". Ikona + tytuł + podtytuł + akcja.
//   <EmptyState icon={Inbox} title="Brak elementów" subtitle="Dodaj pierwszy" action={<Button/>} />
export default function EmptyState({ icon: Icon, title, subtitle, action, className = '' }) {
  return (
    <div className={`text-center py-14 px-4 ${className}`}>
      {/* Ikona w kółku; w motywie Avenit kółko w jasnej kurkumie (data-tone 1). */}
      {Icon && (
        <div data-tone={1} className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          <Icon size={28} className="text-gray-400 dark:text-gray-500" />
        </div>
      )}
      {title && <p className="text-gray-600 dark:text-gray-300 font-medium">{title}</p>}
      {subtitle && <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">{subtitle}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
