// Licencjonowanie Avenit = liczba KONT UŻYTKOWNIKÓW w aplikacji (tabela app_users tenanta).
// Wspólne dla API, panelu admina i web. Decyzja właściciela (2026-10): „limity w planach mają być
// limitami użytkowników, którzy mają założone konta, a nie członków dorosłych”.
//
// Kto się liczy (konto „rozliczane”):
//   • konto ze statusem 'active' (brak kolumny status / NULL = aktywne — stare bazy),
//   • i NIE wyłączone (is_active ≠ FALSE).
// Nie liczą się:
//   • oczekujące ('pending' — rejestracja przed potwierdzeniem e-maila lub zgodą administratora);
//     pokazujemy je osobno („oczekujące: N”), bo po zatwierdzeniu wejdą do licznika,
//   • zablokowane / wyłączone ('blocked' albo is_active = FALSE) i każdy inny status.
// Kont technicznych w app_users nie ma: wejście z panelu admina (impersonacja) używa istniejącego
// konta administratora kościoła, a superadmin kościoła to zwykła osoba — liczy się jak każde konto.
// Osoby w bazie członków BEZ konta (dzieci, goście, sympatycy) w ogóle nie wchodzą do limitu.
//
// Kolumny app_users różnią się między bazami (migracje w repo ≠ produkcja), dlatego zapytanie
// budujemy z FAKTYCZNIE istniejących kolumn (information_schema) — accountsCountSql(columns).
// accountState() to lustro tej samej reguły w JS (testy, liczenie po stronie klienta).
//
// planUsage({ accounts, plan }) → stan względem limitu planu z 10% zapasem. Nic nie blokujemy:
// stany służą wyłącznie do komunikatów („plan zmienimy od kolejnego okresu”).
//
// Limit planu trzymamy w subscription_plans.max_members (historyczna nazwa kolumny — od 2026-10
// oznacza limit KONT UŻYTKOWNIKÓW; max_users zostaje -1 i nie jest używane).

import { LIMIT_BUFFER_PCT } from './catalog.js';

export const BILLING_TIMEZONE = 'Europe/Warsaw';

// Statusy konta (app_users.status, migracja tenanta 027).
export const ACCOUNT_ACTIVE = 'active';
export const ACCOUNT_PENDING = 'pending';
export const ACCOUNT_BLOCKED = 'blocked';

// Dzisiejsza data w strefie rozliczeń jako 'YYYY-MM-DD'.
export function billingToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BILLING_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// Normalizacja listy kolumn: ['a','b'] | [{column_name,data_type}] | [{name,type}] | { a: 'text' }
// → Map(nazwa → typ lowercase, '' gdy nieznany).
export function normalizeColumns(columns) {
  const out = new Map();
  if (!columns) return out;
  if (columns instanceof Map) {
    for (const [k, v] of columns) out.set(String(k).toLowerCase(), String(v || '').toLowerCase());
    return out;
  }
  if (Array.isArray(columns)) {
    for (const c of columns) {
      if (typeof c === 'string') out.set(c.toLowerCase(), '');
      else if (c) out.set(String(c.column_name ?? c.name).toLowerCase(), String(c.data_type ?? c.type ?? '').toLowerCase());
    }
    return out;
  }
  for (const [k, v] of Object.entries(columns)) out.set(k.toLowerCase(), String(v || '').toLowerCase());
  return out;
}

const isBoolType = (t) => t === '' || t === 'boolean' || t === 'bool';

// Wyrażenia SQL (dla tabeli app_users z podanymi kolumnami):
//   active  — konto rozliczane,
//   pending — oczekujące (rejestracja / zgoda administratora).
// Zwraca { active, pending, used } — used = kolumny, z których skorzystano (diagnostyka).
export function accountPredicates(columns) {
  const cols = normalizeColumns(columns);
  const used = [];
  const parts = [];
  let pending = 'FALSE';
  if (cols.has('status')) {
    const st = `lower(btrim(COALESCE("status"::text, '${ACCOUNT_ACTIVE}')))`;
    parts.push(`${st} = '${ACCOUNT_ACTIVE}'`);
    pending = `${st} = '${ACCOUNT_PENDING}'`;
    used.push('status');
  }
  if (cols.has('is_active') && isBoolType(cols.get('is_active'))) {
    parts.push('COALESCE("is_active", TRUE)');
    used.push('is_active');
  }
  return { active: parts.length ? parts.join(' AND ') : 'TRUE', pending, used };
}

// Jedno zapytanie: konta rozliczane, oczekujące i wszystkie (zablokowane = total − accounts − pending).
export function accountsCountSql(columns) {
  const { active, pending, used } = accountPredicates(columns);
  return {
    text: `SELECT count(*) FILTER (WHERE ${active})::int AS accounts, `
      + `count(*) FILTER (WHERE ${pending})::int AS pending, `
      + 'count(*)::int AS total FROM app_users',
    used,
  };
}

// Stan konta (lustro accountPredicates w JS): 'active' | 'pending' | 'blocked'.
export function accountState(user) {
  if (!user) return ACCOUNT_BLOCKED;
  const st = user.status == null ? ACCOUNT_ACTIVE : String(user.status).trim().toLowerCase();
  if (st === ACCOUNT_PENDING) return ACCOUNT_PENDING;
  if (st !== ACCOUNT_ACTIVE) return ACCOUNT_BLOCKED;
  if (user.is_active === false) return ACCOUNT_BLOCKED;
  return ACCOUNT_ACTIVE;
}

export const isBillableAccount = (user) => accountState(user) === ACCOUNT_ACTIVE;

// Podsumowanie listy kont: { accounts, pending, blocked, total }.
export function countAccounts(users) {
  const out = { accounts: 0, pending: 0, blocked: 0, total: 0 };
  for (const u of users || []) {
    const s = accountState(u);
    out.total++;
    if (s === ACCOUNT_ACTIVE) out.accounts++;
    else if (s === ACCOUNT_PENDING) out.pending++;
    else out.blocked++;
  }
  return out;
}

// ── Limity planu ──────────────────────────────────────────────────────

// Limit kont planu (snake_case z bazy albo camelCase z katalogu). -1 / brak = bez limitu.
export function planAccountLimit(plan) {
  if (!plan) return -1;
  const raw = plan.max_members ?? plan.maxAccounts ?? plan.limit;
  const n = raw == null ? -1 : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : -1;
}

export function planBufferPct(plan) {
  const raw = plan?.limit_buffer_pct ?? plan?.limitBufferPct;
  const n = raw == null ? LIMIT_BUFFER_PCT : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : LIMIT_BUFFER_PCT;
}

// Stan wykorzystania planu:
//   ok          — poniżej 90% limitu
//   near        — ≥ 90% limitu (i nie ponad limit)
//   over        — ponad limit, ale w 10% zapasie („plan zmienimy od kolejnego okresu”)
//   over_buffer — ponad limit + zapas (trzeba zmienić plan)
//   unlimited   — plan bez limitu (Sieć / indywidualny) albo brak planu
// limit = -1 dla planu bez limitu (bufferLimit i pct = null).
export function planUsage({ accounts, plan } = {}) {
  const n = Math.max(0, Number(accounts) || 0);
  const limit = planAccountLimit(plan);
  if (limit < 0) return { accounts: n, limit: -1, bufferLimit: null, pct: null, state: 'unlimited' };
  const buffer = planBufferPct(plan);
  const bufferLimit = Math.floor((limit * (100 + buffer)) / 100);
  const pct = Math.round((n * 100) / limit);
  let state = 'ok';
  if (n > bufferLimit) state = 'over_buffer';
  else if (n > limit) state = 'over';
  else if (n * 100 >= limit * 90) state = 'near';
  return { accounts: n, limit, bufferLimit, pct, state };
}

const planKeyOf = (p) => p?.key || p?.slug || null;

// Najmniejszy publiczny, aktywny plan, w którego limicie mieszczą się konta; ponad największy
// limit → plan indywidualny (Sieć). Plany wycofane (is_active=false / is_public=false) pomijane.
export function suggestPlan(accounts, plans) {
  const n = Math.max(0, Number(accounts) || 0);
  const offered = (plans || [])
    .filter((p) => p && p.is_active !== false && p.is_public !== false && p.isActive !== false)
    .slice()
    .sort((a, b) => (a.sort_order ?? a.sortOrder ?? 0) - (b.sort_order ?? b.sortOrder ?? 0));
  const limited = offered
    .filter((p) => planAccountLimit(p) > 0 && !(p.is_custom ?? p.isCustom))
    .sort((a, b) => planAccountLimit(a) - planAccountLimit(b));
  const fit = limited.find((p) => n <= planAccountLimit(p));
  if (fit) return fit;
  const open = offered.find((p) => planAccountLimit(p) < 0 || (p.is_custom ?? p.isCustom));
  return open || limited[limited.length - 1] || null;
}

export const planRef = (p) => (p ? { key: planKeyOf(p), name: p.name } : null);

// ── Ceny (brutto) ─────────────────────────────────────────────────────

// Kwota do zafakturowania za okres (grosze, BRUTTO). Cena indywidualna subskrypcji ma pierwszeństwo.
// Plan indywidualny (is_custom) bez ceny indywidualnej → amount=null, source='custom_required'
// (nigdy nie fakturujemy Sieci po cenie katalogowej „od”).
export function subscriptionPrice({ plan, billingCycle = 'monthly', customPriceMonthly = null, customPriceYearly = null } = {}) {
  const yearly = billingCycle === 'yearly';
  const custom = yearly ? customPriceYearly : customPriceMonthly;
  if (custom != null && Number(custom) > 0) return { amount: Math.round(Number(custom)), source: 'custom', cycle: yearly ? 'yearly' : 'monthly' };
  if (!plan) return { amount: null, source: 'missing', cycle: yearly ? 'yearly' : 'monthly' };
  if (plan.is_custom ?? plan.isCustom) return { amount: null, source: 'custom_required', cycle: yearly ? 'yearly' : 'monthly' };
  const list = yearly ? (plan.price_yearly ?? plan.priceYearly) : (plan.price_monthly ?? plan.priceMonthly);
  if (list == null) return { amount: null, source: 'missing', cycle: yearly ? 'yearly' : 'monthly' };
  return { amount: Math.round(Number(list)), source: 'list', cycle: yearly ? 'yearly' : 'monthly' };
}

// Rozbicie kwoty BRUTTO na netto + VAT (grosze). Ceny Avenit są brutto — VAT jest W cenie.
export function splitGross(total, vatRate = 23) {
  const t = Math.round(Number(total) || 0);
  const subtotal = Math.round((t * 100) / (100 + Number(vatRate)));
  return { subtotal, taxAmount: t - subtotal, total: t, taxRate: Number(vatRate) };
}
