// Port edge function przelewy24-webhook: callback statusu płatności z P24.
// Oryginał: supabase/functions/przelewy24-webhook/index.ts. Publiczny.
// Transakcje żyją w bazie PLATFORM.
import { platformPool, getTenantPool } from '../db.js';
import { config } from '../config.js';
import { P24_API_URL, p24Checksum, p24AuthHeader } from '../lib/p24.js';

async function sendDonationThanks(email, amount, currency) {
  if (!config.RESEND_API_KEY || !email) return;
  const kwota = `${Number(amount || 0).toFixed(2)} ${currency || 'PLN'}`;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.RESEND_API_KEY}` },
      body: JSON.stringify({
        from: `Avenit <${config.RESEND_FROM_EMAIL || 'noreply@avenit.pl'}>`,
        to: [email],
        subject: 'Dziękujemy za dar 🙏',
        html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1f2937">
          <h2>Dziękujemy za Twoją hojność!</h2>
          <p>Potwierdzamy otrzymanie darowizny na kwotę <strong>${kwota}</strong>.</p>
          <p>Niech Bóg Ci błogosławi. 🙏</p>
          <hr><p style="color:#9ca3af;font-size:12px">Avenit — wiadomość wygenerowana automatycznie</p></div>`,
      }),
    });
  } catch { /* nie blokuj webhooka */ }
}

// Domknięcie darowizny w bazie tenanta (dla płatności z modułu Dawania).
async function finalizeDonation(req, transaction, ok) {
  const meta = transaction.gateway_response || {};
  if (meta.purpose !== 'donation' || !meta.tenant_db || !meta.donation_id) return;
  try {
    const tpool = getTenantPool(meta.tenant_db);
    const { rows } = await tpool.query(
      `UPDATE donations SET status = $1, payment_transaction_id = $2, updated_at = now()
        WHERE id = $3 RETURNING donor_email, amount, currency`,
      [ok ? 'completed' : 'failed', transaction.id, meta.donation_id]
    );
    if (ok && rows[0]?.donor_email) {
      await sendDonationThanks(rows[0].donor_email, rows[0].amount, rows[0].currency);
    }
  } catch (err) {
    req.log.error({ err }, 'P24 webhook: domknięcie darowizny nieudane');
  }
}

export const name = 'przelewy24-webhook';
export const isPublic = true;

export default async function handler(req, reply) {
  const b = req.body || {};
  const merchantId = String(b.merchantId);
  const sessionId = String(b.sessionId);
  const amount = String(b.amount);
  const currency = String(b.currency);
  const orderId = String(b.orderId);

  if (merchantId !== String(config.P24_MERCHANT_ID)) {
    req.log.error({ merchantId }, 'P24 webhook: nieprawidłowy merchantId');
    return reply.code(400).send('Invalid merchantId');
  }

  const { rows } = await platformPool.query(
    `SELECT * FROM payment_transactions WHERE gateway_session_id = $1`,
    [sessionId]
  );
  const transaction = rows[0];
  if (!transaction) {
    req.log.error({ sessionId }, 'P24 webhook: transakcja nie znaleziona');
    return reply.code(404).send('Transaction not found');
  }

  const posId = parseInt(config.P24_POS_ID || config.P24_MERCHANT_ID, 10);
  const verifySign = p24Checksum({
    sessionId, orderId: parseInt(orderId, 10), amount: parseInt(amount, 10), currency,
  });
  const verifyData = {
    merchantId: parseInt(config.P24_MERCHANT_ID, 10), posId, sessionId,
    amount: parseInt(amount, 10), currency, orderId: parseInt(orderId, 10), sign: verifySign,
  };

  const verifyResponse = await fetch(`${P24_API_URL}/api/v1/transaction/verify`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: p24AuthHeader() },
    body: JSON.stringify(verifyData),
  });
  const verifyResult = await verifyResponse.json();

  if (verifyResult.data?.status === 'success') {
    // Trigger update_invoice_on_payment (baza platform) sam opłaci fakturę i odblokuje tenanta.
    await platformPool.query(
      `UPDATE payment_transactions
          SET status = 'completed', gateway_transaction_id = $1, completed_at = now(),
              gateway_response = $2
        WHERE id = $3`,
      [orderId, JSON.stringify({ ...transaction.gateway_response, verify: verifyResult }), transaction.id]
    );
    await finalizeDonation(req, transaction, true);
  } else {
    await platformPool.query(
      `UPDATE payment_transactions
          SET status = 'failed', error_message = $1, gateway_response = $2
        WHERE id = $3`,
      [verifyResult.error || 'Verification failed',
       JSON.stringify({ ...transaction.gateway_response, verify: verifyResult }), transaction.id]
    );
    await finalizeDonation(req, transaction, false);
  }

  return reply.send('OK');
}
