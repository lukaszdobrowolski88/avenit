import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Compass, Home, Search } from 'lucide-react';
import { openCommandPalette } from './CommandPalette';
import { tr } from '../i18n';

// Strona „Nie znaleziono” (UXE-22) — zamiast cichego przekierowania na Pulpit mówimy, co się
// stało, i dajemy dwie drogi dalej: Pulpit albo wyszukiwarkę ⌘K.
export default function NotFound() {
  const { pathname } = useLocation();
  return (
    <div className="max-w-lg mx-auto text-center py-16 px-4">
      <div className="mx-auto mb-5 w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 dark:text-gray-400">
        <Compass size={28} aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{tr('Nie znaleziono strony')}</h1>
      <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
        {tr('Pod adresem {path} nic nie ma. Link mógł się zdezaktualizować albo moduł został wyłączony lub przemianowany.', { path: pathname })}
      </p>
      <div className="mt-7 flex flex-col sm:flex-row gap-2 justify-center">
        <Link
          to="/"
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-accent-primary to-accent-secondary text-white shadow-md hover:shadow-lg transition"
        >
          <Home size={16} aria-hidden="true" /> {tr('Wróć do pulpitu')}
        </Link>
        <button
          type="button"
          onClick={openCommandPalette}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition"
        >
          <Search size={16} aria-hidden="true" /> {tr('Wyszukaj w aplikacji')}
        </button>
      </div>
    </div>
  );
}
