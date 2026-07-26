// Dawanie online (Przelewy24 / BLIK) — tworzy płatność dla darowizny.
// Publiczny (wołany z publicznej strony /give bez logowania).
// Darowizna żyje w bazie TENANTA; transakcja płatnicza w bazie PLATFORM
// (payment_transactions). Webhook (przelewy24-webhook) po sukcesie
// domyka darowiznę w bazie tenanta na podstawie metadanych w gateway_response.
import { platformPool } from '../db.js';
import { config } from '../config.js';
import { P24_API_URL, p24Checksum, p24AuthHeader } from '../lib/p24.js';

export const name = 'giving-create-payment';
export const isPublic = true;

function nextRun(frequency) {
  const d = new Date();
  switch (frequency) {
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'biweekly': d.setDate(d.getDate() + 14); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
    default: d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString().slice(0, 10);
}

export default async function handler(req, reply) {
  if (!req.db || !req.tenant) {
    return reply.code(404).send({ error: 'Nieznany tenant' });
  }

  const { amount, email, donor_name, fund_id, campaign_id, note, returnUrl, recurring, frequency } = req.body || {};
  const amountPln = Number(amount);
  if (!amountPln || amountPln <= 0 || !email) {
    return reply.code(400).send({ error: 'Wymagane: dodatnia kwota oraz e-mail' });
  }
  const amountGrosze = Math.round(amountPln * 100);

  // 1. Utwórz oczekującą darowiznę w bazie tenanta.
  let donationId = null;
  try {
    const { rows } = await req.db.query(
      `INSERT INTO donations
         (donor_name, donor_email, fund_id, campaign_id, amount, currency, method, status, note, donation_date)
       VALUES ($1, $2, $3, $4, $5, 'PLN', 'przelewy24', 'pending', $6, CURRENT_DATE)
       RETURNING id`,
      [donor_name || null, email, fund_id || null, campaign_id || null, amountPln, note || null]
    );
    donationId = rows[0]?.id;
  } catch (err) {
    req.log.error({ err }, 'giving: nie udało się utworzyć darowizny');
    return reply.code(500).send({ error: 'Błąd zapisu darowizny' });
  }

  // Deklaracja cyklicznego dawania (opcjonalnie): pierwsza wpłata idzie teraz przez P24,
  // kolejne należne generuje worker giving-recurring (przypomnienia/linki).
  if (recurring) {
    const freq = ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'].includes(frequency) ? frequency : 'monthly';
    try {
      await req.db.query(
        `INSERT INTO giving_recurring
           (donor_name, fund_id, amount, currency, frequency, method, start_date, next_run_date, is_active)
         VALUES ($1, $2, $3, 'PLN', $4, 'przelewy24', CURRENT_DATE, $5, true)`,
        [donor_name || null, fund_id || null, amountPln, freq, nextRun(freq)]
      );
    } catch (err) {
      req.log.error({ err }, 'giving: zapis planu cyklicznego nieudany');
    }
  }

  // 2. Zarejestruj transakcję w Przelewy24.
  const merchantId = parseInt(config.P24_MERCHANT_ID, 10);
  const posId = parseInt(config.P24_POS_ID || config.P24_MERCHANT_ID, 10);
  const sessionId = `giving_${req.tenant.slug}_${donationId}_${Date.now()}`;
  const sign = p24Checksum({ sessionId, merchantId, amount: amountGrosze, currency: 'PLN' });

  const finalReturnUrl = returnUrl || `${config.PUBLIC_API_URL || ''}/give/success`;
  const finalStatusUrl = `${config.PUBLIC_API_URL || ''}/api/fn/przelewy24-webhook`;

  const transactionData = {
    merchantId, posId, sessionId, amount: amountGrosze, currency: 'PLN',
    description: note ? `Darowizna: ${note}` : 'Darowizna',
    email, country: 'PL', language: 'pl',
    urlReturn: finalReturnUrl, urlStatus: finalStatusUrl, sign, encoding: 'UTF-8',
  };

  let p24Result;
  try {
    const resp = await fetch(`${P24_API_URL}/api/v1/transaction/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: p24AuthHeader() },
      body: JSON.stringify(transactionData),
    });
    p24Result = await resp.json();
  } catch (err) {
    req.log.error({ err }, 'giving: błąd rejestracji P24');
    return reply.code(502).send({ error: 'Bramka płatności niedostępna' });
  }

  if (p24Result.error || !p24Result.data?.token) {
    req.log.error({ p24Result }, 'giving: rejestracja P24 nieudana');
    return reply.code(400).send({ error: 'Rejestracja płatności nie powiodła się' });
  }

  const paymentUrl = `${P24_API_URL}/trnRequest/${p24Result.data.token}`;

  // 3. Zapisz transakcję w bazie platform z metadanymi darowizny (do domknięcia w webhooku).
  try {
    await platformPool.query(
      `INSERT INTO payment_transactions
         (tenant_id, gateway, gateway_session_id, gateway_order_id, amount, status, gateway_response)
       VALUES ($1, 'przelewy24', $2, $3, $4, 'pending', $5)`,
      [
        req.tenant.id, sessionId, p24Result.data.token, amountGrosze,
        JSON.stringify({
          purpose: 'donation',
          tenant_db: req.tenant.db_name,
          tenant_slug: req.tenant.slug,
          donation_id: donationId,
          token: p24Result.data.token,
        }),
      ]
    );
  } catch (err) {
    // Nie blokuj płatności, ale zaloguj — webhook i tak dopnie po metadanych, jeśli zapis się powiódł.
    req.log.error({ err }, 'giving: zapis payment_transactions nieudany');
  }

  return reply.send({ success: true, paymentUrl, token: p24Result.data.token, donationId });
}
