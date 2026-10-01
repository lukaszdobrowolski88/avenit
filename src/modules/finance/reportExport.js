// Model raportu + eksport CSV / XLSX / PDF (po stronie klienta).
// Model jest wspólny: zasila wykresy (ReportCharts), pobieranie plików i załączniki maila.
import { saveAs } from 'file-saver';
import { bucketsForRange } from './reportRange';
// Ciężkie zależności (xlsx, jspdf, html2canvas) ładowane dynamicznie dopiero przy eksporcie,
// żeby nie powiększać głównego chunku modułu Finanse.

const num = (v) => Number(v || 0);
export const pln = (n) => num(n).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
const inRange = (rows, dateField, from, to) =>
  rows.filter((r) => r[dateField] && r[dateField] >= from && r[dateField] <= to)
    .reduce((a, r) => a + num(r.amount), 0);

function groupSorted(rows, keyFn, colorFn) {
  const map = {};
  rows.forEach((r) => { const k = keyFn(r) || '—'; map[k] = (map[k] || 0) + num(r.amount); });
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  return entries.map(([name, amount]) => ({
    name, amount, pct: total > 0 ? (amount / total) * 100 : 0,
    color: colorFn ? colorFn(name) : undefined,
  }));
}

/**
 * Buduje wspólny model raportu dla danego zakresu.
 * @param {{range, income, expense, budget, expenseCategories?, prevIncome?, prevExpense?}} p
 */
export function buildReportModel({ range, income = [], expense = [], budget = [], expenseCategories = [], prevIncome = null, prevExpense = null }) {
  const totalIncome = income.reduce((a, r) => a + num(r.amount), 0);
  const totalExpense = expense.reduce((a, r) => a + num(r.amount), 0);

  let run = 0;
  const buckets = bucketsForRange(range.from, range.to).map((b) => {
    const inc = inRange(income, 'date', b.from, b.to);
    const exp = inRange(expense, 'payment_date', b.from, b.to);
    run += inc - exp;
    return { label: b.label, income: inc, expense: exp, balance: inc - exp, cumulative: run };
  });

  const colorFor = (name) => expenseCategories.find((c) => c.name === name)?.color || null;

  // Realizacja budżetu wg służby (kruche dopasowanie po category+description, jak w istniejącym kodzie).
  const stats = {};
  budget.forEach((item) => {
    const cat = item.category || '—';
    if (!stats[cat]) stats[cat] = { planned: 0, realized: 0 };
    stats[cat].planned += num(item.planned_amount);
    stats[cat].realized += expense
      .filter((e) => e.category === item.category && e.description === item.description)
      .reduce((a, e) => a + num(e.amount), 0);
  });
  const budgetExecution = Object.entries(stats).map(([category, s]) => ({
    category, planned: s.planned, realized: s.realized,
    pct: s.planned > 0 ? (s.realized / s.planned) * 100 : 0,
    remaining: s.planned - s.realized,
  }));

  const model = {
    range,
    totals: { income: totalIncome, expense: totalExpense, balance: totalIncome - totalExpense },
    buckets,
    byCostCategory: groupSorted(expense, (e) => e.cost_category || 'Bez kategorii', colorFor),
    byServiceCategory: groupSorted(expense, (e) => e.category),
    byIncomeType: groupSorted(income, (i) => i.type),
    topContractors: groupSorted(expense, (e) => e.contractor).slice(0, 10),
    budgetExecution,
    raw: { income, expense, budget },
  };

  if (prevIncome != null && prevExpense != null) {
    const pi = prevIncome.reduce((a, r) => a + num(r.amount), 0);
    const pe = prevExpense.reduce((a, r) => a + num(r.amount), 0);
    model.yoy = {
      income: { now: totalIncome, prev: pi },
      expense: { now: totalExpense, prev: pe },
      balance: { now: totalIncome - totalExpense, prev: pi - pe },
    };
  }
  return model;
}

// ── CSV (wielosekcyjny, BOM + średniki — zgodnie z exportToCsv w module) ──────
function csvEsc(v) { const s = v == null ? '' : String(v); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
export function csvString(model) {
  const lines = [];
  const row = (...cells) => lines.push(cells.map(csvEsc).join(';'));
  row('Raport finansowy', model.range.label);
  row('');
  row('Podsumowanie', 'Kwota');
  row('Przychody', model.totals.income);
  row('Wydatki', model.totals.expense);
  row('Bilans', model.totals.balance);
  row('');
  row('Okres', 'Przychody', 'Wydatki', 'Bilans', 'Skumulowany');
  model.buckets.forEach((b) => row(b.label, b.income, b.expense, b.balance, b.cumulative));
  const section = (title, items, cols) => {
    if (!items.length) return;
    row(''); row(title, ...cols.map((c) => c.h));
    items.forEach((it) => row(it.name ?? it.category, ...cols.map((c) => c.v(it))));
  };
  section('Wydatki wg kategorii kosztu', model.byCostCategory, [{ h: 'Kwota', v: (x) => x.amount }, { h: '%', v: (x) => x.pct.toFixed(1) }]);
  section('Wydatki wg służby', model.byServiceCategory, [{ h: 'Kwota', v: (x) => x.amount }, { h: '%', v: (x) => x.pct.toFixed(1) }]);
  section('Wpływy wg typu', model.byIncomeType, [{ h: 'Kwota', v: (x) => x.amount }, { h: '%', v: (x) => x.pct.toFixed(1) }]);
  section('Top kontrahenci', model.topContractors, [{ h: 'Kwota', v: (x) => x.amount }, { h: '%', v: (x) => x.pct.toFixed(1) }]);
  if (model.budgetExecution.length) {
    row(''); row('Realizacja budżetu', 'Planowane', 'Zrealizowane', 'Realizacja %', 'Pozostało');
    model.budgetExecution.forEach((b) => row(b.category, b.planned, b.realized, b.pct.toFixed(0), b.remaining));
  }
  return '﻿' + lines.join('\n');
}
export function toCsvBlob(model) { return new Blob([csvString(model)], { type: 'text/csv;charset=utf-8;' }); }

// ── XLSX (SheetJS, wiele arkuszy) ─────────────────────────────────────────────
function buildWorkbook(XLSX, model) {
  const wb = XLSX.utils.book_new();
  const summary = [
    ['Raport finansowy', model.range.label],
    [],
    ['Podsumowanie', 'Kwota (zł)'],
    ['Przychody', model.totals.income],
    ['Wydatki', model.totals.expense],
    ['Bilans', model.totals.balance],
    [],
    ['Okres', 'Przychody', 'Wydatki', 'Bilans', 'Skumulowany'],
    ...model.buckets.map((b) => [b.label, b.income, b.expense, b.balance, b.cumulative]),
    [],
    ['Wydatki wg kategorii kosztu', 'Kwota', '%'],
    ...model.byCostCategory.map((c) => [c.name, c.amount, Number(c.pct.toFixed(1))]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Podsumowanie');

  const incomeSheet = [
    ['Data', 'Typ', 'Źródło', 'Kwota', 'Notatki'],
    ...model.raw.income.map((r) => [r.date, r.type, r.source, num(r.amount), r.notes]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(incomeSheet), 'Wpływy');

  const expenseSheet = [
    ['Data', 'Kontrahent', 'Służba', 'Kategoria kosztu', 'Opis', 'Kwota', 'Status'],
    ...model.raw.expense.map((r) => [r.payment_date, r.contractor, r.category, r.cost_category, r.description, num(r.amount), r.status]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(expenseSheet), 'Wydatki');

  if (model.budgetExecution.length) {
    const budgetSheet = [
      ['Służba', 'Planowane', 'Zrealizowane', 'Realizacja %', 'Pozostało'],
      ...model.budgetExecution.map((b) => [b.category, b.planned, b.realized, Number(b.pct.toFixed(0)), b.remaining]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(budgetSheet), 'Budżet');
  }
  return wb;
}
export async function toXlsxBlob(model) {
  const XLSX = await import('xlsx');
  const out = XLSX.write(buildWorkbook(XLSX, model), { type: 'array', bookType: 'xlsx' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ── PDF (zrzut sekcji raportu — WYSIWYG, polskie znaki + wykresy) ─────────────
// Reużywa wzorca html2canvas+jsPDF z src/lib/utils.js (onclone zdejmuje dark mode).
export async function reportElToPdfBlob(el) {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')]);
  const canvas = await html2canvas(el, {
    scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#ffffff', logging: false,
    onclone: (clonedDoc) => {
      clonedDoc.documentElement.classList.remove('dark');
      clonedDoc.body.classList.remove('dark');
      clonedDoc.documentElement.style.backgroundColor = '#ffffff';
    },
  });
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgData = canvas.toDataURL('image/jpeg', 0.9);
  const imgH = (canvas.height * pageW) / canvas.width;
  let heightLeft = imgH;
  let position = 0;
  pdf.addImage(imgData, 'JPEG', 0, position, pageW, imgH);
  heightLeft -= pageH;
  while (heightLeft > 0) {
    position -= pageH;
    pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, position, pageW, imgH);
    heightLeft -= pageH;
  }
  return pdf.output('blob');
}

// ── Pomocnicze ────────────────────────────────────────────────────────────────
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
export function download(blob, filename) { saveAs(blob, filename); }

// Bezpieczna nazwa pliku z etykiety zakresu.
export function slugForRange(range) {
  return String(range.label || 'raport').toLowerCase()
    .replace(/ł/g, 'l').replace(/[–—]/g, '-')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
