// Cennik Avenit — jedno źródło prawdy po stronie kodu (lustro sekcji #cennik na avenit.pl).
//
// Płaci się za liczbę KONT UŻYTKOWNIKÓW w aplikacji (patrz accounts.js; do 2026-10 liczyliśmy
// dorosłych w bazie członków). Wszystkie moduły w każdym planie, osoby bez konta (dzieci, goście)
// w bazie członków bez limitu. Ceny BRUTTO (z VAT), w groszach. Rok = 10 × miesiąc
// („2 mies. gratis”). Sieć: cena „od”, wycena indywidualna (is_custom) — nigdy nie fakturujemy
// jej automatycznie po cenie katalogowej.
//
// Migracje platformy (db/platform/migrations/004_pricing_adults.sql + kolejne poprawki opisów)
// wpisują te same wartości do subscription_plans (limit → max_members); test pricing-pglite.test.js
// pilnuje, żeby się nie rozjechały.

export const LIMIT_BUFFER_PCT = 10; // zapas ponad limit kont (plan zmieniamy od kolejnego okresu)
export const TRIAL_DAYS = 14;
export const DEFAULT_PLAN_KEY = 'start';

export const PRICING_PLANS = [
  {
    key: 'start', name: 'Start', maxAccounts: 50, priceMonthly: 7900, priceYearly: 79000,
    tagline: 'Dla małej wspólnoty, która chce uporządkować niedzielę i ludzi.',
    prioritySupport: false, isCustom: false, sortOrder: 1,
  },
  {
    key: 'wspolnota', name: 'Wspólnota', maxAccounts: 150, priceMonthly: 15900, priceYearly: 159000,
    tagline: 'Dla kościoła z kilkoma służbami, grupami domowymi i szkółką.',
    prioritySupport: false, isCustom: false, sortOrder: 2,
  },
  {
    key: 'kosciol', name: 'Kościół', maxAccounts: 400, priceMonthly: 29900, priceYearly: 299000,
    tagline: 'Dla kościoła z wieloma zespołami, młodzieżówką i finansami służb.',
    prioritySupport: false, isCustom: false, sortOrder: 3,
  },
  {
    key: 'kosciol_plus', name: 'Kościół+', maxAccounts: 1000, priceMonthly: 49900, priceYearly: 499000,
    tagline: 'Dla dużego kościoła. Z priorytetowym wsparciem.',
    prioritySupport: true, isCustom: false, sortOrder: 4,
  },
  {
    key: 'siec', name: 'Sieć', maxAccounts: -1, priceMonthly: 89900, priceYearly: null,
    tagline: 'Wycena indywidualna: kampusy, wdrożenie dla wielu kościołów i priorytetowe wsparcie.',
    prioritySupport: true, isCustom: true, sortOrder: 5,
  },
];

// Plany sprzed cennika 2026-10 (5 planów) — ukryte (is_public=false, is_active=false). Istniejące
// subskrypcje na nich NIE są przepinane automatycznie (panel pokazuje „plan wycofany”).
export const RETIRED_PLAN_KEYS = ['starter', 'standard', 'professional', 'enterprise'];

export const PLAN_BY_KEY = Object.fromEntries(PRICING_PLANS.map((p) => [p.key, p]));
