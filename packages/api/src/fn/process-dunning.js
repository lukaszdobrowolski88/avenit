// Port edge function process-dunning: windykacja zaległych faktur (Resend).
// Oryginał: supabase/functions/process-dunning/index.ts.
// Operuje na bazie PLATFORM (invoices, tenants, dunning_config/log, subscriptions).
import { platformPool } from '../db.js';
import { config } from '../config.js';

export const name = 'process-dunning';
// Nie rejestrujemy jako trasa tenanta — wołane przez workera (run) i panel admina
// (/api/admin/dunning/run). Operuje na bazie platform, nie na bazie tenanta.
export const skipRoute = true;

async function sendResend(to, subject, html) {
  if (!config.RESEND_API_KEY) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.RESEND_API_KEY}` },
      body: JSON.stringify({ from: `Avenit <${config.RESEND_FROM_EMAIL}>`, to: [to], subject, html }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function formatAmount(grosze) {
  return `${((grosze || 0) / 100).toFixed(2)} PLN`;
}

function emailContent(stage, data) {
  const invoiceLabel = data.invoice_number;
  const amount = formatAmount(data.amount);
  const base = (title, body) => ({
    subject: title,
    html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto">
      <h2>${title}</h2>
      <p>Dotyczy faktury <strong>${invoiceLabel}</strong> na kwotę <strong>${amount}</strong>
         (${data.days_overdue} dni po terminie).</p>
      ${body}
      <hr><p style="color:#6b7280;font-size:13px">Avenit — Zarządzanie kościołem<br>
      W razie problemów z płatnością napisz: kontakt@avenit.pl</p></div>`,
  });
  switch (stage) {
    case 1: return base('Przypomnienie o płatności', '<p>Prosimy o uregulowanie należności.</p>');
    case 2: return base('Pilne: nieuregulowana faktura', '<p>Faktura wciąż pozostaje nieopłacona. Prosimy o pilną płatność.</p>');
    case 3: return base('Ostatnie ostrzeżenie', '<p>Brak płatności skutkuje zawieszeniem konta w ciągu 7 dni.</p>');
    case 4: return base('Konto zostało zawieszone', '<p>Z powodu braku płatności Twoje konto Avenit zostało zawieszone. Ureguluj należność, aby je odblokować.</p>');
    default: return { subject: '', html: '' };
  }
}

// Główna logika (wołana przez workera codziennie oraz ręcznie z panelu).
export async function run(pool = platformPool, ctx = {}) {
  const { rows: items } = await pool.query(`SELECT * FROM process_dunning()`);
  const results = { processed: 0, emailsSent: 0, accountsSuspended: 0, errors: [] };

  for (const item of items) {
    if (!item.next_stage || item.next_stage === 0) continue;
    try {
      const { rows: tRows } = await pool.query(`SELECT name FROM tenants WHERE id = $1`, [item.tenant_id]);
      const { rows: iRows } = await pool.query(`SELECT total FROM invoices WHERE id = $1`, [item.invoice_id]);
      const data = { ...item, tenant_name: tRows[0]?.name || 'Klient', amount: iRows[0]?.total || 0 };

      if (item.action_to_take === 'email') {
        const { subject, html } = emailContent(item.next_stage, data);
        if (subject && html) {
          if (await sendResend(item.tenant_email, subject, html)) results.emailsSent++;
          await pool.query(
            `INSERT INTO dunning_log (tenant_id, invoice_id, stage, action_taken, email_sent_to, email_sent_at)
             VALUES ($1, $2, $3, 'email', $4, now())`,
            [item.tenant_id, item.invoice_id, item.next_stage, item.tenant_email]
          );
        }
      } else if (item.action_to_take === 'suspend') {
        await pool.query(`UPDATE tenants SET status = 'suspended' WHERE id = $1`, [item.tenant_id]);
        await pool.query(
          `UPDATE tenant_subscriptions SET status = 'suspended'
            WHERE tenant_id = $1 AND status IN ('trialing','active','past_due')`,
          [item.tenant_id]
        );
        const { subject, html } = emailContent(4, data);
        await sendResend(item.tenant_email, subject, html);
        await pool.query(
          `INSERT INTO dunning_log (tenant_id, invoice_id, stage, action_taken, email_sent_to, email_sent_at)
           VALUES ($1, $2, $3, 'suspend', $4, now())`,
          [item.tenant_id, item.invoice_id, item.next_stage, item.tenant_email]
        );
        results.accountsSuspended++;
      }
      results.processed++;
    } catch (err) {
      ctx.log?.(`dunning błąd tenant ${item.tenant_id}: ${err.message}`);
      results.errors.push(`Tenant ${item.tenant_id}: ${err.message}`);
    }
  }
  return results;
}

// Endpoint HTTP (ręczne uruchomienie z panelu admina).
export default async function handler(req, reply) {
  const results = await run(platformPool, { log: (m) => req.log.info(m) });
  return reply.send({ success: true, results, timestamp: new Date().toISOString() });
}
