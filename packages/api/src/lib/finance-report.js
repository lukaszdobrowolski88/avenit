// Wspólny builder raportu finansowego (serwer): pobranie danych + mail-safe HTML + CSV.
// Używany przez fn/finance-report-email.js (na żądanie) i fn/finance-report-schedule.js (cron).
// HTML celowo bez SVG — Gmail/Outlook wycinają SVG; słupki robione na <div> z bgcolor + width%.

export const pln = (n) => Number(n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const CAT_COLORS = ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834'];
const sum = (arr, f = (x) => x.amount) => arr.reduce((a, x) => a + Number(f(x) || 0), 0);

/** Pobiera wiersze raportu dla zakresu dat (+ budżet dla roku zakresu) i nazwę organizacji. */
export async function fetchReportRows(db, from, to, year) {
  const q = async (sql, params) => { try { const { rows } = await db.query(sql, params); return rows; } catch { return []; } };
  const [income, expenses, budget, orgRows] = await Promise.all([
    q('SELECT date, type, source, amount FROM income_transactions WHERE date >= $1 AND date <= $2', [from, to]),
    q(`SELECT payment_date, category, cost_category, contractor, description, amount FROM expense_transactions
       WHERE payment_date >= $1 AND payment_date <= $2 AND COALESCE(status, 'approved') IN ('approved', 'paid')`, [from, to]),
    q('SELECT kind, category, description, planned_amount FROM budget_items WHERE year = $1', [year]),
    q("SELECT value FROM app_settings WHERE key='org_name' LIMIT 1", []),
  ]);
  return { income, expenses, budget, org: orgRows[0]?.value || 'Wspólnota' };
}

/** Buduje mail-safe HTML raportu (tabele + słupki na div/bgcolor). */
export function buildReportHtml({ org, label, income, expenses, budget }) {
  const totalIncome = sum(income), totalExpense = sum(expenses);
  const planIncome = sum(budget.filter((b) => b.kind === 'income'), (b) => b.planned_amount);
  const planExpense = sum(budget.filter((b) => b.kind !== 'income'), (b) => b.planned_amount);
  const balance = totalIncome - totalExpense;

  const byCat = {};
  expenses.forEach((e) => { const k = e.cost_category || e.category || 'Inne'; byCat[k] = (byCat[k] || 0) + Number(e.amount || 0); });
  const topCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxCat = topCats[0]?.[1] || 1;

  const barRow = (name, val, max, color) => `
    <tr>
      <td style="padding:6px 10px;font-size:13px;color:#374151;white-space:nowrap">${esc(name)}</td>
      <td style="padding:6px 10px;width:60%">
        <div style="background:#f1f1ef;border-radius:4px;height:12px;width:100%">
          <div style="background:${color};height:12px;border-radius:4px;width:${Math.max(2, Math.round((val / max) * 100))}%"></div>
        </div>
      </td>
      <td style="padding:6px 10px;font-size:13px;color:#111827;text-align:right;white-space:nowrap;font-weight:600">${pln(val)}</td>
    </tr>`;

  const sumRow = (k, v, strong) => `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;${strong ? 'font-weight:700;' : ''}">${esc(k)}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;${strong ? 'font-weight:700;' : ''}">${v}</td></tr>`;

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:680px;margin:0 auto;color:#1f2937">
    <h2 style="color:#111827;margin-bottom:2px">Raport finansowy</h2>
    <p style="color:#6b7280;margin-top:0">${esc(org)} · <strong>${esc(label)}</strong></p>

    <table style="width:100%;border-collapse:collapse;margin:16px 0;border:1px solid #eee;border-radius:8px;overflow:hidden">
      ${sumRow('Przychody (zrealizowane)', pln(totalIncome))}
      ${sumRow('Wydatki (zrealizowane)', pln(totalExpense))}
      ${sumRow('Bilans', pln(balance), true)}
      ${sumRow('Planowane przychody', pln(planIncome))}
      ${sumRow('Planowane wydatki', pln(planExpense))}
      ${sumRow('Realizacja budżetu wydatków', planExpense ? Math.round((totalExpense / planExpense) * 100) + '%' : '—')}
    </table>

    <h3 style="color:#111827;margin-bottom:4px">Wydatki wg kategorii</h3>
    <table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:8px;overflow:hidden">
      ${topCats.map(([k, v], i) => barRow(k, v, maxCat, CAT_COLORS[i % CAT_COLORS.length])).join('') || '<tr><td style="padding:8px 12px">Brak wydatków</td></tr>'}
    </table>

    <p style="color:#9ca3af;font-size:12px;margin-top:20px">Wygenerowano automatycznie z modułu Finanse (Avenit).</p>
  </div>`;
}

/** Buduje CSV (BOM + średniki, przyjazny Excelowi pl-PL). */
export function buildReportCsv({ label, income, expenses }) {
  const totalIncome = sum(income), totalExpense = sum(expenses);
  const byCat = {};
  expenses.forEach((e) => { const k = e.cost_category || e.category || 'Inne'; byCat[k] = (byCat[k] || 0) + Number(e.amount || 0); });
  const topCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const clean = (s) => String(s == null ? '' : s).replace(/;/g, ',').replace(/\n/g, ' ');
  return '﻿'
    + `Raport finansowy;${clean(label)}\n\n`
    + 'Sekcja;Pozycja;Kwota\n'
    + `Podsumowanie;Przychody;${totalIncome}\n`
    + `Podsumowanie;Wydatki;${totalExpense}\n`
    + `Podsumowanie;Bilans;${totalIncome - totalExpense}\n`
    + topCats.map(([k, v]) => `Wydatki wg kategorii;${clean(k)};${v}`).join('\n');
}

/** Pełny raport (HTML + CSV + sumy) dla zakresu. */
export async function buildFinanceReport(db, { from, to, year, label }) {
  const { income, expenses, budget, org } = await fetchReportRows(db, from, to, year);
  return {
    org,
    html: buildReportHtml({ org, label, income, expenses, budget }),
    csv: buildReportCsv({ label, income, expenses }),
    totals: { income: sum(income), expense: sum(expenses), balance: sum(income) - sum(expenses) },
  };
}
