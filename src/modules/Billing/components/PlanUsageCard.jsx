import React from 'react';
import { CreditCard } from 'lucide-react';
import { tr, appLocale } from '../../../i18n';
import { formatPLN, usageLabel, usageMessage } from '../billingView';

// Karta „Twój plan”: plan, cena (miesięcznie/rocznie), pasek „N z L dorosłych” i komunikat stanu.
const STATUS = {
  trialing: { text: 'Okres próbny', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  active: { text: 'Aktywna', cls: 'bg-gray-100 text-gray-700 dark:bg-gray-600/50 dark:text-gray-200' },
  past_due: { text: 'Zaległa płatność', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  suspended: { text: 'Zawieszona', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
};
const BAR = { ok: 'bg-accent-primary', near: 'bg-accent-primary', over: 'bg-amber-500', over_buffer: 'bg-red-500' };
const MSG = {
  neutral: 'text-gray-600 dark:text-gray-300',
  warn: 'text-amber-800 dark:text-amber-300',
  alert: 'text-red-700 dark:text-red-300',
};
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(appLocale(), { day: 'numeric', month: 'long', year: 'numeric' }) : '');

export default function PlanUsageCard({ data }) {
  const { plan, subscription: sub, usage, suggestedPlan, tenant } = data || {};
  const status = STATUS[sub?.status] || (tenant?.status === 'trial' ? STATUS.trialing : null);
  const yearly = sub?.billingCycle === 'yearly';
  const amount = sub?.price?.amount ?? (yearly ? plan?.priceYearly : plan?.priceMonthly);
  const limited = usage && usage.state !== 'unlimited' && usage.limit > 0;
  const width = limited ? Math.min(100, Math.round((usage.adults * 100) / usage.limit)) : 0;
  const msg = usageMessage(usage);
  const inTrial = sub?.status === 'trialing' || tenant?.status === 'trial';
  const trialEnd = inTrial ? (sub?.trialEndsAt || tenant?.trialEndsAt || null) : null;

  return (
    <section className="bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-2xl p-6 mb-5" aria-labelledby="billing-plan-h">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-accent-primary-lightest dark:bg-accent-primary-darkest/40 flex items-center justify-center text-accent-primary dark:text-accent-primary-light shrink-0">
          <CreditCard size={18} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 id="billing-plan-h" className="text-sm font-medium text-gray-500 dark:text-gray-400">{tr('Twój plan')}</h3>
          <div className="flex items-center gap-2.5 flex-wrap mt-0.5">
            <span className="text-2xl font-bold text-gray-900 dark:text-white">{plan?.name || '—'}</span>
            {status && <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${status.cls}`}>{tr(status.text)}</span>}
          </div>
          {plan && (
            <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              {amount != null
                ? (yearly ? tr('{price} / rok', { price: formatPLN(amount) }) : tr('{price} / mies.', { price: formatPLN(amount) }))
                : tr('Cena indywidualna')}
              <span className="text-gray-400 dark:text-gray-500"> · {yearly ? tr('Rozliczenie roczne') : tr('Rozliczenie miesięczne')}</span>
            </div>
          )}
          {plan?.retired && suggestedPlan && (
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
              {tr('Ten plan nie jest już w ofercie. Dla Waszej liczby dorosłych pasuje plan {plan}.', { plan: suggestedPlan.name })}
            </p>
          )}
        </div>
        {(trialEnd || sub?.currentPeriodEnd) && (
          <div className="text-right text-sm shrink-0">
            <div className="text-gray-400 dark:text-gray-500">{trialEnd ? tr('Okres próbny do') : tr('Okres do')}</div>
            <div className="font-medium text-gray-700 dark:text-gray-200">{fmtDate(trialEnd || sub.currentPeriodEnd)}</div>
          </div>
        )}
      </div>

      {usage && (
        <div>
          <div className="flex items-baseline justify-between gap-3 text-sm mb-1.5">
            <span className="text-gray-700 dark:text-gray-200 font-medium">{tr('Dorośli w bazie członków')}</span>
            <span className="tabular-nums text-gray-600 dark:text-gray-300">{usageLabel(usage)}</span>
          </div>
          {limited ? (
            <div
              className="h-2 rounded-full bg-gray-100 dark:bg-gray-600 overflow-hidden"
              role="meter" aria-valuemin={0} aria-valuemax={usage.limit} aria-valuenow={usage.adults}
              aria-label={tr('Dorośli w bazie członków')}
            >
              <div className={`h-full rounded-full transition-all ${BAR[usage.state] || BAR.ok}`} style={{ width: `${width}%` }} />
            </div>
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-500">{tr('Bez limitu dorosłych')}</p>
          )}
          {msg && <p className={`text-sm mt-3 ${MSG[msg.tone]}`}>{msg.text}</p>}
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
            {tr('Liczymy dorosłych w bazie członków. Dzieci, goście i osoby zarchiwizowane się nie liczą. Użytkowników i modułów jest bez limitu.')}
          </p>
        </div>
      )}
    </section>
  );
}
