// Model planów (cennik avenit.pl): liczymy dorosłych w bazie członków.
// Publiczne plany: start / wspolnota / kosciol / kosciol_plus / siec. Stare (starter, standard,
// professional, enterprise) są wycofane — tenanci na nich zostają, panel podpowiada nowy plan.

export const PUBLIC_PLAN_KEYS = ['start', 'wspolnota', 'kosciol', 'kosciol_plus', 'siec'];
export const LEGACY_PLAN_KEYS = ['starter', 'standard', 'professional', 'enterprise'];
export const DEFAULT_BUFFER_PCT = 10;

export const planKey = (p) => (p ? p.key || p.slug || '' : '');

export const isPublicPlan = (p) =>
  !!p && (PUBLIC_PLAN_KEYS.includes(planKey(p)) || (p.is_public !== false && !LEGACY_PLAN_KEYS.includes(planKey(p))));

// Wycofany = stary klucz albo niepubliczny i nieaktywny.
export const isRetiredPlan = (p) =>
  !!p && (LEGACY_PLAN_KEYS.includes(planKey(p)) || (p.is_public === false && p.is_active === false));

export const isCustomPlan = (p) => !!p && (p.is_custom === true || planKey(p) === 'siec');

export const isPrioritySupport = (p) => !!(p?.features && (p.features.priority_support === true || p.features.priority_support === 'true'));

export const bufferPct = (p) => (p?.limit_buffer_pct ?? DEFAULT_BUFFER_PCT);

// Grosze → "1 590 zł" (bez groszy, gdy kwota okrągła — tak jak na stronie).
export function formatZl(grosze, { from = false } = {}) {
  if (grosze == null || grosze === '') return '—';
  const zl = Number(grosze) / 100;
  const round = Math.abs(zl - Math.round(zl)) < 0.005;
  const s = zl.toLocaleString('pl-PL', { minimumFractionDigits: round ? 0 : 2, maximumFractionDigits: 2, useGrouping: true });
  return `${from ? 'od ' : ''}${s} zł`;
}

// Kwota wpisana w zł (z przecinkiem lub kropką) → grosze; '' → null.
export function zlToGrosze(v) {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
export const groszeToZl = (g) => (g == null ? '' : String(Number(g) / 100).replace('.', ','));

export const limitLabel = (n) => (n == null || n < 0 ? 'bez limitu' : `do ${n} dorosłych`);

// Sortowanie publicznych planów jak na stronie.
export function sortPlans(plans) {
  return [...plans].sort((a, b) => {
    const ia = PUBLIC_PLAN_KEYS.indexOf(planKey(a)), ib = PUBLIC_PLAN_KEYS.indexOf(planKey(b));
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
}

// Najmniejszy publiczny plan, którego limit mieści podaną liczbę dorosłych (fallback, gdy API
// nie zwróci suggestedPlan). Plan bez limitu (-1) łapie wszystko powyżej.
export function suggestPlan(plans, adults) {
  if (adults == null) return null;
  const pub = sortPlans(plans.filter((p) => isPublicPlan(p) && !isRetiredPlan(p) && p.is_active !== false));
  return pub.find((p) => p.max_members != null && p.max_members >= 0 && adults <= p.max_members)
    || pub.find((p) => p.max_members == null || p.max_members < 0)
    || null;
}

// Liczenie stanu po stronie klienta — tylko gdy endpoint /usage zwrócił adults bez state.
export function usageState({ adults, limit, buffer = DEFAULT_BUFFER_PCT }) {
  if (limit == null || limit < 0) return 'unlimited';
  const bufferLimit = Math.floor(limit * (1 + buffer / 100));
  if (adults > bufferLimit) return 'over_buffer';
  if (adults > limit) return 'over';
  if (adults >= limit * 0.9) return 'near';
  return 'ok';
}

// "Interesuje mnie plan Kościół+ (płatność roczna)." / "I am interested in the Start plan (annual billing)."
const PLAN_NAMES = ['Kościół+', 'Kościół', 'Wspólnota', 'Start', 'Sieć'];
export function parsePlanInterest(message) {
  if (!message) return null;
  const m = String(message);
  const pl = m.match(/Interesuje mnie plan\s+([^\n.(]+?)\s*(\(płatność roczna\))?\s*(?:[.\n]|$)/i);
  const en = m.match(/interested in the\s+([^\n.(]+?)\s+plan\s*(\(annual billing\))?/i);
  const hit = pl || en;
  if (!hit) return null;
  const raw = hit[1].trim();
  const name = PLAN_NAMES.find((n) => n.toLowerCase() === raw.toLowerCase()) || raw;
  return { name, yearly: !!hit[2] };
}

// Uzupełnia odpowiedź /usage o brakujące pola (stan, bufor) — odporne na częściowe API.
export function normalizeUsage(u, plan) {
  if (!u || u.adults == null || u.counted === false) return null;
  const limit = u.limit ?? plan?.max_members ?? null;
  const buffer = bufferPct(plan);
  const bufferLimit = u.bufferLimit ?? (limit == null || limit < 0 ? null : Math.floor(limit * (1 + buffer / 100)));
  return {
    ...u,
    limit,
    bufferLimit,
    state: u.state || usageState({ adults: u.adults, limit, buffer }),
    pct: u.pct ?? (limit > 0 ? Math.round((u.adults / limit) * 100) : null),
  };
}

export const isOverLimit = (u) => !!u && (u.state === 'over' || u.state === 'over_buffer');
