// Wysyłka raportu finansowego na żądanie — na wybrane adresy e-mail, dla wybranego zakresu.
// Gate: module:finance (FN_CAPABILITY). Buduje HTML+CSV przez lib/finance-report i wysyła przez sendEmail.
// Przyjmuje { from, to, periodLabel, recipients, attachments[] } lub { year, recipients } (wstecznie).
import { sendEmail } from '../lib/email.js';
import { buildFinanceReport } from '../lib/finance-report.js';

export const name = 'finance-report-email';
export const isPublic = false;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ATT = 6;
const MAX_B64 = 20 * 1024 * 1024; // ~15 MB pliku w base64

function sanitizeAttachments(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((a) => a && typeof a.filename === 'string' && typeof a.contentBase64 === 'string' && a.contentBase64.length > 0 && a.contentBase64.length <= MAX_B64)
    .slice(0, MAX_ATT)
    .map((a) => ({
      filename: a.filename.replace(/[^\w.\-]+/g, '_'),
      contentBase64: a.contentBase64,
      type: typeof a.type === 'string' ? a.type : 'application/octet-stream',
    }));
}

export default async function handler(req, reply) {
  const recipients = [...new Set((req.body?.recipients || []).map((e) => String(e).trim().toLowerCase()).filter((e) => EMAIL_RE.test(e)))];
  if (recipients.length === 0) return reply.code(400).send({ error: 'Podaj przynajmniej jeden poprawny adres e-mail.' });
  if (recipients.length > 50) return reply.code(400).send({ error: 'Za dużo adresatów (max 50).' });

  // Zakres: preferuj from/to; fallback do roku (wstecznie zgodne).
  let from = req.body?.from, to = req.body?.to, year, label = req.body?.periodLabel;
  if (DATE_RE.test(String(from)) && DATE_RE.test(String(to))) {
    year = parseInt(String(from).slice(0, 4));
    label = label || `${from} – ${to}`;
  } else {
    year = parseInt(req.body?.year) || new Date().getFullYear();
    from = `${year}-01-01`; to = `${year}-12-31`;
    label = label || String(year);
  }

  const report = await buildFinanceReport(req.db, { from, to, year, label });

  // Załączniki: od klienta (PDF/XLSX/CSV zbudowane u klienta) lub fallback serwerowy CSV.
  let attachments = sanitizeAttachments(req.body?.attachments);
  if (attachments.length === 0) {
    attachments = [{
      filename: `raport-finansowy-${year}.csv`,
      contentBase64: Buffer.from(report.csv, 'utf-8').toString('base64'),
      type: 'text/csv',
    }];
  }

  let sent = 0;
  for (const to2 of recipients) {
    try {
      await sendEmail({
        to: to2,
        subject: `Raport finansowy ${label} — ${report.org}`,
        html: report.html,
        attachments,
      });
      sent++;
    } catch (err) {
      req.log?.error?.({ err, to: to2 }, 'finance report email failed');
    }
  }
  if (sent === 0) return reply.code(502).send({ error: 'Nie udało się wysłać e-maili.' });
  return reply.send({ success: true, sent });
}
