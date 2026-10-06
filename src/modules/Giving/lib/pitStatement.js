// Wydruk rocznego zestawienia darowizn (do PIT) — wspólny dla zakładki „Zestawienia PIT”
// i karty darczyńcy. Dokument jest po polsku (dokument podatkowy w PL), wszystkie dane
// z bazy przechodzą przez escapeHtml (imię darczyńcy pochodzi m.in. z publicznej strony /give).
import { escapeHtml } from '../../../lib/html';
import { formatMoney, formatDate, methodLabel, splitForStatement } from './givingApi';
import { appLocale } from '../../../i18n';

// Nazwa organizacji na wydruku: zapamiętana w przeglądarce (pole w „Zestawieniach PIT”),
// inaczej z ustawień aplikacji.
const ORG_KEY = 'avenit.giving.orgName';
export function readSavedOrgName() {
  try { return localStorage.getItem(ORG_KEY) || ''; } catch { return ''; }
}
export function saveOrgName(v) {
  try { if (v) localStorage.setItem(ORG_KEY, v); else localStorage.removeItem(ORG_KEY); } catch { /* tryb prywatny */ }
}
export async function loadOrgNameFromSettings(supabase) {
  try {
    const order = ['org_name', 'church_name', 'organization_name', 'app_name'];
    const { data } = await supabase.from('app_settings').select('key, value').in('key', order);
    const found = order.map((k) => (data || []).find((r) => r.key === k && r.value)).find(Boolean);
    return found ? found.value : '';
  } catch { return ''; }
}

const row = (d, fundsById) => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(formatDate(d.donation_date))}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(fundsById[d.fund_id]?.name || 'Darowizna')}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(methodLabel(d.method))}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${escapeHtml(formatMoney(d.amount, d.currency))}</td>
      </tr>`;

const table = (items, fundsById) => `
      <table>
        <thead><tr><th>Data</th><th>Cel</th><th>Forma wpłaty</th><th style="text-align:right">Kwota</th></tr></thead>
        <tbody>${items.map((d) => row(d, fundsById)).join('')}</tbody>
      </table>`;

/**
 * @param {{orgName:string, year:number, donor:{name,address,email}, items:Array, fundsById:Object}} p
 * @returns {{html:string|null, deductibleTotal:number, cashTotal:number}}
 */
export function buildStatementHtml({ orgName, year, donor, items, fundsById = {} }) {
  const sorted = (items || []).slice().sort((a, b) => String(a.donation_date || '').localeCompare(String(b.donation_date || '')));
  const { deductible, cash, deductibleTotal, cashTotal } = splitForStatement(sorted, fundsById);
  if (!deductible.length && !cash.length) return { html: null, deductibleTotal: 0, cashTotal: 0 };
  const org = escapeHtml(orgName || '');
  const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Zestawienie darowizn ${escapeHtml(year)} — ${escapeHtml(donor.name)}</title>
      <style>
        body{font-family:'Manrope','Segoe UI',Arial,sans-serif;color:#1f2937;max-width:720px;margin:32px auto;padding:0 24px;line-height:1.5}
        h1{font-size:20px;margin:0 0 4px} h2{font-size:15px;margin:22px 0 4px} .muted{color:#6b7280;font-size:13px}
        .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #8A6606;padding-bottom:14px;margin-bottom:20px}
        table{width:100%;border-collapse:collapse;margin-top:10px;font-size:14px}
        th{text-align:left;padding:6px 10px;border-bottom:2px solid #d1d5db;font-size:12px;text-transform:uppercase;color:#6b7280}
        .total{margin-top:12px;text-align:right;font-size:17px;font-weight:700}
        .box{background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin:16px 0}
        .note{font-size:12px;color:#6b7280;margin-top:6px}
        .foot{margin-top:28px;font-size:12px;color:#6b7280;border-top:1px solid #eee;padding-top:12px}
        @media print{body{margin:0}}
      </style></head><body>
      <div class="head">
        <div><h1>${org || 'Zestawienie darowizn'}</h1><div class="muted">Roczne zestawienie darowizn za rok ${escapeHtml(year)}</div></div>
        <div class="muted" style="text-align:right">Data wystawienia:<br>${escapeHtml(new Date().toLocaleDateString(appLocale()))}</div>
      </div>
      <div class="box">
        <strong>Darczyńca:</strong> ${escapeHtml(donor.name)}<br>
        ${donor.address ? `<span class="muted">Adres: ${escapeHtml(donor.address)}</span><br>` : ''}
        ${donor.email ? `<span class="muted">E-mail: ${escapeHtml(donor.email)}</span>` : ''}
      </div>
      ${deductible.length ? `
      <h2>Darowizny wpłacone na rachunek</h2>
      ${table(deductible, fundsById)}
      <div class="total">Razem: ${escapeHtml(formatMoney(deductibleTotal))}</div>` : ''}
      ${cash.length ? `
      <h2>Darowizny gotówkowe</h2>
      ${table(cash, fundsById)}
      <div class="total" style="font-size:15px">Razem gotówką: ${escapeHtml(formatMoney(cashTotal))}</div>
      <div class="note">Darowizny przekazane gotówką nie podlegają odliczeniu w zeznaniu PIT — odliczenie wymaga dowodu wpłaty na rachunek bankowy obdarowanego (art. 26 ust. 7 ustawy o PIT).</div>` : ''}
      <div class="foot">
        Niniejsze zestawienie potwierdza darowizny przekazane na rzecz ${org || 'organizacji'} w roku ${escapeHtml(year)}.
        Darowizny na cele kultu religijnego / działalności pożytku publicznego wpłacone na rachunek mogą podlegać
        odliczeniu od podstawy opodatkowania zgodnie z obowiązującymi przepisami (ustawa o PIT). Dokument wygenerowany automatycznie.
      </div>
      <script>window.onload=function(){window.print();}</script>
      </body></html>`;
  return { html, deductibleTotal, cashTotal };
}
