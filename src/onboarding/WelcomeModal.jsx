import React from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, PlayCircle, Settings, X } from 'lucide-react';
import { useOnboarding } from './OnboardingContext';
import { useT } from '../i18n';

// Powitanie przy pierwszym logowaniu. Zależnie od roli proponuje kreatora konfiguracji
// (admin) lub od razu interaktywny samouczek (pozostali). Wzorowane na interstitialu 2FA.

export default function WelcomeModal() {
  const t = useT();
  const { welcomeOpen, closeWelcome, startTour, openWizard, isAdmin } = useOnboarding();

  if (!welcomeOpen) return null;

  const goWizard = () => { closeWelcome(); openWizard(); };
  const goTour = () => { closeWelcome(); startTour('welcome'); };

  return createPortal(
    <div className="fixed inset-0 z-[100055] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Tło ozdobne */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-accent-primary-light/20 rounded-full blur-3xl" />
        <div className="absolute bottom-[5%] -right-[5%] w-[35%] h-[35%] bg-accent-secondary-light/20 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-in zoom-in-95 duration-200">
        <button onClick={closeWelcome} className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition z-10" aria-label={t('Zamknij')}>
          <X size={18} />
        </button>

        <div className="p-8 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-accent-primary-light to-accent-secondary-light flex items-center justify-center shadow-lg mb-4">
            <Sparkles className="text-white" size={30} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('Witaj w Avenit! 👋')}</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 leading-relaxed">
            {isAdmin
              ? t('To Twój panel do zarządzania kościołem. Skonfigurujmy go w kilka minut, a potem pokażemy Ci najważniejsze funkcje.')
              : t('To Twój panel kościoła. Pokażemy Ci w minutę, jak się w nim odnaleźć i korzystać z najważniejszych funkcji.')}
          </p>

          <div className="mt-6 space-y-2.5">
            {isAdmin && (
              <button onClick={goWizard} className="w-full px-5 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-accent-primary-light to-accent-secondary-light hover:opacity-90 transition flex items-center justify-center gap-2">
                <Settings size={18} /> {t('Skonfiguruj swój kościół')}
              </button>
            )}
            <button
              onClick={goTour}
              className={`w-full px-5 py-3 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2 ${isAdmin
                ? 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600'
                : 'text-white bg-gradient-to-r from-accent-primary-light to-accent-secondary-light hover:opacity-90'}`}
            >
              <PlayCircle size={18} /> {t('Rozpocznij samouczek')}
            </button>
          </div>

          <button onClick={closeWelcome} className="mt-4 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition">
            {t('Pomiń — poznam panel samodzielnie')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
