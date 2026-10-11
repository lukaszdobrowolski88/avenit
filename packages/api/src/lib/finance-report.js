// Wspólny builder raportu finansowego (serwer): pobranie danych + mail-safe HTML + CSV.
// Używany przez fn/finance-report-email.js (na żądanie) i fn/finance-report-schedule.js (cron).
// HTML celowo bez SVG — Gmail/Outlook wycinają SVG; słupki robione na <div> z bgcolor + width%.
// Sekcje (`sections`) i wykluczenia (`exclude`) odpowiadają wyborowi w zakładce Raporty
// (src/modules/finance/reportSections.js); brak sekcji = wszystkie.

import { FINANCE_TEAM_TYPES } from '../dataapi/financeScope.js';

export const pln = (n) => Number(n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const CAT_COLORS = ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834'];
const sum = (arr, f = (x) => x.amount) => arr.reduce((a, x) => a + Number(f(x) || 0), 0);

export const MAIL_SECTIONS = ['summary', 'byCostCategory', 'byArea', 'byIncomeType', 'byProject', 'byTag', 'topExpenses', 'budgetExecution', 'unpaid'];

/** Lista sekcji z wejścia (tablica kluczy) → zbiór; null/pusto/niepoprawnie = wszystkie. */
export function normalizeSections(input) {
  if (!Array.isArray(input)) return new Set(MAIL_SECTIONS);
  const set = new Set(input.filter((k) => MAIL_SECTIONS.includes(k)));
  return set.size ? set : new Set(MAIL_SECTIONS);
}

// Wykluczenia z zakładki Raporty (src/modules/finance/reportSections.js — te same reguły).
const NONE = '__none__';
const DIMS = ['projects', 'areas', 'costCategories', 'incomeCategories', 'tags'];

/** Wykluczenia z wejścia: tylko znane wymiary, krótkie teksty, ograniczona liczba. */
export function normalizeExclude(input) {
  if (!input || typeof input !== 'object') return null;
  const out = {};
  let any = false;
  for (const d of DIMS) {
    const list = Array.isArray(input[d]) ? input[d] : [];
    out[d] = [...new Set(list.filter((v) => typeof v === 'string' || typeof v === 'number').map((v) => String(v).slice(0, 200)))].slice(0, 500);
    if (out[d].length) any = true;
  }
  return any ? out : null;
}

const tagsOf = (r) => {
  if (Array.isArray(r.tags)) return r.tags;
  if (typeof r.tags === 'string') { try { const v = JSON.parse(r.tags); return Array.isArray(v) ? v : []; } catch { return []; } }
  return [];
};
const val = (v) => (v == null || v === '' ? NONE : String(v));

/** Wiersze po wykluczeniach. kind: 'income' | 'expense' | 'budget'. */
export function applyExclusions(rows, ex, kind) {
  if (!ex) return rows;
  const s = Object.fromEntries(DIMS.map((d) => [d, new Set(ex[d] || [])]));
  return rows.filter((r) => {
    if (s.projects.size && s.projects.has(val(r.project_id))) return false;
    if (s.tags.size) {
      const tags = tagsOf(r).filter(Boolean);
      if (tags.length ? tags.some((t) => s.tags.has(String(t))) : s.tags.has(NONE)) return false;
    }
    const isIncome = kind === 'income' || (kind === 'budget' && r.kind === 'income');
    if (isIncome) return !(s.incomeCategories.size && s.incomeCategories.has(val(kind === 'income' ? r.type : r.category)));
    if (s.areas.size && s.areas.has(val(r.category))) return false;
    if (s.costCategories.size && s.costCategories.has(val(r.cost_category))) return false;
    return true;
  });
}

/** Pobiera wiersze raportu dla zakresu dat (+ budżet dla roku zakresu), projekty i nazwę organizacji. */
export async function fetchReportRows(db, from, to, year) {
  const q = async (sql, params) => { try { const { rows } = await db.query(sql, params); return rows; } catch { return []; } };
  // SELECT * — odporne na tenanty przed migracją 101 (brak project_id/tags na budżecie).
  const [income, allExpenses, budget, projects, orgRows, moduleRows] = await Promise.all([
    q('SELECT * FROM income_transactions WHERE date >= $1 AND date <= $2', [from, to]),
    q('SELECT * FROM expense_transactions WHERE payment_date >= $1 AND payment_date <= $2', [from, to]),
    q('SELECT * FROM budget_items WHERE year = $1', [year]),
    q('SELECT id, name, budget_amount FROM finance_projects', []),
    q("SELECT value FROM app_settings WHERE key='org_name' LIMIT 1", []),
    q('SELECT key, label FROM app_modules', []),
  ]);
  // Służby zapisane pod nazwą techniczną (team_type, np. „małe Avenit”) → nazwa modułu z menu.
  const labels = new Map();
  for (const m of moduleRows) {
    const tt = FINANCE_TEAM_TYPES[m.key];
    if (tt && m.label) labels.set(tt, m.label);
  }
  const areaLabel = (v) => labels.get(v) || v;
  const relabel = (r) => (r && r.category && r.kind !== 'income' ? { ...r, category: areaLabel(r.category) } : r);
  const expenses = allExpenses.filter((e) => ['approved', 'paid'].includes(e.status || 'approved'));
  // Wiersze surowe (wykluczenia porównują wartości techniczne); nazwy podmienia relabel po wykluczeniach.
  return { income, expenses, allExpenses, budget, projects, relabel, org: orgRows[0]?.value || 'Wspólnota' };
}

const groupBy = (rows, keyFn) => {
  const map = {};
  rows.forEach((r) => { const k = keyFn(r) || 'Inne'; map[k] = (map[k] || 0) + Number(r.amount || 0); });
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
};

/** Buduje mail-safe HTML raportu (tabele + słupki na div/bgcolor). */
export function buildReportHtml({ org, label, income, expenses, allExpenses = expenses, budget, projects = [], sections, filterLabel }) {
  const on = (k) => !sections || sections.has(k);
  const totalIncome = sum(income), totalExpense = sum(expenses);
  const planIncome = sum(budget.filter((b) => b.kind === 'income'), (b) => b.planned_amount);
  const planExpense = sum(budget.filter((b) => b.kind !== 'income'), (b) => b.planned_amount);
  const balance = totalIncome - totalExpense;

  const barRow = (name, val, max, color) => `
    <tr>
      <td style="padding:6px 10px;font-size:13px;color:#374151;white-space:nowrap">${esc(name)}</td>
      <td style="padding:6px 10px;width:60%">
        <div style="background:#f1f1ef;border-radius:4px;height:12px;width:100%">
          <div style="background:${color};height:12px;border-radius:4px;width:${Math.max(2, Math.round((val / (max || 1)) * 100))}%"></div>
        </div>
      </td>
      <td style="padding:6px 10px;font-size:13px;color:#111827;text-align:right;white-space:nowrap;font-weight:600">${pln(val)}</td>
    </tr>`;
  const barSection = (title, entries, empty) => {
    const top = entries.slice(0, 10);
    const max = top[0]?.[1] || 1;
    return `
    <h3 style="color:#111827;margin:20px 0 4px">${esc(title)}</h3>
    <table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:8px;overflow:hidden">
      ${top.map(([k, v], i) => barRow(k, v, max, CAT_COLORS[i % CAT_COLORS.length])).join('') || `<tr><td style="padding:8px 12px">${esc(empty)}</td></tr>`}
    </table>`;
  };
  const th = (t, right) => `<th style="padding:6px 10px;font-size:12px;color:#6b7280;text-align:${right ? 'right' : 'left'};border-bottom:1px solid #eee">${esc(t)}</th>`;
  const td = (t, right, strong) => `<td style="padding:6px 10px;font-size:13px;color:#111827;text-align:${right ? 'right' : 'left'};border-bottom:1px solid #f3f3f3;${strong ? 'font-weight:600;' : ''}white-space:nowrap">${t}</td>`;
  const table = (title, head, rows) => `
    <h3 style="color:#111827;margin:20px 0 4px">${esc(title)}</h3>
    <table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:8px;overflow:hidden">
      <tr>${head}</tr>${rows}
    </table>`;
  const sumRow = (k, v, strong) => `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;${strong ? 'font-weight:700;' : ''}">${esc(k)}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;${strong ? 'font-weight:700;' : ''}">${v}</td></tr>`;

  const parts = [];
  if (on('summary')) {
    parts.push(`
    <table style="width:100%;border-collapse:collapse;margin:16px 0;border:1px solid #eee;border-radius:8px;overflow:hidden">
      ${sumRow('Przychody (zrealizowane)', pln(totalIncome))}
      ${sumRow('Wydatki (zrealizowane)', pln(totalExpense))}
      ${sumRow('Bilans', pln(balance), true)}
      ${sumRow('Planowane przychody', pln(planIncome))}
      ${sumRow('Planowane wydatki', pln(planExpense))}
      ${sumRow('Realizacja budżetu wydatków', planExpense ? Math.round((totalExpense / planExpense) * 100) + '%' : '—')}
    </table>`);
  }
  if (on('byCostCategory')) parts.push(barSection('Wydatki wg kategorii', groupBy(expenses, (e) => e.cost_category || 'Bez kategorii'), 'Brak wydatków'));
  if (on('byArea')) parts.push(barSection('Wydatki wg służby / obszaru', groupBy(expenses, (e) => e.category), 'Brak wydatków'));
  if (on('byIncomeType')) parts.push(barSection('Wpływy wg kategorii', groupBy(income, (i) => i.type), 'Brak wpływów'));

  if (on('byProject')) {
    const ids = [...new Set([...expenses, ...income].map((r) => r.project_id).filter(Boolean).map(String))];
    const rows = ids.map((id) => {
      const p = projects.find((x) => String(x.id) === id);
      const own = (r) => String(r.project_id || '') === id;
      return { name: p?.name || '—', planned: Number(p?.budget_amount || 0), spent: sum(expenses.filter(own)), raised: sum(income.filter(own)) };
    }).sort((a, b) => b.spent - a.spent);
    parts.push(table('Projekty', th('Projekt') + th('Plan', 1) + th('Wydano', 1) + th('Zebrano', 1),
      rows.map((r) => `<tr>${td(esc(r.name))}${td(r.planned ? pln(r.planned) : '—', 1)}${td(pln(r.spent), 1, 1)}${td(pln(r.raised), 1)}</tr>`).join('')
        || `<tr><td colspan="4" style="padding:8px 12px">Brak transakcji przypisanych do projektów</td></tr>`));
  }
  if (on('byTag')) {
    const map = {};
    const add = (rows, field) => rows.forEach((r) => tagsOf(r).forEach((t) => { (map[t] = map[t] || { expense: 0, income: 0 })[field] += Number(r.amount || 0); }));
    add(expenses, 'expense'); add(income, 'income');
    const rows = Object.entries(map).sort((a, b) => (b[1].expense + b[1].income) - (a[1].expense + a[1].income));
    parts.push(table('Tagi', th('Tag') + th('Wydatki', 1) + th('Wpływy', 1),
      rows.map(([k, v]) => `<tr>${td(esc(k))}${td(pln(v.expense), 1)}${td(pln(v.income), 1)}</tr>`).join('')
        || `<tr><td colspan="3" style="padding:8px 12px">Brak otagowanych transakcji</td></tr>`));
  }
  if (on('topExpenses')) {
    const top = [...expenses].sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0)).slice(0, 8);
    parts.push(table('Największe wydatki', th('Opis') + th('Służba / obszar') + th('Kwota', 1),
      top.map((e) => `<tr>${td(esc(e.description || e.contractor || '—'))}${td(esc(e.category || ''))}${td(pln(e.amount), 1, 1)}</tr>`).join('')
        || `<tr><td colspan="3" style="padding:8px 12px">Brak wydatków</td></tr>`));
  }
  if (on('budgetExecution')) {
    const stats = {};
    const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
    budget.filter((b) => b.kind !== 'income').forEach((b) => {
      const k = b.category || '—';
      stats[k] = stats[k] || { planned: 0, realized: 0 };
      stats[k].planned += Number(b.planned_amount || 0);
      stats[k].realized += sum(expenses.filter((e) => norm(e.category) === norm(b.category) && norm(e.description) === norm(b.description)));
    });
    const rows = Object.entries(stats);
    if (rows.length) {
      parts.push(table('Realizacja budżetu', th('Służba / obszar') + th('Plan', 1) + th('Zrealizowano', 1) + th('%', 1),
        rows.map(([k, v]) => `<tr>${td(esc(k))}${td(pln(v.planned), 1)}${td(pln(v.realized), 1, 1)}${td(v.planned ? Math.round((v.realized / v.planned) * 100) + '%' : '—', 1)}</tr>`).join('')));
    }
  }
  if (on('unpaid')) {
    const unpaid = allExpenses.filter((e) => e.is_paid === false && ['approved', 'paid'].includes(e.status || 'approved'));
    if (unpaid.length) {
      parts.push(table('Nieopłacone zobowiązania', th('Kontrahent') + th('Termin') + th('Kwota', 1),
        unpaid.map((e) => `<tr>${td(esc(e.contractor || '—'))}${td(esc(e.due_date ? String(e.due_date).slice(0, 10) : ''))}${td(pln(e.amount), 1, 1)}</tr>`).join('')));
    }
  }

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:680px;margin:0 auto;color:#1f2937">
    <h2 style="color:#111827;margin-bottom:2px">Raport finansowy</h2>
    <p style="color:#6b7280;margin-top:0">${esc(org)} · <strong>${esc(label)}</strong></p>
    ${filterLabel ? `<p style="color:#374151;margin-top:0;font-size:13px">Wyłączone z raportu: ${esc(filterLabel)}</p>` : ''}
    ${parts.join('\n')}
    <p style="color:#9ca3af;font-size:12px;margin-top:20px">Wygenerowano automatycznie z modułu Finanse (Avenit).</p>
  </div>`;
}

/** Buduje CSV (BOM + średniki, przyjazny Excelowi pl-PL). */
export function buildReportCsv({ label, income, expenses }) {
  const totalIncome = sum(income), totalExpense = sum(expenses);
  const topCats = groupBy(expenses, (e) => e.cost_category || e.category || 'Inne');
  const clean = (s) => String(s == null ? '' : s).replace(/;/g, ',').replace(/\n/g, ' ');
  return '﻿'
    + `Raport finansowy;${clean(label)}\n\n`
    + 'Sekcja;Pozycja;Kwota\n'
    + `Podsumowanie;Przychody;${totalIncome}\n`
    + `Podsumowanie;Wydatki;${totalExpense}\n`
    + `Podsumowanie;Bilans;${totalIncome - totalExpense}\n`
    + topCats.map(([k, v]) => `Wydatki wg kategorii;${clean(k)};${v}`).join('\n');
}

/** Pełny raport (HTML + CSV + sumy) dla zakresu, z opcjonalnymi sekcjami i filtrami. */
export async function buildFinanceReport(db, { from, to, year, label, sections = null, exclude = null, filterLabel = null }) {
  const rows = await fetchReportRows(db, from, to, year);
  const f = normalizeExclude(exclude);
  const income = applyExclusions(rows.income, f, 'income');
  const expenses = applyExclusions(rows.expenses, f, 'expense').map(rows.relabel);
  const allExpenses = applyExclusions(rows.allExpenses, f, 'expense').map(rows.relabel);
  const budget = applyExclusions(rows.budget, f, 'budget').map(rows.relabel);
  const sectionSet = normalizeSections(sections);
  const fl = f ? String(filterLabel || '').slice(0, 300) : '';
  return {
    org: rows.org,
    html: buildReportHtml({ org: rows.org, label, income, expenses, allExpenses, budget, projects: rows.projects, sections: sectionSet, filterLabel: fl }),
    csv: buildReportCsv({ label, income, expenses }),
    totals: { income: sum(income), expense: sum(expenses), balance: sum(income) - sum(expenses) },
  };
}
