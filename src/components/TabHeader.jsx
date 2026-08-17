import React from 'react';

// Kanoniczny nagłówek zakładki modułu (sekcji): tytuł + opcjonalny podtytuł + akcje.
// Jedno źródło prawdy, by WSZYSTKIE zakładki (Wydarzenia/Grafik/Członkowie/Finanse/
// Służby/Wyposażenie/Pliki…) wyglądały identycznie — ten sam rozmiar, waga, układ.
//   <TabHeader title="Wyposażenie" subtitle="Łącznie: 3" actions={<button>Dodaj</button>} />
export default function TabHeader({ title, subtitle, actions, className = '' }) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6 ${className}`}>
      <div className="min-w-0">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white truncate">{title}</h2>
        {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap sm:justify-end shrink-0">{actions}</div>}
    </div>
  );
}
