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

  // Największe pojedyncze wydatki (zastępuje raport kontrahentów).
  const topExpenses = expense
    .map((e) => ({ date: e.payment_date, contractor: e.contractor || '—', category: e.cost_category || e.category || '—', description: e.description || '', amount: num(e.amount) }))
    .sort((a, b) => b.amount - a.amount).slice(0, 8);

  // Status wydatków (workflow akceptacji/płatności).
  const STATUS_ORDER = ['draft', 'submitted', 'approved', 'rejected', 'paid'];
  const statusMap = {};
  expense.forEach((e) => { const s = e.status || 'approved'; (statusMap[s] = statusMap[s] || { amount: 0, count: 0 }).amount += num(e.amount); statusMap[s].count++; });
  const expenseStatus = Object.entries(statusMap)
    .map(([status, v]) => ({ status, amount: v.amount, count: v.count }))
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));

  // Nieopłacone zobowiązania (faktury do zapłaty), rosnąco wg terminu.
  const unpaidInvoices = expense
    .filter((e) => e.is_paid === false)
    .map((e) => ({ contractor: e.contractor || '—', description: e.description || '', amount: num(e.amount), due_date: e.due_date || null, invoice_number: e.invoice_number || null }))
    .sort((a, b) => String(a.due_date || '9999-99-99').localeCompare(String(b.due_date || '9999-99-99')));

  const byCostCategory = groupSorted(expense, (e) => e.cost_category || 'Bez kategorii', colorFor);

  const kpis = {
    incomeCount: income.length,
    expenseCount: expense.length,
    avgIncome: income.length ? totalIncome / income.length : 0,
    avgExpense: expense.length ? totalExpense / expense.length : 0,
    topCategory: byCostCategory[0] || null,
    biggestExpense: topExpenses[0] || null,
    unpaidTotal: unpaidInvoices.reduce((a, e) => a + e.amount, 0),
    unpaidCount: unpaidInvoices.length,
  };

  const model = {
    range,
    totals: { income: totalIncome, expense: totalExpense, balance: totalIncome - totalExpense },
    kpis,
    buckets,
    byCostCategory,
    byServiceCategory: groupSorted(expense, (e) => e.category),
    byIncomeType: groupSorted(income, (i) => i.type),
    byIncomeSource: groupSorted(income, (i) => i.source),
    topExpenses,
    expenseStatus,
    unpaidInvoices,
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
  section('Wpływy wg źródła', model.byIncomeSource, [{ h: 'Kwota', v: (x) => x.amount }, { h: '%', v: (x) => x.pct.toFixed(1) }]);
  if (model.topExpenses.length) {
    row(''); row('Największe wydatki', 'Data', 'Kontrahent', 'Kategoria', 'Opis', 'Kwota');
    model.topExpenses.forEach((e) => row('', e.date, e.contractor, e.category, e.description, e.amount));
  }
  if (model.unpaidInvoices.length) {
    row(''); row('Nieopłacone', 'Kontrahent', 'Opis', 'Termin', 'Nr faktury', 'Kwota');
    model.unpaidInvoices.forEach((e) => row('', e.contractor, e.description, e.due_date || '', e.invoice_number || '', e.amount));
  }
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
// allowTaint:false + useCORS:true → zdalne logo bez CORS zostanie pominięte, a nie
// wywali canvas.toDataURL (SecurityError).
async function buildReportPdf(el) {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')]);
  const canvas = await html2canvas(el, {
    scale: 2, useCORS: true, allowTaint: false, backgroundColor: '#ffffff', logging: false,
    onclone: (clonedDoc) => {
      clonedDoc.documentElement.classList.remove('dark');
      clonedDoc.body.classList.remove('dark');
      clonedDoc.documentElement.style.backgroundColor = '#ffffff';
      // Elementy sterujące (np. ⚙ edycji sald) nie należą do wydruku.
      clonedDoc.querySelectorAll('.pdf-exclude').forEach((n) => { n.style.display = 'none'; });
    },
  });
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const M = 10;                                   // margines strony (mm)
  const contentW = pageW - 2 * M;
  const contentH = pageH - 2 * M;
  const pxPerMm = canvas.width / contentW;
  const pageHpx = Math.max(1, Math.floor(contentH * pxPerMm));
  // Tniemy wysoki zrzut na kawałki wielkości strony — każdy kładziemy w obrębie marginesów
  // (brak „krwawienia" treści w marginesy sąsiednich stron).
  let offsetY = 0, page = 0;
  while (offsetY < canvas.height) {
    const sliceH = Math.min(pageHpx, canvas.height - offsetY);
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = sliceH;
    const ctx = slice.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, offsetY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
    if (page > 0) pdf.addPage();
    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', M, M, contentW, sliceH / pxPerMm);
    offsetY += sliceH;
    page++;
  }
  // Stopka z numeracją stron (ASCII — bez polskich diakrytyków, których nie ma font jsPDF).
  const total = pdf.internal.getNumberOfPages();
  pdf.setFontSize(8);
  pdf.setTextColor(150);
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    pdf.text(`Strona ${i} z ${total}`, pageW / 2, pageH - 4, { align: 'center' });
  }
  return pdf;
}

export async function reportElToPdfBlob(el) {
  return (await buildReportPdf(el)).output('blob');
}

/** Buduje PDF i otwiera okno druku (autoPrint). Fallback: pobranie pliku, gdy popup zablokowany. */
export async function printReportEl(el, filename = 'raport.pdf') {
  const pdf = await buildReportPdf(el);
  pdf.autoPrint();
  const url = pdf.output('bloburl');
  const win = window.open(url, '_blank');
  if (!win) saveAs(pdf.output('blob'), filename);
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
