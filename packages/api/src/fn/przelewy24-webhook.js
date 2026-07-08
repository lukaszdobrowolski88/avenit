// Port edge function przelewy24-webhook: callback statusu płatności z P24.
// Oryginał: supabase/functions/przelewy24-webhook/index.ts. Publiczny.
// Transakcje żyją w bazie PLATFORM.
import { platformPool } from '../db.js';
import { config } from '../config.js';
import { P24_API_URL, p24Checksum, p24AuthHeader } from '../lib/p24.js';

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
  } else {
    await platformPool.query(
      `UPDATE payment_transactions
          SET status = 'failed', error_message = $1, gateway_response = $2
        WHERE id = $3`,
      [verifyResult.error || 'Verification failed',
       JSON.stringify({ ...transaction.gateway_response, verify: verifyResult }), transaction.id]
    );
  }

  return reply.send('OK');
}
