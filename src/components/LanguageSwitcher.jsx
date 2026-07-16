import React, { useState, useRef, useEffect } from 'react';
import { Globe, Check } from 'lucide-react';
import { useI18n } from '../i18n';
import { tr } from '../i18n';

// Kompaktowy przełącznik języka (globus + menu). Do navbara.
export default function LanguageSwitcher() {
  const { lang, setLang, languages } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const current = languages.find((l) => l.code === lang) || languages[0];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title={tr('Język / Language')}
        className="flex items-center gap-1.5 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
      >
        <Globe size={18} className="lg:w-5 lg:h-5" />
        <span className="text-xs font-bold uppercase hidden sm:inline">{current.code}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-44 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-1 z-50">
          {languages.map((l) => (
            <button
              key={l.code}
              onClick={() => { setLang(l.code); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition ${l.code === lang ? 'text-accent-primary dark:text-accent-primary-light font-medium' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              <span className="text-base">{l.flag}</span>
              <span className="flex-1">{l.label}</span>
              {l.code === lang && <Check size={15} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
