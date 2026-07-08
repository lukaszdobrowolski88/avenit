// Port edge function przelewy24-create-payment.
// Oryginał: supabase/functions/przelewy24-create-payment/index.ts.
// Publiczny (verify_jwt=false w oryginale) — wołany z formularzy publicznych.
// Transakcje/faktury żyją w bazie PLATFORM (payment_transactions, invoices).
import { platformPool } from '../db.js';
import { config } from '../config.js';
import { P24_API_URL, p24Checksum, p24AuthHeader } from '../lib/p24.js';

export const name = 'przelewy24-create-payment';
export const isPublic = true;

export default async function handler(req, reply) {
  const {
    invoiceId, tenantId, formId, sessionId: clientSessionId,
    amount, description, email, returnUrl, statusUrl, urlReturn, urlStatus,
  } = req.body || {};

  if (!amount || !email) {
    return reply.code(400).send({ error: 'Wymagane pola: amount, email' });
  }

  const merchantId = parseInt(config.P24_MERCHANT_ID, 10);
  const posId = parseInt(config.P24_POS_ID || config.P24_MERCHANT_ID, 10);
  const sessionId = clientSessionId || `${tenantId || formId}_${invoiceId || Date.now()}_${Date.now()}`;

  const sign = p24Checksum({ sessionId, merchantId, amount, currency: 'PLN' });

  const finalReturnUrl = urlReturn || returnUrl || `${config.PUBLIC_API_URL}/billing/success`;
  const finalStatusUrl = urlStatus || statusUrl || `${config.PUBLIC_API_URL}/api/fn/przelewy24-webhook`;

  const transactionData = {
    merchantId, posId, sessionId, amount, currency: 'PLN',
    description: description || 'Płatność Avenit',
    email, country: 'PL', language: 'pl',
    urlReturn: finalReturnUrl, urlStatus: finalStatusUrl, sign, encoding: 'UTF-8',
  };

  const p24Response = await fetch(`${P24_API_URL}/api/v1/transaction/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: p24AuthHeader() },
    body: JSON.stringify(transactionData),
  });
  const p24Result = await p24Response.json();

  if (p24Result.error || !p24Result.data?.token) {
    req.log.error({ p24Result }, 'P24 registration error');
    return reply.code(400).send({ error: 'Rejestracja płatności nie powiodła się', details: p24Result });
  }

  const paymentUrl = `${P24_API_URL}/trnRequest/${p24Result.data.token}`;

  // Zapis transakcji w bazie platform (nie blokuj płatności, jeśli zapis padnie).
  let transactionId = null;
  try {
    const { rows } = await platformPool.query(
      `INSERT INTO payment_transactions
         (tenant_id, invoice_id, gateway, gateway_session_id, gateway_order_id, amount, status, gateway_response)
       VALUES ($1, $2, 'przelewy24', $3, $4, $5, 'pending', $6)
       RETURNING id`,
      [tenantId || null, invoiceId || null, sessionId, p24Result.data.token, amount, JSON.stringify(p24Result)]
    );
    transactionId = rows[0]?.id;
    if (invoiceId) {
      await platformPool.query(
        `UPDATE invoices SET payment_url = $1, payment_id = $2 WHERE id = $3`,
        [paymentUrl, p24Result.data.token, invoiceId]
      );
    }
  } catch (err) {
    req.log.error({ err }, 'P24 zapis transakcji nieudany');
  }

  return reply.send({ success: true, token: p24Result.data.token, paymentUrl, transactionId });
}
