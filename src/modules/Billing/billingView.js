// Logika widoku rozliczeń (czysta, testowalna): komunikaty o wykorzystaniu planu, ceny,
// klucz odrzucenia komunikatu. Cennik = liczba dorosłych w bazie członków; nic nie blokujemy.
import { tr, appLocale } from '../../i18n';

export function formatPLN(grosze, { whole = false } = {}) {
  if (grosze == null) return '—';
  const amount = Number(grosze) / 100;
  const fractional = !whole && Math.round(amount * 100) % 100 !== 0;
  return new Intl.NumberFormat(appLocale(), {
    style: 'currency', currency: 'PLN',
    minimumFractionDigits: fractional ? 2 : 0, maximumFractionDigits: fractional ? 2 : 0,
  }).format(amount);
}

// Tekst licznika: „42 z 50 dorosłych” / „1200 dorosłych” (plan bez limitu).
export function usageLabel(usage) {
  if (!usage) return '';
  if (usage.state === 'unlimited' || !(usage.limit > 0)) return tr('{n} dorosłych', { n: usage.adults });
  return tr('{n} z {limit} dorosłych', { n: usage.adults, limit: usage.limit });
}

// Komunikat pod paskiem wykorzystania (ekran Subskrypcja). null = brak komunikatu.
export function usageMessage(usage) {
  if (!usage) return null;
  switch (usage.state) {
    case 'near':
      return { tone: 'neutral', text: tr('Zbliżacie się do limitu planu. Gdy go przekroczycie, macie jeszcze 10% zapasu.') };
    case 'over':
      return { tone: 'warn', text: tr('Limit planu jest przekroczony, ale mieścicie się w 10% zapasie. Plan zmienimy od kolejnego okresu rozliczeniowego, nic nie jest blokowane.') };
    case 'over_buffer':
      return { tone: 'alert', text: tr('Liczba dorosłych przekracza limit planu i 10% zapas. Wybierzcie większy plan poniżej, zmienimy go od kolejnego okresu. Nikt nie zostanie zablokowany.') };
    default:
      return null;
  }
}

// Dyskretny komunikat w aplikacji (tylko dla osób z dostępem do rozliczeń) — tylko over/over_buffer.
export function noticeFor(data) {
  const u = data?.usage;
  if (!u || (u.state !== 'over' && u.state !== 'over_buffer')) return null;
  const plan = data?.plan?.name || '';
  const text = u.state === 'over'
    ? tr('Dorosłych w bazie jest więcej niż w planie {plan} ({n} z {limit}). Mieścicie się w zapasie, plan zmienimy od kolejnego okresu.', { plan, n: u.adults, limit: u.limit })
    : tr('Dorosłych w bazie jest wyraźnie więcej niż w planie {plan} ({n} z {limit}). Wybierzcie większy plan.', { plan, n: u.adults, limit: u.limit });
  return { state: u.state, text };
}

// Klucz odrzucenia: ten sam stan w tym samym miesiącu nie wraca po zamknięciu.
export function noticeDismissKey(notice, now = new Date()) {
  if (!notice) return null;
  return `avenit_plan_notice:${notice.state}:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Cena planu w wybranym cyklu: { main, sub } do karty planu.
export function planPriceLines(plan, cycle) {
  if (plan.isCustom) {
    return { main: tr('od {price}', { price: formatPLN(plan.priceMonthly, { whole: true }) }), unit: tr('/ mies.'), sub: null, numeric: false };
  }
  if (cycle === 'yearly' && plan.priceYearly) {
    return {
      main: formatPLN(plan.priceYearly, { whole: true }), unit: tr('/ rok'),
      sub: tr('{price} miesięcznie', { price: formatPLN(Math.round(plan.priceYearly / 12)) }), numeric: true,
    };
  }
  return { main: formatPLN(plan.priceMonthly, { whole: true }), unit: tr('/ mies.'), sub: null, numeric: true };
}
