import React from 'react';

// Kanoniczny nagłówek modułu (styl Giving): chip-ikona (gradient) + tytuł + podtytuł + akcje.
// Jedno źródło prawdy dla wyglądu nagłówków w całej aplikacji.
//   <PageHeader icon={Gift} title={tr('Dawanie')} subtitle={tr('…')} actions={<button/>} />
export default function PageHeader({ icon: Icon, title, subtitle, actions, iconColor, className = '' }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg shrink-0 bg-gradient-to-br from-accent-primary to-accent-secondary"
        style={iconColor ? { background: iconColor } : undefined}
      >
        {Icon && <Icon className="text-white" size={24} />}
      </div>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{subtitle}</p>}
      </div>
      {actions && <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">{actions}</div>}
    </div>
  );
}
