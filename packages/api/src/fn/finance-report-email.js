// Wysyłka raportu finansowego na żądanie — na wybrane adresy e-mail.
// Gate: module:finance (FN_CAPABILITY). Buduje podsumowanie roku i wysyła przez sendEmail.
import { sendEmail } from '../lib/email.js';

export const name = 'finance-report-email';
export const isPublic = false;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const pln = (n) => Number(n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';

export default async function handler(req, reply) {
  const year = parseInt(req.body?.year) || new Date().getFullYear();
  const recipients = [...new Set((req.body?.recipients || []).map((e) => String(e).trim().toLowerCase()).filter((e) => EMAIL_RE.test(e)))];
  if (recipients.length === 0) return reply.code(400).send({ error: 'Podaj przynajmniej jeden poprawny adres e-mail.' });
  if (recipients.length > 50) return reply.code(400).send({ error: 'Za dużo adresatów (max 50).' });

  const from = `${year}-01-01`, to = `${year}-12-31`;
  let org = 'Wspólnota';
  try {
    const { rows } = await req.db.query(`SELECT value FROM app_settings WHERE key='org_name' LIMIT 1`);
    if (rows[0]?.value) org = rows[0].value;
  } catch { /* generic */ }

  const q = async (sql, params) => { try { const { rows } = await req.db.query(sql, params); return rows; } catch { return []; } };
  const income = await q(`SELECT type, amount FROM income_transactions WHERE date >= $1 AND date <= $2`, [from, to]);
  const expenses = await q(`SELECT category, cost_category, amount FROM expense_transactions WHERE payment_date >= $1 AND payment_date <= $2`, [from, to]);
  const budget = await q(`SELECT kind, planned_amount FROM budget_items WHERE year = $1`, [year]);

  const sum = (arr, f = (x) => x.amount) => arr.reduce((a, x) => a + Number(f(x) || 0), 0);
  const totalIncome = sum(income), totalExpense = sum(expenses);
  const planIncome = sum(budget.filter((b) => b.kind === 'income'), (b) => b.planned_amount);
  const planExpense = sum(budget.filter((b) => b.kind !== 'income'), (b) => b.planned_amount);

  const byCat = {};
  expenses.forEach((e) => { const k = e.cost_category || e.category || 'Inne'; byCat[k] = (byCat[k] || 0) + Number(e.amount || 0); });
  const topCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 8);

  const row = (label, val, strong) => `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;${strong ? 'font-weight:700;' : ''}">${label}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;${strong ? 'font-weight:700;' : ''}">${val}</td></tr>`;
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1f2937">
    <h2 style="color:#111827">Raport finansowy ${year}</h2>
    <p style="color:#6b7280">${org}</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;border:1px solid #eee;border-radius:8px;overflow:hidden">
      ${row('Przychody (zrealizowane)', pln(totalIncome))}
      ${row('Wydatki (zrealizowane)', pln(totalExpense))}
      ${row('Bilans', pln(totalIncome - totalExpense), true)}
      ${row('Planowane przychody', pln(planIncome))}
      ${row('Planowane wydatki', pln(planExpense))}
      ${row('Planowany bilans', pln(planIncome - planExpense), true)}
      ${row('Realizacja budżetu wydatków', planExpense ? Math.round((totalExpense / planExpense) * 100) + '%' : '—')}
    </table>
    <h3 style="color:#111827">Wydatki wg kategorii</h3>
    <table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:8px;overflow:hidden">
      ${topCats.map(([k, v]) => row(k, pln(v))).join('') || '<tr><td style="padding:8px 12px">Brak wydatków</td></tr>'}
    </table>
    <p style="color:#9ca3af;font-size:12px;margin-top:20px">Wygenerowano automatycznie z modułu Finanse.</p>
  </div>`;

  const csv = '﻿' + 'Sekcja;Pozycja;Kwota\n'
    + `Podsumowanie;Przychody;${totalIncome}\nPodsumowanie;Wydatki;${totalExpense}\nPodsumowanie;Bilans;${totalIncome - totalExpense}\n`
    + topCats.map(([k, v]) => `Wydatki wg kategorii;${String(k).replace(/;/g, ',')};${v}`).join('\n');

  let sent = 0;
  for (const to2 of recipients) {
    try {
      await sendEmail({
        to: to2,
        subject: `Raport finansowy ${year} — ${org}`,
        html,
        attachments: [{ filename: `raport-finansowy-${year}.csv`, contentBase64: Buffer.from(csv, 'utf-8').toString('base64'), type: 'text/csv' }],
      });
      sent++;
    } catch (err) {
      req.log?.error?.({ err, to: to2 }, 'finance report email failed');
    }
  }
  if (sent === 0) return reply.code(502).send({ error: 'Nie udało się wysłać e-maili.' });
  return reply.send({ success: true, sent });
}
