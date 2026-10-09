// Licencjonowanie Avenit = liczba DOROSŁYCH w bazie członków (wspólne dla API, panelu i web).
//
// Kto się liczy (definicja z cennika na avenit.pl):
//   • osoba z datą urodzenia → ma dziś ≥ 18 lat (strefa Europe/Warsaw),
//   • osoba bez daty urodzenia → liczy się jako dorosła, chyba że oznaczona jako dziecko/gość,
//   • NIE liczą się: goście, dzieci, osoby zarchiwizowane/nieaktywne/usunięte.
// Dzieci ze szkółki (kids_students itp.) to osobne tabele — nie są w `members`, więc i tak
// się nie liczą.
//
// Kolumny `members` różnią się między bazami (migracje w repo ≠ produkcja), dlatego predykat SQL
// budujemy z FAKTYCZNIE istniejących kolumn (information_schema) — adultsWhereSql(columns).
// isAdultMember() to lustro tej samej reguły w JS (testy, ewentualne liczenie po stronie klienta).
//
// planUsage({ adults, plan }) → stan względem limitu planu z 10% zapasem. Nic nie blokujemy:
// stany służą wyłącznie do komunikatów („plan zmienimy od kolejnego okresu”).

import { LIMIT_BUFFER_PCT } from './catalog.js';

export const ADULT_AGE = 18;
export const BILLING_TIMEZONE = 'Europe/Warsaw';

// Kolumny z datą urodzenia (pierwsza istniejąca wygrywa).
export const BIRTH_DATE_COLUMNS = ['birth_date', 'date_of_birth', 'birthdate', 'dob'];
// Kolumny statusu/typu osoby — wartości z EXCLUDED_STATUS_VALUES wykluczają osobę.
export const STATUS_COLUMNS = ['status', 'membership_status', 'member_status', 'member_type', 'person_type'];
// Flaga aktywności: FALSE → osoba nieaktywna (nie liczy się). NULL = aktywna.
export const ACTIVE_FLAG_COLUMNS = ['is_active'];
// Flagi wykluczające: TRUE → nie liczy się.
export const EXCLUDE_FLAG_COLUMNS = ['is_archived', 'archived', 'is_deleted', 'is_child', 'is_kid', 'is_guest'];
// Znaczniki czasu wykluczające: ustawione → nie liczy się.
export const EXCLUDE_WHEN_SET_COLUMNS = ['archived_at', 'deleted_at'];

// Wartości statusu (po lower+trim), które wykluczają: goście, dzieci, archiwum/nieaktywni.
export const GUEST_STATUSES = ['gość', 'gosc', 'goście', 'goscie', 'guest', 'guests', 'visitor', 'odwiedzający', 'odwiedzajacy'];
export const CHILD_STATUSES = ['dziecko', 'dzieci', 'child', 'children', 'kid', 'kids', 'minor', 'niepełnoletni', 'niepelnoletni'];
export const INACTIVE_STATUSES = [
  'archived', 'archive', 'archiwum', 'zarchiwizowany', 'zarchiwizowana', 'zarchiwizowani', 'archiwalny', 'archiwalna',
  'inactive', 'nieaktywny', 'nieaktywna', 'nieaktywni', 'former', 'były', 'była', 'byly', 'byla',
  'deleted', 'usunięty', 'usunięta', 'usuniety', 'usunieta', 'deceased', 'zmarły', 'zmarła', 'zmarly', 'zmarla',
];
export const EXCLUDED_STATUS_VALUES = [...GUEST_STATUSES, ...CHILD_STATUSES, ...INACTIVE_STATUSES];
const EXCLUDED_SET = new Set(EXCLUDED_STATUS_VALUES);

// Dzisiejsza data w strefie rozliczeń jako 'YYYY-MM-DD'.
export function billingToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BILLING_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// Normalizacja listy kolumn: ['a','b'] | [{column_name,data_type}] | [{name,type}] | { a: 'date' }
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

const qi = (name) => `"${String(name).replaceAll('"', '""')}"`;
const ql = (v) => `'${String(v).replaceAll("'", "''")}'`;
const isBoolType = (t) => t === '' || t === 'boolean' || t === 'bool';

// Wyrażenie SQL daty urodzenia odporne na typ kolumny (date / timestamp / tekst).
function birthExpr(col, type) {
  if (type === 'date') return qi(col);
  if (type.startsWith('timestamp')) return `(${qi(col)})::date`;
  // Tekst (lub typ nieznany): tylko wartości w formacie ISO, reszta = brak daty.
  return `(CASE WHEN ${qi(col)}::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN left(${qi(col)}::text, 10)::date END)`;
}

// Predykat WHERE „dorosły” dla tabeli members z podanymi kolumnami.
//   opts.today      — 'YYYY-MM-DD' (testy); domyślnie dzisiejsza data w Europe/Warsaw liczona w SQL
//                     (parametr dodawany tylko, gdy istnieje kolumna daty urodzenia)
//   opts.paramIndex — numer pierwszego parametru ($n), gdy predykat dokleja się do zapytania z parametrami
//   opts.skipBirthDate — pomiń warunek wieku (awaryjnie, gdy kolumna ma śmieci, których nie da się rzutować)
// Zwraca { sql, params, used } — used = kolumny, z których skorzystano (diagnostyka).
export function adultsWhereSql(columns, opts = {}) {
  const cols = normalizeColumns(columns);
  const params = [];
  const parts = [];
  const used = [];

  if (!opts.skipBirthDate) {
    const bcol = BIRTH_DATE_COLUMNS.find((c) => cols.has(c));
    if (bcol) {
      // Parametr daty tylko gdy faktycznie użyty (pg odrzuca nadmiarowe parametry).
      let todayExpr = `(now() AT TIME ZONE ${ql(BILLING_TIMEZONE)})::date`;
      if (opts.today) {
        params.push(String(opts.today));
        todayExpr = `$${(opts.paramIndex || 1)}::date`;
      }
      const b = birthExpr(bcol, cols.get(bcol));
      parts.push(`(${b} IS NULL OR ${b} <= (${todayExpr} - INTERVAL '${ADULT_AGE} years')::date)`);
      used.push(bcol);
    }
  }
  const excluded = EXCLUDED_STATUS_VALUES.map(ql).join(', ');
  for (const c of STATUS_COLUMNS) {
    if (!cols.has(c)) continue;
    parts.push(`lower(btrim(COALESCE(${qi(c)}::text, ''))) NOT IN (${excluded})`);
    used.push(c);
  }
  for (const c of ACTIVE_FLAG_COLUMNS) {
    if (!cols.has(c) || !isBoolType(cols.get(c))) continue;
    parts.push(`COALESCE(${qi(c)}, TRUE)`);
    used.push(c);
  }
  for (const c of EXCLUDE_FLAG_COLUMNS) {
    if (!cols.has(c) || !isBoolType(cols.get(c))) continue;
    parts.push(`NOT COALESCE(${qi(c)}, FALSE)`);
    used.push(c);
  }
  for (const c of EXCLUDE_WHEN_SET_COLUMNS) {
    if (!cols.has(c)) continue;
    parts.push(`${qi(c)} IS NULL`);
    used.push(c);
  }
  return { sql: parts.length ? parts.join(' AND ') : 'TRUE', params, used };
}

// Pełne zapytanie liczące dorosłych (tabela members).
export function countAdultsSql(columns, opts = {}) {
  const { sql, params, used } = adultsWhereSql(columns, opts);
  return { text: `SELECT count(*)::int AS n FROM members WHERE ${sql}`, params, used };
}

function isoDatePrefix(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : billingToday(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// Czy rekord członka jest dorosłym (lustro adultsWhereSql w JS).
export function isAdultMember(member, { today = billingToday() } = {}) {
  if (!member) return false;
  for (const c of STATUS_COLUMNS) {
    const v = member[c];
    if (v != null && EXCLUDED_SET.has(String(v).trim().toLowerCase())) return false;
  }
  for (const c of ACTIVE_FLAG_COLUMNS) if (member[c] === false) return false;
  for (const c of EXCLUDE_FLAG_COLUMNS) if (member[c] === true) return false;
  for (const c of EXCLUDE_WHEN_SET_COLUMNS) if (member[c] != null && member[c] !== '') return false;
  const bcol = BIRTH_DATE_COLUMNS.find((c) => c in member);
  const birth = bcol ? isoDatePrefix(member[bcol]) : null;
  if (!birth) return true;
  const [y, m, d] = today.split('-');
  const cutoff = `${String(Number(y) - ADULT_AGE).padStart(4, '0')}-${m}-${d}`;
  return birth <= cutoff;
}

export function countAdults(members, opts) {
  return (members || []).filter((m) => isAdultMember(m, opts)).length;
}

// ── Limity planu ──────────────────────────────────────────────────────

// Limit dorosłych planu (snake_case z bazy albo camelCase z katalogu). -1 / brak = bez limitu.
export function planAdultLimit(plan) {
  if (!plan) return -1;
  const raw = plan.max_members ?? plan.maxAdults ?? plan.limit;
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
export function planUsage({ adults, plan } = {}) {
  const n = Math.max(0, Number(adults) || 0);
  const limit = planAdultLimit(plan);
  if (limit < 0) return { adults: n, limit: -1, bufferLimit: null, pct: null, state: 'unlimited' };
  const buffer = planBufferPct(plan);
  const bufferLimit = Math.floor((limit * (100 + buffer)) / 100);
  const pct = Math.round((n * 100) / limit);
  let state = 'ok';
  if (n > bufferLimit) state = 'over_buffer';
  else if (n > limit) state = 'over';
  else if (n * 100 >= limit * 90) state = 'near';
  return { adults: n, limit, bufferLimit, pct, state };
}

const planKeyOf = (p) => p?.key || p?.slug || null;

// Najmniejszy publiczny, aktywny plan, w którego limicie mieszczą się dorośli; ponad największy
// limit → plan indywidualny (Sieć). Plany wycofane (is_active=false / is_public=false) pomijane.
export function suggestPlan(adults, plans) {
  const n = Math.max(0, Number(adults) || 0);
  const offered = (plans || [])
    .filter((p) => p && p.is_active !== false && p.is_public !== false && p.isActive !== false)
    .slice()
    .sort((a, b) => (a.sort_order ?? a.sortOrder ?? 0) - (b.sort_order ?? b.sortOrder ?? 0));
  const limited = offered
    .filter((p) => planAdultLimit(p) > 0 && !(p.is_custom ?? p.isCustom))
    .sort((a, b) => planAdultLimit(a) - planAdultLimit(b));
  const fit = limited.find((p) => n <= planAdultLimit(p));
  if (fit) return fit;
  const open = offered.find((p) => planAdultLimit(p) < 0 || (p.is_custom ?? p.isCustom));
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
