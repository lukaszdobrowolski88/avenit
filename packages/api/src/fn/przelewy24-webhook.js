// Port edge function przelewy24-webhook: callback statusu płatności z P24.
// Oryginał: supabase/functions/przelewy24-webhook/index.ts. Publiczny.
// Transakcje żyją w bazie PLATFORM.
//
// Bezpieczeństwo (audyt 2026-10, runda 3) — zanim transakcja zostanie oznaczona jako opłacona:
//   1. podpis powiadomienia (sha384 z naszym CRC) i merchantId,
//   2. transakcja po sessionId (+ bramka P24) i tego samego tenanta co host wywołania,
//   3. kwota i waluta z powiadomienia = kwota/waluta ZAREJESTROWANA (a dla faktury także
//      = suma i waluta faktury tego tenanta) — wcześniej 0,01 zł opłacało dowolną fakturę,
//   4. weryfikacja w P24 kwotą z bazy (nie z powiadomienia),
//   5. idempotencja: ponowne powiadomienie nie zmienia już opłaconej transakcji ani nie
//      wysyła drugi raz podziękowania za dar.
import { platformPool, getTenantPool } from '../db.js';
import { config } from '../config.js';
import { sendEmail } from '../lib/email.js';
import { P24_API_URL, p24Checksum, p24AuthHeader, p24Configured, verifyP24NotificationSign } from '../lib/p24.js';

export const name = 'przelewy24-webhook';
export const isPublic = true;

// Zależności podmienialne w testach (bez prawdziwej bramki, bazy i poczty).
export const deps = {
  platformPool,
  getTenantPool,
  sendEmail,
  fetch: (...args) => fetch(...args),
};

async function sendDonationThanks(email, amount, currency) {
  if (!email) return;
  const kwota = `${Number(amount || 0).toFixed(2)} ${currency || 'PLN'}`;
  try {
    await deps.sendEmail({
      to: email,
      subject: 'Dziękujemy za dar',
      html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1f2937">
          <h2>Dziękujemy za Twoją hojność!</h2>
          <p>Potwierdzamy otrzymanie darowizny na kwotę <strong>${kwota}</strong>.</p>
          <p>Niech Bóg Ci błogosławi.</p>
          <hr><p style="color:#9ca3af;font-size:12px">Avenit — wiadomość wygenerowana automatycznie</p></div>`,
    });
  } catch { /* nie blokuj webhooka */ }
}

// Domknięcie darowizny w bazie tenanta (dla płatności z modułu Dawania). Tylko oczekująca
// darowizna o tej samej kwocie — powtórka powiadomienia niczego nie zmienia.
async function finalizeDonation(req, transaction, ok) {
  const meta = transaction.gateway_response || {};
  if (meta.purpose !== 'donation' || !meta.tenant_db || !meta.donation_id) return;
  try {
    const tpool = deps.getTenantPool(meta.tenant_db);
    const { rows } = await tpool.query(
      `UPDATE donations SET status = $1, payment_transaction_id = $2, updated_at = now()
        WHERE id = $3 AND status = 'pending' AND round(amount * 100) = $4
        RETURNING donor_email, amount, currency`,
      [ok ? 'completed' : 'failed', transaction.id, meta.donation_id, Number(transaction.amount)]
    );
    if (ok && rows[0]?.donor_email) {
      await sendDonationThanks(rows[0].donor_email, rows[0].amount, rows[0].currency);
    }
  } catch (err) {
    req.log.error({ err }, 'P24 webhook: domknięcie darowizny nieudane');
  }
}

const txCurrency = (tx) => String(tx.currency || 'PLN').toUpperCase();

// Czy powiadomienie zgadza się z tym, co zarejestrowaliśmy? Zwraca kod problemu albo null.
export async function paymentMismatch(pool, tx, { amount, currency }) {
  if (Number(amount) !== Number(tx.amount)) return 'amount_mismatch';
  if (String(currency || '').toUpperCase() !== txCurrency(tx)) return 'currency_mismatch';
  if (tx.invoice_id) {
    const { rows } = await pool.query(
      `SELECT tenant_id, total, currency FROM invoices WHERE id = $1`,
      [tx.invoice_id]
    );
    const inv = rows[0];
    if (!inv || String(inv.tenant_id) !== String(tx.tenant_id)) return 'invoice_mismatch';
    if (Number(inv.total) !== Number(tx.amount)) return 'invoice_amount_mismatch';
    if (String(inv.currency || 'PLN').toUpperCase() !== txCurrency(tx)) return 'invoice_currency_mismatch';
  }
  return null;
}

export default async function handler(req, reply) {
  if (!p24Configured()) return reply.code(503).send('Not configured');
  const b = req.body || {};
  const pool = deps.platformPool;

  if (String(b.merchantId) !== String(config.P24_MERCHANT_ID)) {
    req.log.error({ merchantId: b.merchantId }, 'P24 webhook: nieprawidłowy merchantId');
    return reply.code(400).send('Invalid merchantId');
  }
  if (!verifyP24NotificationSign(b)) {
    req.log.error({ sessionId: b.sessionId }, 'P24 webhook: nieprawidłowy podpis powiadomienia');
    return reply.code(400).send('Invalid sign');
  }

  const sessionId = String(b.sessionId || '');
  const orderId = Number(b.orderId);
  const amount = Number(b.amount);
  const currency = String(b.currency || '').toUpperCase();
  if (!sessionId || sessionId.length > 100 || !Number.isSafeInteger(orderId) || !Number.isSafeInteger(amount)) {
    return reply.code(400).send('Invalid payload');
  }

  const { rows } = await pool.query(
    `SELECT * FROM payment_transactions WHERE gateway_session_id = $1 AND gateway = 'przelewy24'`,
    [sessionId]
  );
  const transaction = rows[0];
  // Transakcja innego tenanta niż host wywołania (urlStatus wskazuje domenę tenanta) = brak.
  if (!transaction || (req.tenant && String(transaction.tenant_id) !== String(req.tenant.id))) {
    req.log.error({ sessionId }, 'P24 webhook: transakcja nie znaleziona');
    return reply.code(404).send('Transaction not found');
  }

  // Idempotencja: już opłacona — nic nie zmieniamy (P24 ponawia powiadomienia).
  if (transaction.status === 'completed') return reply.send('OK');

  const mismatch = await paymentMismatch(pool, transaction, { amount, currency });
  if (mismatch) {
    req.log.error({ sessionId, mismatch, amount, expected: transaction.amount }, 'P24 webhook: kwota/waluta niezgodna');
    await pool.query(
      `UPDATE payment_transactions
          SET status = 'failed', error_message = $1, gateway_response = $2
        WHERE id = $3 AND status <> 'completed'`,
      [`Niezgodna płatność: ${mismatch}`,
       JSON.stringify({ ...transaction.gateway_response, notification: { amount, currency, orderId } }), transaction.id]
    );
    await finalizeDonation(req, transaction, false);
    return reply.code(400).send('Amount mismatch');
  }

  // Weryfikacja w P24 kwotą i walutą Z BAZY.
  const merchantId = parseInt(config.P24_MERCHANT_ID, 10);
  const posId = parseInt(config.P24_POS_ID || config.P24_MERCHANT_ID, 10);
  const verifyAmount = Number(transaction.amount);
  const verifyCurrency = txCurrency(transaction);
  const verifyData = {
    merchantId, posId, sessionId, amount: verifyAmount, currency: verifyCurrency, orderId,
    sign: p24Checksum({ sessionId, orderId, amount: verifyAmount, currency: verifyCurrency }),
  };

  let verifyResult;
  try {
    const verifyResponse = await deps.fetch(`${P24_API_URL}/api/v1/transaction/verify`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: p24AuthHeader() },
      body: JSON.stringify(verifyData),
    });
    verifyResult = await verifyResponse.json();
  } catch (err) {
    // Bramka niedostępna — 5xx, żeby P24 ponowił powiadomienie.
    req.log.error({ err, sessionId }, 'P24 webhook: weryfikacja niedostępna');
    return reply.code(502).send('Verify unavailable');
  }

  const gatewayResponse = JSON.stringify({ ...transaction.gateway_response, verify: verifyResult });
  if (verifyResult?.data?.status === 'success') {
    // Trigger update_invoice_on_payment (baza platform) opłaci fakturę i odblokuje tenanta —
    // tylko dla faktury tego tenanta w pełnej kwocie (patrz db/platform/schema.sql).
    const { rows: done } = await pool.query(
      `UPDATE payment_transactions
          SET status = 'completed', gateway_transaction_id = $1, completed_at = now(),
              gateway_response = $2
        WHERE id = $3 AND status <> 'completed'
        RETURNING id`,
      [String(orderId), gatewayResponse, transaction.id]
    );
    if (done.length) await finalizeDonation(req, transaction, true);
  } else {
    await pool.query(
      `UPDATE payment_transactions
          SET status = 'failed', error_message = $1, gateway_response = $2
        WHERE id = $3 AND status <> 'completed'`,
      [String(verifyResult?.error || 'Verification failed').slice(0, 500), gatewayResponse, transaction.id]
    );
    await finalizeDonation(req, transaction, false);
  }

  return reply.send('OK');
}
