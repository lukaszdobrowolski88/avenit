import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { tr } from '../../../i18n';
import Button from '../../../components/Button';
import { toast } from '../../../lib/toast';
import { confirmDialog } from '../../../lib/dialog';
import { requestPlanChange } from '../../../lib/subscriptions';
import { planPriceLines } from '../billingView';
import '../../../components/toolbar.css';

// Wybór planu — 5 planów z cennika avenit.pl, przełącznik miesięcznie/rocznie („2 mies. gratis”).
// Wybór wysyła prośbę do zespołu Avenit (plan zmieniamy od kolejnego okresu); Sieć → „Porozmawiajmy”.
const INCLUDED = [
  'Wszystkie moduły, bez dopłat za kolejne',
  'Bez limitu użytkowników: loguje się cały zbór',
  'Aplikacja na iPhone\'a i Androida oraz wersja w przeglądarce',
  'Po polsku, angielsku i ukraińsku',
  'Dane w UE, osobna baza i kopia co noc',
  'Role i uprawnienia, logowanie dwuskładnikowe',
  '0% prowizji Avenit od darowizn i wpłat online',
  'Wsparcie e-mail po polsku',
];

export default function PlanPicker({ plans = [], currentKey, currentCycle = 'monthly', suggestedKey, onRequested }) {
  const [cycle, setCycle] = useState(currentCycle === 'yearly' ? 'yearly' : 'monthly');

  const choose = async (plan) => {
    const custom = plan.isCustom;
    const ok = await confirmDialog({
      title: custom ? tr('Porozmawiajmy o planie {plan}', { plan: plan.name }) : tr('Zmiana planu na {plan}', { plan: plan.name }),
      message: custom
        ? tr('Wyślemy zespołowi Avenit prośbę o kontakt w sprawie wyceny.')
        : tr('Wyślemy zespołowi Avenit prośbę o zmianę planu ({cycle}). Plan zmienimy od kolejnego okresu rozliczeniowego.', {
          cycle: cycle === 'yearly' ? tr('rocznie') : tr('miesięcznie'),
        }),
      confirmLabel: tr('Wyślij prośbę'),
      danger: false,
    });
    if (!ok) return;
    try {
      await requestPlanChange({ planKey: plan.key, billingCycle: custom ? 'monthly' : cycle });
      toast.success(tr('Prośba wysłana. Odezwiemy się wkrótce.'));
      onRequested?.(plan);
    } catch (err) {
      toast.error(err.message || tr('Nie udało się wysłać prośby'));
    }
  };

  const regular = plans.filter((p) => !p.isCustom);
  const custom = plans.filter((p) => p.isCustom);
  const topLimit = Math.max(1000, ...regular.map((p) => Number(p.maxAdults) || 0));

  return (
    <section className="bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-2xl p-6 mb-5" aria-labelledby="billing-plans-h">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h3 id="billing-plans-h" className="font-bold text-gray-800 dark:text-white">{tr('Plany')}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{tr('Płacicie za wielkość zboru, nie za moduły. Ceny brutto (z VAT).')}</p>
        </div>
        <div className="seg-bar" role="group" aria-label={tr('Okres rozliczenia')}>
          <button type="button" className="seg-btn" aria-pressed={cycle === 'monthly'} onClick={() => setCycle('monthly')}>{tr('Miesięcznie')}</button>
          <button type="button" className="seg-btn" aria-pressed={cycle === 'yearly'} onClick={() => setCycle('yearly')}>
            {tr('Rocznie')}
            <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-accent-primary-lightest text-accent-primary-darkest dark:bg-accent-primary/20 dark:text-accent-primary-light">{tr('2 mies. gratis')}</span>
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {regular.map((p) => {
          const price = planPriceLines(p, cycle);
          const current = p.key === currentKey;
          const suggested = !current && p.key === suggestedKey;
          return (
            <div
              key={p.key}
              className={`flex flex-col rounded-2xl border p-4 ${current
                ? 'border-gray-400 dark:border-gray-400 bg-gray-50 dark:bg-gray-700'
                : 'border-gray-200 dark:border-gray-600'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-bold text-gray-900 dark:text-white">{p.name}</h4>
                {current && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-100">{tr('Obecny plan')}</span>}
                {suggested && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-accent-primary-lightest text-accent-primary-darkest dark:bg-accent-primary/20 dark:text-accent-primary-light">{tr('Pasuje do Was')}</span>}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{tr('do {n} dorosłych', { n: p.maxAdults })}</p>
              <p className="mt-3 flex items-baseline gap-1">
                <span className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{price.main}</span>
                <span className="text-sm text-gray-500 dark:text-gray-400">{price.unit}</span>
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 min-h-[1rem]">{price.sub || ''}</p>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 flex-1">{p.description}</p>
              <Button
                variant={current ? 'outline' : 'secondary'} size="sm" className="mt-4 w-full"
                disabled={current && currentCycle === cycle}
                onClick={() => choose(p)}
              >
                {current && currentCycle === cycle ? tr('Twój plan') : tr('Wybierz {plan}', { plan: p.name })}
              </Button>
            </div>
          );
        })}
      </div>

      {custom.map((p) => {
        const price = planPriceLines(p, cycle);
        const current = p.key === currentKey;
        return (
          <div key={p.key} className={`mt-3 rounded-2xl border p-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-6 ${current ? 'border-gray-400 bg-gray-50 dark:bg-gray-700' : 'border-gray-200 dark:border-gray-600'}`}>
            <div className="md:w-56 shrink-0">
              <h4 className="font-bold text-gray-900 dark:text-white">{p.name}</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">{tr('powyżej {n} dorosłych, wiele lokalizacji, denominacje', { n: topLimit })}</p>
            </div>
            <p className="flex items-baseline gap-1 shrink-0">
              <span className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">{price.main}</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">{price.unit}</span>
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-300 flex-1">{p.description}</p>
            <Button variant="secondary" size="sm" className="shrink-0" onClick={() => choose(p)}>{tr('Porozmawiajmy')}</Button>
          </div>
        );
      })}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div>
          <h4 className="text-sm font-bold text-gray-800 dark:text-white mb-2">{tr('W każdym planie')}</h4>
          <ul className="space-y-1.5">
            {INCLUDED.map((line) => (
              <li key={line} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                <Check size={15} className="mt-0.5 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                <span>{tr(line)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
          <p><span className="font-semibold text-gray-800 dark:text-white">{tr('Zbór urośnie?')}</span> {tr('Macie 10% zapasu ponad limit. Plan zmieniamy od kolejnego okresu, nikt nie zostanie zablokowany w niedzielę rano.')}</p>
          <p><span className="font-semibold text-gray-800 dark:text-white">{tr('SMS-y osobno.')}</span> {tr('Własne konto SMSAPI albo pakiet. Push i e-mail są w cenie.')}</p>
          <p><span className="font-semibold text-gray-800 dark:text-white">{tr('Płatność roczna')}</span> {tr('to 2 miesiące gratis i przeniesienie danych członków bez dodatkowej opłaty.')}</p>
        </div>
      </div>
    </section>
  );
}
