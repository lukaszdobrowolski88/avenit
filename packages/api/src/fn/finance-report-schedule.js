// Worker: automatyczna wysyłka raportu finansowego wg harmonogramu (finance_report_schedules).
// Dla każdego należnego harmonogramu buduje raport za ZAKOŃCZONY okres (poprz. miesiąc/kwartał/rok),
// wysyła mailem i przesuwa next_run_date. Odporny na brak tabeli (tenanty przed migracją 041).
import { sendEmail } from '../lib/email.js';
import { buildFinanceReport } from '../lib/finance-report.js';

export const name = 'finance-report-schedule';
export const skipRoute = true; // wyłącznie worker

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MONTHS_PL = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
const iso = (d) => d.toISOString().slice(0, 10);
const lastDay = (y, m0) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

/** Zakres zakończonego okresu względem dnia uruchomienia. */
export function completedPeriod(cadence, today) {
  const d = new Date(today + 'T00:00:00Z');
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  if (cadence === 'yearly') {
    const py = y - 1;
    return { from: `${py}-01-01`, to: `${py}-12-31`, year: py, label: String(py) };
  }
  if (cadence === 'quarterly') {
    let q = Math.floor(m / 3) - 1, py = y;      // poprzedni kwartał
    if (q < 0) { q = 3; py = y - 1; }
    const sm = q * 3;                            // 0,3,6,9
    return {
      from: `${py}-${String(sm + 1).padStart(2, '0')}-01`,
      to: `${py}-${String(sm + 3).padStart(2, '0')}-${String(lastDay(py, sm + 2)).padStart(2, '0')}`,
      year: py, label: `Q${q + 1} ${py}`,
    };
  }
  // monthly
  let pm = m - 1, py = y;
  if (pm < 0) { pm = 11; py = y - 1; }
  return {
    from: `${py}-${String(pm + 1).padStart(2, '0')}-01`,
    to: `${py}-${String(pm + 1).padStart(2, '0')}-${String(lastDay(py, pm)).padStart(2, '0')}`,
    year: py, label: `${MONTHS_PL[pm]} ${py}`,
  };
}

/** Pierwszy dzień następnego okresu po dniu uruchomienia. */
export function nextRunDate(cadence, today) {
  const d = new Date(today + 'T00:00:00Z');
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  if (cadence === 'yearly') return `${y + 1}-01-01`;
  if (cadence === 'quarterly') {
    const nm = (Math.floor(m / 3) + 1) * 3;     // początek następnego kwartału
    return nm > 11 ? `${y + 1}-01-01` : `${y}-${String(nm + 1).padStart(2, '0')}-01`;
  }
  const nm = m + 1;
  return nm > 11 ? `${y + 1}-01-01` : `${y}-${String(nm + 1).padStart(2, '0')}-01`;
}

export async function runForTenant(pool, ctx = {}) {
  const log = ctx.log || (() => {});
  const today = iso(new Date());

  let schedules;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM finance_report_schedules
        WHERE is_active = true AND next_run_date IS NOT NULL AND next_run_date <= $1`,
      [today]
    );
    schedules = rows;
  } catch (err) {
    log(`finance-report-schedule: pomijam (${err.message})`);
    return { sent: 0 };
  }

  let sentTotal = 0;
  for (const s of schedules) {
    try {
      const recipients = [...new Set((s.recipients || []).map((e) => String(e).trim().toLowerCase()).filter((e) => EMAIL_RE.test(e)))];
      const period = completedPeriod(s.cadence, today);
      const report = await buildFinanceReport(pool, period);

      const attachments = s.include_csv === false ? [] : [{
        filename: `raport-finansowy-${period.year}.csv`,
        contentBase64: Buffer.from(report.csv, 'utf-8').toString('base64'),
        type: 'text/csv',
      }];

      for (const to of recipients) {
        try {
          await sendEmail({ to, subject: `Raport finansowy ${period.label} — ${report.org}`, html: report.html, attachments });
          sentTotal++;
        } catch (err) {
          log(`finance-report-schedule: wysyłka ${to} błąd: ${err.message}`);
        }
      }

      await pool.query(
        `UPDATE finance_report_schedules SET next_run_date = $1, last_run_at = now(), updated_at = now() WHERE id = $2`,
        [nextRunDate(s.cadence, today), s.id]
      );
    } catch (err) {
      log(`finance-report-schedule: harmonogram ${s.id} błąd: ${err.message}`);
    }
  }

  if (sentTotal) log(`finance-report-schedule: wysłano ${sentTotal} raportów`);
  return { sent: sentTotal };
}
