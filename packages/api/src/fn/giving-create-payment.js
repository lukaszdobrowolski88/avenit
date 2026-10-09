// Dawanie online (Przelewy24 / BLIK) — tworzy płatność dla darowizny.
// Publiczny (wołany z publicznej strony /give bez logowania).
// Darowizna żyje w bazie TENANTA; transakcja płatnicza w bazie PLATFORM
// (payment_transactions). Webhook (przelewy24-webhook) po sukcesie
// domyka darowiznę w bazie tenanta na podstawie metadanych w gateway_response.
//
// Bezpieczeństwo (audyt 2026-10, runda 3): kwotę wybiera darczyńca, ale zapisana kwota jest
// jedyną, którą webhook zaakceptuje (kwota z powiadomienia = kwota zarejestrowana). Fundusz
// i kampania muszą istnieć i być aktywne w bazie TEGO tenanta; adres powrotu tylko na domenę
// tenanta; limit wywołań per IP (darowizny i plany cykliczne tworzy gość bez konta).
import { platformPool } from '../db.js';
import { config } from '../config.js';
import {
  P24_API_URL, p24Checksum, p24AuthHeader, p24Configured, p24StatusUrl, safeReturnUrl,
  groszeFromPln, EMAIL_RE, UUID_RE, newSessionId,
} from '../lib/p24.js';

export const name = 'giving-create-payment';
export const isPublic = true;
export const rateLimit = { max: 10, timeWindow: '10 minutes' };

// Zależności podmienialne w testach (bez prawdziwej bramki i bazy platform).
export const deps = {
  platformPool,
  fetch: (...args) => fetch(...args),
};

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

// Fundusz/kampania z bazy tenanta (nie z zaufania do wejścia). Kampania z przypisanym
// funduszem wyznacza fundusz. Zwraca { fundId, campaignId } albo { error }.
export async function resolveGivingTarget(db, { fund_id, campaign_id } = {}) {
  let fundId = null;
  let campaignId = null;
  if (campaign_id) {
    if (!UUID_RE.test(String(campaign_id))) return { error: 'Nieprawidłowa kampania' };
    const { rows } = await db.query(
      `SELECT id, fund_id FROM giving_campaigns
        WHERE id = $1 AND COALESCE(is_active, true) AND (end_date IS NULL OR end_date >= CURRENT_DATE)`,
      [String(campaign_id)]
    );
    if (!rows[0]) return { error: 'Ta zbiórka jest niedostępna' };
    campaignId = rows[0].id;
    fundId = rows[0].fund_id || null;
  }
  if (fund_id && !fundId) {
    if (!UUID_RE.test(String(fund_id))) return { error: 'Nieprawidłowy fundusz' };
    const { rows } = await db.query(
      `SELECT id FROM giving_funds WHERE id = $1 AND COALESCE(is_active, true)`,
      [String(fund_id)]
    );
    if (!rows[0]) return { error: 'Ten cel darowizny jest niedostępny' };
    fundId = rows[0].id;
  }
  return { fundId, campaignId };
}

export default async function handler(req, reply) {
  if (!req.db || !req.tenant) {
    return reply.code(404).send({ error: 'Nieznany tenant' });
  }
  if (!p24Configured()) return reply.code(503).send({ error: 'Płatności online nie są skonfigurowane' });

  const { amount, email, donor_name, fund_id, campaign_id, note, returnUrl, recurring, frequency } = req.body || {};
  const amountGrosze = groszeFromPln(amount);
  const donorEmail = String(email || '').trim();
  if (!amountGrosze || !EMAIL_RE.test(donorEmail)) {
    return reply.code(400).send({ error: 'Wymagane: kwota od 1 zł do 100 000 zł oraz poprawny e-mail' });
  }
  const amountPln = amountGrosze / 100;
  const donorName = donor_name ? String(donor_name).slice(0, 200) : null;
  const noteText = note ? String(note).slice(0, 500) : null;

  const target = await resolveGivingTarget(req.db, { fund_id, campaign_id });
  if (target.error) return reply.code(400).send({ error: target.error });

  // 1. Utwórz oczekującą darowiznę w bazie tenanta.
  let donationId = null;
  try {
    const { rows } = await req.db.query(
      `INSERT INTO donations
         (donor_name, donor_email, fund_id, campaign_id, amount, currency, method, status, note, donation_date)
       VALUES ($1, $2, $3, $4, $5, 'PLN', 'przelewy24', 'pending', $6, CURRENT_DATE)
       RETURNING id`,
      [donorName, donorEmail, target.fundId, target.campaignId, amountPln, noteText]
    );
    donationId = rows[0]?.id;
  } catch (err) {
    req.log.error({ err }, 'giving: nie udało się utworzyć darowizny');
    return reply.code(500).send({ error: 'Błąd zapisu darowizny' });
  }

  const markDonationFailed = () =>
    req.db.query(`UPDATE donations SET status = 'failed', updated_at = now() WHERE id = $1 AND status = 'pending'`, [donationId])
      .catch(() => {});

  // 2. Zarejestruj transakcję w Przelewy24.
  const merchantId = parseInt(config.P24_MERCHANT_ID, 10);
  const posId = parseInt(config.P24_POS_ID || config.P24_MERCHANT_ID, 10);
  const sessionId = newSessionId(`giving_${req.tenant.slug}`);
  const sign = p24Checksum({ sessionId, merchantId, amount: amountGrosze, currency: 'PLN' });

  const transactionData = {
    merchantId, posId, sessionId, amount: amountGrosze, currency: 'PLN',
    description: noteText ? `Darowizna: ${noteText}`.slice(0, 200) : 'Darowizna',
    email: donorEmail, country: 'PL', language: 'pl',
    urlReturn: safeReturnUrl(returnUrl, req.tenant, '/give/success'),
    urlStatus: p24StatusUrl(req.tenant),
    sign, encoding: 'UTF-8',
  };

  let p24Result;
  try {
    const resp = await deps.fetch(`${P24_API_URL}/api/v1/transaction/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: p24AuthHeader() },
      body: JSON.stringify(transactionData),
    });
    p24Result = await resp.json();
  } catch (err) {
    req.log.error({ err }, 'giving: błąd rejestracji P24');
    await markDonationFailed();
    return reply.code(502).send({ error: 'Bramka płatności niedostępna' });
  }

  if (p24Result?.error || !p24Result?.data?.token) {
    req.log.error({ p24Result }, 'giving: rejestracja P24 nieudana');
    await markDonationFailed();
    return reply.code(400).send({ error: 'Rejestracja płatności nie powiodła się' });
  }

  const token = p24Result.data.token;
  const paymentUrl = `${P24_API_URL}/trnRequest/${token}`;

  // 3. Zapisz transakcję w bazie platform z metadanymi darowizny (do domknięcia w webhooku).
  // Bez tego zapisu webhook nie zaksięguje wpłaty — wtedy nie wydajemy linku do płatności.
  try {
    await deps.platformPool.query(
      `INSERT INTO payment_transactions
         (tenant_id, gateway, gateway_session_id, gateway_order_id, amount, currency, status, gateway_response)
       VALUES ($1, 'przelewy24', $2, $3, $4, 'PLN', 'pending', $5)`,
      [
        req.tenant.id, sessionId, token, amountGrosze,
        JSON.stringify({
          purpose: 'donation',
          tenant_db: req.tenant.db_name,
          tenant_slug: req.tenant.slug,
          donation_id: donationId,
          token,
        }),
      ]
    );
  } catch (err) {
    req.log.error({ err }, 'giving: zapis payment_transactions nieudany');
    await markDonationFailed();
    return reply.code(500).send({ error: 'Nie udało się zapisać płatności. Spróbuj ponownie.' });
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
        [donorName, target.fundId, amountPln, freq, nextRun(freq)]
      );
    } catch (err) {
      req.log.error({ err }, 'giving: zapis planu cyklicznego nieudany');
    }
  }

  return reply.send({ success: true, paymentUrl, token, donationId });
}
