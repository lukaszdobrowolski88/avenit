import React from 'react';

// Wspólny pusty stan — zamiast dziesiątek ad-hoc „Brak …". Ikona + tytuł + podtytuł + akcja.
//   <EmptyState icon={Inbox} title="Brak elementów" subtitle="Dodaj pierwszy" action={<Button/>} />
export default function EmptyState({ icon: Icon, title, subtitle, action, className = '' }) {
  return (
    <div className={`text-center py-14 px-4 ${className}`}>
      {Icon && <Icon size={44} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />}
      {title && <p className="text-gray-600 dark:text-gray-300 font-medium">{title}</p>}
      {subtitle && <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">{subtitle}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
