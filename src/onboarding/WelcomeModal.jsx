import React from 'react';
import { Sparkles, PlayCircle, Settings } from 'lucide-react';
import { useOnboarding } from './OnboardingContext';
import { useT } from '../i18n';
import Modal from '../components/Modal';
import Button from '../components/Button';

// Powitanie przy pierwszym logowaniu. Zależnie od roli proponuje kreatora konfiguracji
// (admin) lub od razu interaktywny samouczek (pozostali). Wzorowane na interstitialu 2FA.

export default function WelcomeModal() {
  const t = useT();
  const { welcomeOpen, closeWelcome, startTour, openWizard, isAdmin } = useOnboarding();

  if (!welcomeOpen) return null;

  const goWizard = () => { closeWelcome(); openWizard(); };
  const goTour = () => { closeWelcome(); startTour('welcome'); };

  return (
    <Modal
      isOpen={welcomeOpen}
      onClose={closeWelcome}
      closeOnBackdrop={false}
      zIndex={100055}
      size="sm"
      icon={Sparkles}
      title={t('Witaj w Avenit! 👋').replace(/\s*👋/u, '')}
    >
      <div className="p-6">
        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
          {isAdmin
            ? t('To Twój panel do zarządzania kościołem. Skonfigurujmy go w kilka minut, a potem pokażemy Ci najważniejsze funkcje.')
            : t('To Twój panel kościoła. Pokażemy Ci w minutę, jak się w nim odnaleźć i korzystać z najważniejszych funkcji.')}
        </p>

        <div className="mt-6 space-y-2.5">
          {isAdmin && (
            <Button icon={Settings} onClick={goWizard} className="w-full">
              {t('Skonfiguruj swój kościół')}
            </Button>
          )}
          <Button variant={isAdmin ? 'secondary' : 'primary'} icon={PlayCircle} onClick={goTour} className="w-full">
            {t('Rozpocznij samouczek')}
          </Button>
        </div>

        <div className="mt-4 text-center">
          <button onClick={closeWelcome} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition">
            {t('Pomiń — poznam panel samodzielnie')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
