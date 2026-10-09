import React from 'react';
import { CreditCard } from 'lucide-react';
import { tr } from '../../i18n';
import BillingOverview from './BillingOverview';

// Moduł rozliczeń (samodzielny widok). Główne miejsce w aplikacji to Ustawienia → Subskrypcja,
// które renderuje ten sam BillingOverview. Cennik = liczba dorosłych w bazie członków; wszystkie
// moduły i bez limitu użytkowników w każdym planie — nic nie jest bramkowane planem.
export default function BillingModule() {
  return (
    <div className="min-h-full">
      <div className="px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <CreditCard size={22} className="text-accent-primary" aria-hidden="true" />
          {tr('Subskrypcja i płatności')}
        </h1>
      </div>
      <div className="px-6 pb-6">
        <BillingOverview />
      </div>
    </div>
  );
}
