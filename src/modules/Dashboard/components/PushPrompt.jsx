import React, { useState } from 'react';
import { Bell, X } from 'lucide-react';
import { usePushNotifications } from '../../../hooks/usePushNotifications';
import Button from '../../../components/Button';
import { toast } from '../../../lib/toast';
import { tr } from '../../../i18n';

const DISMISS_KEY = 'avenit.pushPrompt.dismissed';

const readDismissed = () => {
  try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
};

// Zachęta do włączenia powiadomień w przeglądarce. Do 2026-10 dało się je włączyć tylko
// w „Mój profil”, więc prawie nikt ich nie miał (1 subskrypcja w kościele). Pokazujemy, gdy
// przeglądarka je obsługuje, osoba ich nie włączyła i nie zablokowała; da się zamknąć na stałe.
export default function PushPrompt({ userEmail }) {
  const { isSupported, isSubscribed, permission, loading, subscribe } = usePushNotifications(userEmail);
  const [dismissed, setDismissed] = useState(readDismissed);

  if (!userEmail || dismissed || loading || !isSupported || isSubscribed || permission === 'denied') return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* tylko na tę sesję */ }
    setDismissed(true);
  };
  const enable = async () => {
    const ok = await subscribe();
    if (ok) toast.success(tr('Powiadomienia włączone w tej przeglądarce'));
    else if (Notification.permission === 'denied') toast.error(tr('Powiadomienia zostały zablokowane w przeglądarce. Możesz je odblokować w ustawieniach strony.'));
  };

  return (
    <div className="mb-5 flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4" role="region" aria-label={tr('Powiadomienia')}>
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <span className="w-10 h-10 shrink-0 rounded-xl bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 text-accent-primary flex items-center justify-center">
          <Bell size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 dark:text-white">{tr('Włącz powiadomienia w tej przeglądarce')}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">{tr('Nowe wiadomości, zaproszenia do służby i przypomnienia dojdą nawet przy zamkniętej karcie.')}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button onClick={enable}>{tr('Włącz')}</Button>
        <button type="button" onClick={dismiss} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700" aria-label={tr('Nie teraz')} title={tr('Nie teraz')}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
