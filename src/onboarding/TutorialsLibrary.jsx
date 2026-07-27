import React from 'react';
import { createPortal } from 'react-dom';
import { X, GraduationCap, ChevronRight } from 'lucide-react';
import { useOnboarding } from './OnboardingContext';
import { TUTORIALS, TUTORIAL_CATEGORIES } from './config';
import { useT } from '../i18n';

// Biblioteka interaktywnych przewodników. Grupuje samouczki procesowe wg kategorii;
// kliknięcie odpala konkretny tour (startTour) prowadzący przez realny proces w apce.

export default function TutorialsLibrary() {
  const t = useT();
  const { tutorialsOpen, closeTutorials, startTour } = useOnboarding();

  if (!tutorialsOpen) return null;

  const launch = (id) => { closeTutorials(); startTour(id); };
  const cats = TUTORIAL_CATEGORIES.filter(c => TUTORIALS.some(x => x.category === c));

  return createPortal(
    <div className="fixed inset-0 z-[100055] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={closeTutorials}>
      <div
        className="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-in zoom-in-95 duration-200 max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Nagłówek */}
        <div className="p-5 bg-gradient-to-r from-accent-primary-light to-accent-secondary-light text-white flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <GraduationCap size={22} />
            <div>
              <h2 className="font-bold text-base leading-tight">{t('Samouczki krok po kroku')}</h2>
              <p className="text-xs text-white/90 mt-0.5">{t('Wybierz proces, a przeprowadzę Cię przez niego w aplikacji.')}</p>
            </div>
          </div>
          <button onClick={closeTutorials} className="p-1.5 rounded-lg hover:bg-white/20 transition" aria-label={t('Zamknij')}>
            <X size={18} />
          </button>
        </div>

        {/* Lista przewodników wg kategorii */}
        <div className="p-4 overflow-y-auto custom-scrollbar">
          {cats.map(cat => (
            <div key={cat} className="mb-4 last:mb-0">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 px-1 mb-1.5">{t(cat)}</h3>
              <div className="space-y-1.5">
                {TUTORIALS.filter(x => x.category === cat).map(tut => {
                  const Icon = tut.icon;
                  return (
                    <button
                      key={tut.id}
                      onClick={() => launch(tut.id)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-700 hover:border-accent-primary-light dark:hover:border-accent-primary hover:bg-accent-primary-lightest/40 dark:hover:bg-gray-700/40 transition text-left group"
                    >
                      <span className="shrink-0 w-10 h-10 rounded-xl bg-accent-primary-lightest dark:bg-accent-primary-darkest/40 flex items-center justify-center text-accent-primary dark:text-accent-primary-light">
                        {Icon ? <Icon size={19} /> : <GraduationCap size={19} />}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-gray-900 dark:text-white">{t(tut.title)}</span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400">{t(tut.desc)}</span>
                      </span>
                      <ChevronRight size={18} className="shrink-0 text-gray-300 dark:text-gray-600 group-hover:text-accent-primary transition" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
