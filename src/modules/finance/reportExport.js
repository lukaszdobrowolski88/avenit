// Model raportu + eksport CSV / XLSX / PDF (po stronie klienta).
// Model jest wspólny: zasila wykresy (ReportCharts), pobieranie plików i załączniki maila.
import { saveAs } from 'file-saver';
import { bucketsForRange } from './reportRange';
import { appLocale } from '../../i18n';
import { isCountedExpense, matchesBudgetItem } from './money';
// Ciężkie zależności (xlsx, jspdf, html2canvas) ładowane dynamicznie dopiero przy eksporcie,
// żeby nie powiększać głównego chunku modułu Finanse.

const num = (v) => Number(v || 0);
export const pln = (n) => num(n).toLocaleString(appLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
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
 * @param {{range, income, expense, budget, expenseCategories?, incomeCategories?, projects?, prevIncome?, prevExpense?}} p
 */
export function buildReportModel({ range, income = [], expense: allExpense = [], budget = [], expenseCategories = [], incomeCategories = [], projects = [], prevIncome = null, prevExpense = null }) {
  // Do bilansu, wykresów i realizacji wchodzą tylko wydatki zatwierdzone/opłacone.
  // Wnioski czekające, szkice i odrzucone widać osobno w sekcji „Status wydatków”.
  const expense = allExpense.filter(isCountedExpense);
  const pendingExpense = allExpense.filter((e) => e.status === 'submitted' || e.status === 'draft');
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

  // Realizacja budżetu WYDATKÓW wg służby (plan przychodów to nie służba — pomijamy).
  // Dopasowanie po służbie + opisie pozycji (bez względu na wielkość liter i spacje).
  const stats = {};
  budget.filter((item) => item.kind !== 'income').forEach((item) => {
    const cat = item.category || '—';
    if (!stats[cat]) stats[cat] = { planned: 0, realized: 0 };
    stats[cat].planned += num(item.planned_amount);
    stats[cat].realized += expense
      .filter((e) => matchesBudgetItem(e, item))
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
  allExpense.forEach((e) => { const s = e.status || 'approved'; (statusMap[s] = statusMap[s] || { amount: 0, count: 0 }).amount += num(e.amount); statusMap[s].count++; });
  const expenseStatus = Object.entries(statusMap)
    .map(([status, v]) => ({ status, amount: v.amount, count: v.count }))
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));

  // Nieopłacone zobowiązania (faktury do zapłaty), rosnąco wg terminu.
  const unpaidInvoices = expense
    .filter((e) => e.is_paid === false)
    .map((e) => ({ contractor: e.contractor || '—', description: e.description || '', amount: num(e.amount), due_date: e.due_date || null, invoice_number: e.invoice_number || null }))
    .sort((a, b) => String(a.due_date || '9999-99-99').localeCompare(String(b.due_date || '9999-99-99')));

  const byCostCategory = groupSorted(expense, (e) => e.cost_category || 'Bez kategorii', colorFor);

  // Projekty: plan (kwota projektu albo pozycje budżetu roku), wydano i zebrano w zakresie.
  const projectName = (id) => projects.find((p) => String(p.id) === String(id));
  const projIds = [...new Set([...expense, ...income, ...budget].map((r) => r.project_id).filter(Boolean).map(String))];
  const byProject = projIds.map((id) => {
    const p = projectName(id);
    const own = (r) => String(r.project_id || '') === id;
    const budgetPlan = budget.filter((b) => own(b) && b.kind !== 'income').reduce((a, b) => a + num(b.planned_amount), 0);
    const planned = num(p?.budget_amount) > 0 ? num(p.budget_amount) : budgetPlan;
    const spent = expense.filter(own).reduce((a, e) => a + num(e.amount), 0);
    const raised = income.filter(own).reduce((a, i) => a + num(i.amount), 0);
    return { id, name: p?.name || '—', color: p?.color || null, planned, spent, raised, balance: raised - spent, pct: planned > 0 ? (spent / planned) * 100 : 0 };
  }).sort((a, b) => b.spent - a.spent || b.raised - a.raised);

  // Tagi: transakcja z kilkoma tagami liczy się w każdym z nich (sumy tagów ≠ suma ogółem).
  const tagMap = {};
  const addTagged = (rows, field) => rows.forEach((r) => (Array.isArray(r.tags) ? r.tags : []).forEach((t) => {
    if (!t) return;
    (tagMap[t] = tagMap[t] || { name: t, expense: 0, income: 0, count: 0 })[field] += num(r.amount);
    tagMap[t].count++;
  }));
  addTagged(expense, 'expense');
  addTagged(income, 'income');
  const byTag = Object.values(tagMap).sort((a, b) => (b.expense + b.income) - (a.expense + a.income));
  const incomeColorFor = (name) => incomeCategories.find((c) => c.name === name)?.color || null;

  const kpis = {
    incomeCount: income.length,
    expenseCount: expense.length,
    avgIncome: income.length ? totalIncome / income.length : 0,
    avgExpense: expense.length ? totalExpense / expense.length : 0,
    topCategory: byCostCategory[0] || null,
    biggestExpense: topExpenses[0] || null,
    unpaidTotal: unpaidInvoices.reduce((a, e) => a + e.amount, 0),
    unpaidCount: unpaidInvoices.length,
    pendingTotal: pendingExpense.reduce((a, e) => a + num(e.amount), 0),
    pendingCount: pendingExpense.length,
    plannedExpense: budget.filter((b) => b.kind !== 'income').reduce((a, b) => a + num(b.planned_amount), 0),
    plannedIncome: budget.filter((b) => b.kind === 'income').reduce((a, b) => a + num(b.planned_amount), 0),
  };

  const model = {
    range,
    totals: { income: totalIncome, expense: totalExpense, balance: totalIncome - totalExpense },
    kpis,
    buckets,
    byCostCategory,
    byServiceCategory: groupSorted(expense, (e) => e.category),
    byIncomeType: groupSorted(income, (i) => i.type, incomeColorFor),
    byProject,
    byTag,
    projectNames: Object.fromEntries(projects.map((p) => [String(p.id), p.name])),
    byIncomeSource: groupSorted(income, (i) => i.source),
    topExpenses,
    expenseStatus,
    unpaidInvoices,
    budgetExecution,
    raw: { income, expense: allExpense, budget },
  };

  if (prevIncome != null && prevExpense != null) {
    const pi = prevIncome.reduce((a, r) => a + num(r.amount), 0);
    const pe = prevExpense.filter(isCountedExpense).reduce((a, r) => a + num(r.amount), 0);
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
// `sections` (opcjonalnie) — {klucz: bool} z reportSections.js; brak = wszystkie sekcje.
const sectionOn = (sections, key) => !sections || sections[key] !== false;

export function csvString(model, sections) {
  const on = (k) => sectionOn(sections, k);
  const lines = [];
  const row = (...cells) => lines.push(cells.map(csvEsc).join(';'));
  row('Raport finansowy', model.range.label);
  row('');
  if (model.filterLabel) row('Wyłączone z raportu', model.filterLabel);
  if (on('summary')) {
    row('');
    row('Podsumowanie', 'Kwota');
    row('Przychody', model.totals.income);
    row('Wydatki', model.totals.expense);
    row('Bilans', model.totals.balance);
  }
  if (on('incomeExpense') || on('cashflow')) {
    row('');
    row('Okres', 'Przychody', 'Wydatki', 'Bilans', 'Skumulowany');
    model.buckets.forEach((b) => row(b.label, b.income, b.expense, b.balance, b.cumulative));
  }
  const section = (title, items, cols, key) => {
    if (!items.length || (key && !on(key))) return;
    row(''); row(title, ...cols.map((c) => c.h));
    items.forEach((it) => row(it.name ?? it.category, ...cols.map((c) => c.v(it))));
  };
  const amtPct = [{ h: 'Kwota', v: (x) => x.amount }, { h: '%', v: (x) => x.pct.toFixed(1) }];
  section('Wydatki wg kategorii', model.byCostCategory, amtPct, 'byCostCategory');
  section('Wydatki wg służby / obszaru', model.byServiceCategory, amtPct, 'byArea');
  section('Wpływy wg kategorii', model.byIncomeType, amtPct, 'byIncomeType');
  section('Wpływy wg źródła', model.byIncomeSource, amtPct, 'byIncomeSource');
  section('Projekty', model.byProject || [], [{ h: 'Plan', v: (x) => x.planned }, { h: 'Wydano', v: (x) => x.spent }, { h: 'Zebrano', v: (x) => x.raised }, { h: 'Bilans', v: (x) => x.balance }], 'byProject');
  section('Tagi', model.byTag || [], [{ h: 'Wydatki', v: (x) => x.expense }, { h: 'Wpływy', v: (x) => x.income }, { h: 'Liczba', v: (x) => x.count }], 'byTag');
  if (on('expenseStatus') && model.expenseStatus.length) {
    row(''); row('Status wydatków', 'Liczba', 'Kwota');
    model.expenseStatus.forEach((x) => row(x.status, x.count, x.amount));
  }
  if (on('topExpenses') && model.topExpenses.length) {
    row(''); row('Największe wydatki', 'Data', 'Kontrahent', 'Kategoria', 'Opis', 'Kwota');
    model.topExpenses.forEach((e) => row('', e.date, e.contractor, e.category, e.description, e.amount));
  }
  if (on('unpaid') && model.unpaidInvoices.length) {
    row(''); row('Nieopłacone', 'Kontrahent', 'Opis', 'Termin', 'Nr faktury', 'Kwota');
    model.unpaidInvoices.forEach((e) => row('', e.contractor, e.description, e.due_date || '', e.invoice_number || '', e.amount));
  }
  if (on('budgetExecution') && model.budgetExecution.length) {
    row(''); row('Realizacja budżetu', 'Planowane', 'Zrealizowane', 'Realizacja %', 'Pozostało');
    model.budgetExecution.forEach((b) => row(b.category, b.planned, b.realized, b.pct.toFixed(0), b.remaining));
  }
  if (on('yoy') && model.yoy) {
    row(''); row('Rok do roku', 'Poprzedni', 'Bieżący');
    row('Przychody', model.yoy.income.prev, model.yoy.income.now);
    row('Wydatki', model.yoy.expense.prev, model.yoy.expense.now);
    row('Bilans', model.yoy.balance.prev, model.yoy.balance.now);
  }
  const projName = (id) => (id && model.projectNames?.[String(id)]) || '';
  if (on('incomeList') && model.raw.income.length) {
    row(''); row('Wpływy', 'Data', 'Kategoria', 'Źródło', 'Projekt', 'Tagi', 'Kwota');
    model.raw.income.forEach((r) => row('', r.date, r.type, r.source, projName(r.project_id), (r.tags || []).join(', '), num(r.amount)));
  }
  if (on('expenseList') && model.raw.expense.length) {
    row(''); row('Wydatki', 'Data', 'Służba / obszar', 'Kategoria', 'Opis', 'Kontrahent', 'Projekt', 'Tagi', 'Status', 'Kwota');
    model.raw.expense.forEach((r) => row('', r.payment_date, r.category, r.cost_category, r.description, r.contractor, projName(r.project_id), (r.tags || []).join(', '), r.status || 'approved', num(r.amount)));
  }
  return '﻿' + lines.join('\n');
}
export function toCsvBlob(model, sections) { return new Blob([csvString(model, sections)], { type: 'text/csv;charset=utf-8;' }); }

// ── XLSX (SheetJS, wiele arkuszy) ─────────────────────────────────────────────
function buildWorkbook(XLSX, model, sections) {
  const on = (k) => sectionOn(sections, k);
  const wb = XLSX.utils.book_new();
  const summary = [['Raport finansowy', model.range.label]];
  if (model.filterLabel) summary.push(['Wyłączone z raportu', model.filterLabel]);
  if (on('summary')) summary.push([], ['Podsumowanie', 'Kwota (zł)'], ['Przychody', model.totals.income], ['Wydatki', model.totals.expense], ['Bilans', model.totals.balance]);
  if (on('incomeExpense') || on('cashflow')) summary.push([], ['Okres', 'Przychody', 'Wydatki', 'Bilans', 'Skumulowany'], ...model.buckets.map((b) => [b.label, b.income, b.expense, b.balance, b.cumulative]));
  const groupRows = (title, items, key) => {
    if (on(key) && items.length) summary.push([], [title, 'Kwota', '%'], ...items.map((c) => [c.name, c.amount, Number(c.pct.toFixed(1))]));
  };
  groupRows('Wydatki wg kategorii', model.byCostCategory, 'byCostCategory');
  groupRows('Wydatki wg służby / obszaru', model.byServiceCategory, 'byArea');
  groupRows('Wpływy wg kategorii', model.byIncomeType, 'byIncomeType');
  groupRows('Wpływy wg źródła', model.byIncomeSource, 'byIncomeSource');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Podsumowanie');

  const projName = (id) => (id && model.projectNames?.[String(id)]) || '';
  // Arkusze transakcji zawsze (to dane źródłowe Excela), z projektem i tagami.
  const incomeSheet = [
    ['Data', 'Kategoria', 'Źródło', 'Projekt', 'Tagi', 'Kwota', 'Notatki'],
    ...model.raw.income.map((r) => [r.date, r.type, r.source, projName(r.project_id), (r.tags || []).join(', '), num(r.amount), r.notes]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(incomeSheet), 'Wpływy');

  const expenseSheet = [
    ['Data', 'Kontrahent', 'Służba / obszar', 'Kategoria', 'Opis', 'Projekt', 'Tagi', 'Kwota', 'Status'],
    ...model.raw.expense.map((r) => [r.payment_date, r.contractor, r.category, r.cost_category, r.description, projName(r.project_id), (r.tags || []).join(', '), num(r.amount), r.status]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(expenseSheet), 'Wydatki');

  if (on('byProject') && (model.byProject || []).length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Projekt', 'Plan', 'Wydano', 'Zebrano', 'Bilans', 'Realizacja %'],
      ...model.byProject.map((p) => [p.name, p.planned, p.spent, p.raised, p.balance, Number(p.pct.toFixed(0))]),
    ]), 'Projekty');
  }
  if (on('byTag') && (model.byTag || []).length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Tag', 'Wydatki', 'Wpływy', 'Liczba transakcji'],
      ...model.byTag.map((t) => [t.name, t.expense, t.income, t.count]),
    ]), 'Tagi');
  }

  if (on('budgetExecution') && model.budgetExecution.length) {
    const budgetSheet = [
      ['Służba / obszar', 'Planowane', 'Zrealizowane', 'Realizacja %', 'Pozostało'],
      ...model.budgetExecution.map((b) => [b.category, b.planned, b.realized, Number(b.pct.toFixed(0)), b.remaining]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(budgetSheet), 'Budżet');
  }
  return wb;
}
export async function toXlsxBlob(model, sections) {
  const XLSX = await import('xlsx');
  const out = XLSX.write(buildWorkbook(XLSX, model, sections), { type: 'array', bookType: 'xlsx' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ── PDF (zrzut sekcji raportu — WYSIWYG, polskie znaki + wykresy) ─────────────
// Składamy raport BLOK PO BLOKU (każda karta/sekcja = osobny zrzut), przenosząc blok
// na nową stronę, gdy się nie mieści — żeby granica strony nie przecinała kart.
// Reużywa wzorca html2canvas (onclone zdejmuje dark mode + ukrywa .pdf-exclude).
// allowTaint:false + useCORS:true → zdalne logo bez CORS zostanie pominięte, a nie
// wywali canvas.toDataURL (SecurityError).
const H2C_OPTS = {
  scale: 2, useCORS: true, allowTaint: false, backgroundColor: '#ffffff', logging: false,
  onclone: (clonedDoc) => {
    clonedDoc.documentElement.classList.remove('dark');
    clonedDoc.body.classList.remove('dark');
    clonedDoc.documentElement.style.backgroundColor = '#ffffff';
    clonedDoc.querySelectorAll('.pdf-exclude').forEach((n) => { n.style.display = 'none'; });
  },
};

async function buildReportPdf(el) {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')]);
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const M = 10;                                   // margines strony (mm)
  const contentW = pageW - 2 * M;
  const contentH = pageH - 2 * M;
  const GAP = 4;                                  // odstęp między blokami (mm)

  const blocks = Array.from(el.children).filter((n) => n.offsetParent !== null || n.getClientRects().length);
  let cursorY = M;

  for (const block of blocks) {
    const canvas = await html2canvas(block, H2C_OPTS);
    if (!canvas.width || !canvas.height) continue;
    const pxPerMm = canvas.width / contentW;
    const hmm = canvas.height / pxPerMm;

    if (hmm > contentH) {
      // Blok wyższy niż strona — ostatecznie tnij sam ten blok na strony.
      if (cursorY > M) { pdf.addPage(); cursorY = M; }
      const pageHpx = Math.max(1, Math.floor(contentH * pxPerMm));
      let offsetY = 0;
      while (offsetY < canvas.height) {
        const sliceH = Math.min(pageHpx, canvas.height - offsetY);
        const slice = document.createElement('canvas');
        slice.width = canvas.width; slice.height = sliceH;
        const ctx = slice.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, slice.width, slice.height);
        ctx.drawImage(canvas, 0, offsetY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
        pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', M, M, contentW, sliceH / pxPerMm);
        offsetY += sliceH;
        if (offsetY < canvas.height) pdf.addPage();
      }
      cursorY = pageH; // następny blok → nowa strona
      continue;
    }

    // Nie mieści się na bieżącej stronie → nowa strona.
    if (cursorY + hmm > pageH - M && cursorY > M) { pdf.addPage(); cursorY = M; }
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', M, cursorY, contentW, hmm);
    cursorY += hmm + GAP;
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
