import React from 'react';
import { GraduationCap, ChevronRight } from 'lucide-react';
import { useOnboarding } from './OnboardingContext';
import { TUTORIALS, TUTORIAL_CATEGORIES } from './config';
import { useT } from '../i18n';
import Modal from '../components/Modal';

// Biblioteka interaktywnych przewodników. Grupuje samouczki procesowe wg kategorii;
// kliknięcie odpala konkretny tour (startTour) prowadzący przez realny proces w apce.

export default function TutorialsLibrary() {
  const t = useT();
  const { tutorialsOpen, closeTutorials, startTour } = useOnboarding();

  if (!tutorialsOpen) return null;

  const launch = (id) => { closeTutorials(); startTour(id); };
  const cats = TUTORIAL_CATEGORIES.filter(c => TUTORIALS.some(x => x.category === c));

  return (
    <Modal
      isOpen={tutorialsOpen}
      onClose={closeTutorials}
      zIndex={100055}
      icon={GraduationCap}
      title={t('Samouczki krok po kroku')}
      subtitle={t('Wybierz proces, a przeprowadzę Cię przez niego w aplikacji.')}
    >
      {/* Lista przewodników wg kategorii */}
      <div className="p-6">
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
    </Modal>
  );
}
