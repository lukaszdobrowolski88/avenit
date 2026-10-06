import { appLocale } from '../../../i18n';
// Helpery modułu Dawania (Giving)

export function formatMoney(amount, currency = 'PLN') {
  const n = Number(amount) || 0;
  try {
    return new Intl.NumberFormat(appLocale(), { style: 'currency', currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

export const GIVING_METHODS = [
  { value: 'cash', label: 'Gotówka' },
  { value: 'transfer', label: 'Przelew' },
  { value: 'card', label: 'Karta' },
  { value: 'blik', label: 'BLIK' },
  { value: 'online', label: 'Online' },
  { value: 'przelewy24', label: 'Przelewy24' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'other', label: 'Inne' },
];

export const GIVING_FREQUENCIES = [
  { value: 'weekly', label: 'Co tydzień' },
  { value: 'biweekly', label: 'Co 2 tygodnie' },
  { value: 'monthly', label: 'Co miesiąc' },
  { value: 'quarterly', label: 'Co kwartał' },
  { value: 'yearly', label: 'Co rok' },
];

export const GIVING_STATUSES = [
  { value: 'completed', label: 'Zaksięgowane' },
  { value: 'pending', label: 'Oczekujące' },
  { value: 'failed', label: 'Nieudane' },
  { value: 'refunded', label: 'Zwrócone' },
];

export function methodLabel(v) {
  return (GIVING_METHODS.find(m => m.value === v) || {}).label || v || '—';
}
export function frequencyLabel(v) {
  return (GIVING_FREQUENCIES.find(m => m.value === v) || {}).label || v || '—';
}
export function statusLabel(v) {
  return (GIVING_STATUSES.find(m => m.value === v) || {}).label || v || '—';
}

export function memberName(m) {
  if (!m) return '';
  return `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.email || 'Członek';
}

// Nazwa darczyńcy do wyświetlenia
export function donorLabel(d, membersById) {
  if (!d) return '—';
  if (d.is_anonymous) return 'Anonimowo';
  if (d.member_id && membersById?.[d.member_id]) return memberName(membersById[d.member_id]);
  return d.donor_name || d.donor_email || '—';
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString(appLocale());
  } catch {
    return dateStr;
  }
}

// Data „YYYY-MM-DD” w czasie lokalnym (toISOString między 0:00 a 2:00 daje wczoraj).
export function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDay(s) {
  if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
}

// Oblicz następną datę pobrania dla planu cyklicznego
export function computeNextRun(frequency, from = new Date(), dayOfMonth = null) {
  const d = parseDay(from);
  switch (frequency) {
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'biweekly': d.setDate(d.getDate() + 14); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
    default: d.setMonth(d.getMonth() + 1);
  }
  if (dayOfMonth && ['monthly', 'quarterly', 'yearly'].includes(frequency)) {
    d.setDate(Math.min(dayOfMonth, 28));
  }
  return localDateStr(d);
}

// Termin następnej należności po edycji planu: przy niezmienionym harmonogramie zostaje
// dotychczasowy; po zmianie liczymy od początku planu, ale nigdy w przeszłość
// (data w przeszłości = worker od razu dopisałby dodatkową należną darowiznę).
export function nextRunAfterEdit(plan, form, today = localDateStr()) {
  const same = plan
    && (plan.frequency || 'monthly') === form.frequency
    && String(plan.day_of_month || '') === String(form.day_of_month || '')
    && (plan.start_date || '') === (form.start_date || '');
  if (same && plan.next_run_date) return plan.next_run_date;
  const dom = form.day_of_month ? Number(form.day_of_month) : null;
  let next = computeNextRun(form.frequency, form.start_date || today, dom);
  for (let i = 0; next < today && i < 600; i++) next = computeNextRun(form.frequency, next, dom);
  return next;
}

// ── Zbiórki (kampanie) ──────────────────────────────────────────────────────
// Jedna definicja „zebrano” (ta sama w CampaignsTab, campaign-progress i giving-campaigns):
// zaksięgowane darowizny przypisane do zbiórki, a bez przypisania — wpłaty na fundusz
// zbiórki w jej oknie dat.
export function donationCountsForCampaign(d, c) {
  if (!d || !c || d.status !== 'completed') return false;
  if (d.campaign_id) return String(d.campaign_id) === String(c.id);
  if (!c.fund_id || String(d.fund_id || '') !== String(c.fund_id)) return false;
  const day = String(d.donation_date || '').slice(0, 10);
  if (c.start_date && day < String(c.start_date).slice(0, 10)) return false;
  if (c.end_date && day > String(c.end_date).slice(0, 10)) return false;
  return true;
}
export function raisedForCampaign(c, donations) {
  return (donations || []).filter((d) => donationCountsForCampaign(d, c)).reduce((s, d) => s + (Number(d.amount) || 0), 0);
}

// ── Sumy darowizn wg statusu ───────────────────────────────────────────────
// „Suma” = tylko zaksięgowane; oczekujące pokazujemy osobno, nieudane/zwrócone pomijamy.
export function donationTotals(rows) {
  const t = { completed: 0, pending: 0, pendingCount: 0, completedCount: 0 };
  (rows || []).forEach((d) => {
    const a = Number(d.amount) || 0;
    if (d.status === 'completed') { t.completed += a; t.completedCount++; }
    else if (d.status === 'pending') { t.pending += a; t.pendingCount++; }
  });
  return t;
}

// ── Zestawienia PIT ────────────────────────────────────────────────────────
// Odliczyć można darowiznę pieniężną udokumentowaną dowodem wpłaty na rachunek
// (art. 26 ust. 7 ustawy o PIT) — gotówka idzie osobno, z adnotacją.
export const isCashDonation = (d) => d?.method === 'cash';
export function isFundDeductible(d, fundsById) {
  const fund = d?.fund_id ? fundsById?.[d.fund_id] : null;
  return !d?.fund_id || fund?.is_tax_deductible !== false;
}
export function splitForStatement(items, fundsById) {
  const deductible = [];
  const cash = [];
  (items || []).forEach((d) => {
    if (d.status && d.status !== 'completed') return;
    if (!isFundDeductible(d, fundsById)) return;
    (isCashDonation(d) ? cash : deductible).push(d);
  });
  const total = (arr) => arr.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  return { deductible, cash, deductibleTotal: total(deductible), cashTotal: total(cash) };
}
// Zestawienia robi się zwykle w styczniu–kwietniu za rok poprzedni.
export function defaultStatementYear(now = new Date()) {
  return now.getMonth() <= 3 ? now.getFullYear() - 1 : now.getFullYear();
}
