// Wspólne helpery Finansów: kwoty odporne na tekst z API, statusy wliczane do sum,
// dopasowanie wydatku do pozycji budżetu, formaty liczb/dat wg języka aplikacji.
import { appLocale } from '../../i18n';

// Kwota z bazy bywa liczbą, tekstem („2000.00”) albo null — zawsze liczba.
export const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const sumBy = (rows, field = 'amount') => (rows || []).reduce((s, r) => s + num(r?.[field]), 0);

// Do sum (realizacja, bilans, raporty) wchodzą tylko wydatki zatwierdzone i opłacone.
// Brak statusu = stare wpisy sprzed akceptacji (traktowane jak zatwierdzone).
// Szkice, wnioski czekające na decyzję i odrzucone pokazujemy osobno.
const COUNTED_EXPENSE = new Set(['approved', 'paid']);
export const isCountedExpense = (e) => !e?.status || COUNTED_EXPENSE.has(e.status);
export const isPendingExpense = (e) => e?.status === 'submitted' || e?.status === 'draft';

// Porównanie tekstów niewrażliwe na wielkość liter i nadmiarowe spacje
// (literówka w spacji nie odpina już wydatku od pozycji budżetu).
export const normKey = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export const matchesBudgetItem = (expense, item) =>
  !!expense && !!item
  && normKey(expense.category) === normKey(item.category)
  && normKey(expense.description) === normKey(item.description);

// Realizacja pozycji budżetu = suma WLICZANYCH wydatków przypisanych do pozycji.
export const realizationFor = (item, expenses) =>
  (expenses || []).filter((e) => isCountedExpense(e) && matchesBudgetItem(e, item)).reduce((s, e) => s + num(e.amount), 0);

// Normalizacja wierszy z API: kwoty jako liczby.
export const withNumbers = (rows, fields = ['amount']) =>
  (rows || []).map((r) => {
    const out = { ...r };
    fields.forEach((f) => { if (f in out) out[f] = num(out[f]); });
    return out;
  });

// ── Formaty ────────────────────────────────────────────────────────────────
export const fmtMoney = (n) =>
  num(n).toLocaleString(appLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';

export const fmtPct = (n, digits = 1) =>
  num(n).toLocaleString(appLocale(), { minimumFractionDigits: 0, maximumFractionDigits: digits }) + '%';

// Data „YYYY-MM-DD” jako dzień lokalny (bez przesunięcia strefy UTC).
export const parseLocalDate = (s) => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const fmtDate = (s) => {
  const d = parseLocalDate(s);
  return d ? d.toLocaleDateString(appLocale()) : '';
};

// Dzisiejsza / dowolna data jako „YYYY-MM-DD” w czasie lokalnym (toISOString przesuwa dzień nocą).
export const localDateStr = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Pierwszy dzień następnego okresu (miesiąc / kwartał / rok) — termin wysyłki raportu.
export const nextPeriodStart = (cadence, now = new Date()) => {
  if (cadence === 'monthly') return localDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 1));
  if (cadence === 'quarterly') {
    const q = Math.floor(now.getMonth() / 3) + 1;
    return localDateStr(new Date(now.getFullYear(), q * 3, 1));
  }
  return localDateStr(new Date(now.getFullYear() + 1, 0, 1));
};

// Lista brakujących pól: spec = [[klucz, etykieta], …]; zwraca etykiety pustych.
export const missingFields = (form, spec) =>
  spec.filter(([key]) => {
    const v = form?.[key];
    return v == null || (typeof v === 'string' && v.trim() === '') || (typeof v === 'number' && !Number.isFinite(v));
  }).map(([, label]) => label);

// Kopiowanie budżetu z poprzedniego roku: pomija pozycje, które już są w roku docelowym
// (ta sama służba, opis i rodzaj) — drugi klik nie podwaja planu.
export const planBudgetCopy = (prevItems, existingItems) => {
  const key = (i) => `${i.kind || 'expense'}|${normKey(i.category)}|${normKey(i.description)}`;
  const have = new Set((existingItems || []).map(key));
  const toCopy = [];
  let skipped = 0;
  (prevItems || []).forEach((it) => {
    const k = key(it);
    if (have.has(k)) { skipped++; return; }
    have.add(k);
    toCopy.push(it);
  });
  return { toCopy, skipped, total: sumBy(toCopy, 'planned_amount') };
};

// Czytelny komunikat błędu zapisu (403 z serwera, brak sieci) zamiast surowego tekstu.
export const humanSaveError = (err, tr) => {
  const status = String(err?.status ?? err?.statusCode ?? err?.code ?? '');
  const msg = String(err?.message || err || '');
  if (status === '403' || /\b403\b|uprawnie/i.test(msg)) {
    if (/zatwierdz/i.test(msg)) return tr('Nie masz uprawnienia do zatwierdzania wydatków. Wydatek możesz zgłosić jako wniosek do akceptacji.');
    return tr('Nie masz uprawnień do tej operacji. Poproś administratora o dostęp.');
  }
  if (/failed to fetch|network/i.test(msg)) return tr('Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.');
  return msg ? tr('Nie udało się zapisać: {msg}', { msg }) : tr('Nie udało się zapisać. Spróbuj ponownie.');
};
