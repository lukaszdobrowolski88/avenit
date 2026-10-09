// Cennik Avenit — jedno źródło prawdy po stronie kodu (lustro sekcji #cennik na avenit.pl).
//
// Płaci się za liczbę DOROSŁYCH w bazie członków (patrz adults.js). Wszystkie moduły w każdym
// planie, bez limitu użytkowników. Ceny BRUTTO (z VAT), w groszach. Rok = 10 × miesiąc
// („2 mies. gratis”). Sieć: cena „od”, wycena indywidualna (is_custom) — nigdy nie fakturujemy
// jej automatycznie po cenie katalogowej.
//
// Migracja platformy (db/platform/migrations/004_pricing_adults.sql) wpisuje te same wartości do
// subscription_plans; test pricing-pglite.test.js pilnuje, żeby się nie rozjechały.

export const LIMIT_BUFFER_PCT = 10; // zapas ponad limit dorosłych (plan zmieniamy od kolejnego okresu)
export const TRIAL_DAYS = 14;
export const DEFAULT_PLAN_KEY = 'start';

export const PRICING_PLANS = [
  {
    key: 'start', name: 'Start', maxAdults: 50, priceMonthly: 7900, priceYearly: 79000,
    tagline: 'Dla małego zboru, który chce uporządkować niedzielę i ludzi.',
    prioritySupport: false, isCustom: false, sortOrder: 1,
  },
  {
    key: 'wspolnota', name: 'Wspólnota', maxAdults: 150, priceMonthly: 15900, priceYearly: 159000,
    tagline: 'Dla zboru z kilkoma służbami, grupami domowymi i szkółką.',
    prioritySupport: false, isCustom: false, sortOrder: 2,
  },
  {
    key: 'kosciol', name: 'Kościół', maxAdults: 400, priceMonthly: 29900, priceYearly: 299000,
    tagline: 'Dla kościoła z wieloma zespołami, młodzieżówką i finansami służb.',
    prioritySupport: false, isCustom: false, sortOrder: 3,
  },
  {
    key: 'kosciol_plus', name: 'Kościół+', maxAdults: 1000, priceMonthly: 49900, priceYearly: 499000,
    tagline: 'Dla dużego kościoła. Z priorytetowym wsparciem.',
    prioritySupport: true, isCustom: false, sortOrder: 4,
  },
  {
    key: 'siec', name: 'Sieć', maxAdults: -1, priceMonthly: 89900, priceYearly: null,
    tagline: 'Wycena indywidualna: kampusy, wdrożenie dla wielu zborów i priorytetowe wsparcie.',
    prioritySupport: true, isCustom: true, sortOrder: 5,
  },
];

// Plany sprzed cennika „za dorosłych” — ukryte (is_public=false, is_active=false). Istniejące
// subskrypcje na nich NIE są przepinane automatycznie (panel pokazuje „plan wycofany”).
export const RETIRED_PLAN_KEYS = ['starter', 'standard', 'professional', 'enterprise'];

export const PLAN_BY_KEY = Object.fromEntries(PRICING_PLANS.map((p) => [p.key, p]));
