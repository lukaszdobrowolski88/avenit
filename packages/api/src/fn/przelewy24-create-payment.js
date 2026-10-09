// Port edge function przelewy24-create-payment.
// Oryginał: supabase/functions/przelewy24-create-payment/index.ts.
// Publiczny (verify_jwt=false w oryginale) — zawieszony tenant musi móc opłacić fakturę,
// a formularze publiczne płacą bez logowania. Transakcje/faktury żyją w bazie PLATFORM.
//
// Bezpieczeństwo (audyt 2026-10, runda 3):
//   • płatność FAKTURY: kwota, waluta i tenant WYŁĄCZNIE z faktury w bazie platform — kwota
//     z klienta jest ignorowana; faktura musi należeć do tenanta z hosta i czekać na płatność.
//     Wcześniej 0,01 zł z dowolnym invoiceId/tenantId opłacało cudzą fakturę i odblokowywało tenanta.
//   • płatność formularza (bez faktury): kwota od klienta (brak serwerowego cennika formularzy),
//     ale transakcja przypięta do tenanta z hosta i bez wpływu na faktury/status tenanta.
//   • sessionId i urlStatus zawsze z serwera, urlReturn tylko na domenę tenanta; limit per IP.
import { platformPool } from '../db.js';
import { config } from '../config.js';
import {
  P24_API_URL, p24Checksum, p24AuthHeader, p24Configured, p24StatusUrl, safeReturnUrl,
  EMAIL_RE, UUID_RE, MAX_PAYMENT_GROSZE, newSessionId,
} from '../lib/p24.js';

export const name = 'przelewy24-create-payment';
export const isPublic = true;
export const rateLimit = { max: 10, timeWindow: '10 minutes' };

// Zależności podmienialne w testach (bez prawdziwej bramki i bazy).
export const deps = {
  platformPool,
  fetch: (...args) => fetch(...args),
};

const PAYABLE_STATUSES = new Set(['pending', 'overdue']);
const CURRENCIES = new Set(['PLN', 'EUR', 'GBP', 'CZK']);

// Płatność faktury: wszystko z bazy platform. Zwraca { invoice, amount, currency } albo { status, error }.
export async function resolveInvoicePayment(pool, tenant, invoiceId) {
  if (!tenant?.id || !UUID_RE.test(String(invoiceId || ''))) return { status: 404, error: 'Nie znaleziono faktury' };
  const { rows } = await pool.query(
    `SELECT id, tenant_id, invoice_number, total, currency, status, buyer_email
       FROM invoices WHERE id = $1`,
    [String(invoiceId)]
  );
  const invoice = rows[0];
  // Cudza faktura = brak faktury (bez zdradzania, że istnieje).
  if (!invoice || String(invoice.tenant_id) !== String(tenant.id)) return { status: 404, error: 'Nie znaleziono faktury' };
  if (!PAYABLE_STATUSES.has(invoice.status)) return { status: 409, error: 'Ta faktura nie oczekuje na płatność' };
  const amount = Number(invoice.total);
  if (!Number.isSafeInteger(amount) || amount <= 0) return { status: 409, error: 'Nieprawidłowa kwota faktury' };
  const currency = String(invoice.currency || 'PLN').toUpperCase();
  if (!CURRENCIES.has(currency)) return { status: 409, error: 'Nieobsługiwana waluta faktury' };
  return { invoice, amount, currency };
}

// Płatność bez faktury (formularz): kwota w groszach od klienta, w granicach rozsądku.
export function resolveFormPayment(body) {
  const amount = Number(body?.amount);
  if (!Number.isSafeInteger(amount) || amount < 100 || amount > MAX_PAYMENT_GROSZE) {
    return { status: 400, error: 'Nieprawidłowa kwota płatności' };
  }
  const currency = String(body?.currency || 'PLN').toUpperCase();
  if (!CURRENCIES.has(currency)) return { status: 400, error: 'Nieobsługiwana waluta' };
  const formId = UUID_RE.test(String(body?.formId || '')) ? String(body.formId) : null;
  return { amount, currency, formId };
}

// Płatność formularza: klient nie zna sessionId przed rejestracją (nadaje go serwer), więc
// parametr `session` w adresie powrotu dopisuje serwer — klient go nie zgaduje ani nie wybiera.
export function formReturnUrl(url, sessionId) {
  if (!sessionId) return url;
  try {
    const u = new URL(url);
    u.searchParams.set('session', sessionId);
    return u.toString();
  } catch {
    return url;
  }
}

export default async function handler(req, reply) {
  if (!req.tenant) return reply.code(404).send({ error: 'Nieznany tenant' });
  if (!p24Configured()) return reply.code(503).send({ error: 'Płatności online nie są skonfigurowane' });

  const b = req.body || {};
  const pool = deps.platformPool;

  let amount, currency, invoice = null, formId = null, description;
  if (b.invoiceId) {
    const r = await resolveInvoicePayment(pool, req.tenant, b.invoiceId);
    if (r.error) return reply.code(r.status).send({ error: r.error });
    ({ invoice, amount, currency } = r);
    description = `Faktura ${invoice.invoice_number}`;
  } else {
    const r = resolveFormPayment(b);
    if (r.error) return reply.code(r.status).send({ error: r.error });
    ({ amount, currency, formId } = r);
    description = String(b.description || 'Płatność Avenit').slice(0, 200);
  }

  const email = String(b.email || invoice?.buyer_email || '').trim();
  if (!EMAIL_RE.test(email)) return reply.code(400).send({ error: 'Podaj poprawny adres e-mail' });

  const merchantId = parseInt(config.P24_MERCHANT_ID, 10);
  const posId = parseInt(config.P24_POS_ID || config.P24_MERCHANT_ID, 10);
  const sessionId = newSessionId(invoice ? `inv_${invoice.id}` : `form_${req.tenant.slug}`);
  const sign = p24Checksum({ sessionId, merchantId, amount, currency });

  const transactionData = {
    merchantId, posId, sessionId, amount, currency,
    description,
    email, country: 'PL', language: 'pl',
    urlReturn: formReturnUrl(safeReturnUrl(b.urlReturn || b.returnUrl, req.tenant, '/billing/success'), invoice ? null : sessionId),
    urlStatus: p24StatusUrl(req.tenant),
    sign, encoding: 'UTF-8',
  };

  let p24Result;
  try {
    const p24Response = await deps.fetch(`${P24_API_URL}/api/v1/transaction/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: p24AuthHeader() },
      body: JSON.stringify(transactionData),
    });
    p24Result = await p24Response.json();
  } catch (err) {
    req.log.error({ err }, 'P24: bramka niedostępna');
    return reply.code(502).send({ error: 'Bramka płatności niedostępna' });
  }

  if (p24Result?.error || !p24Result?.data?.token) {
    req.log.error({ p24Result }, 'P24 registration error');
    return reply.code(400).send({ error: 'Rejestracja płatności nie powiodła się' });
  }

  const token = p24Result.data.token;
  const paymentUrl = `${P24_API_URL}/trnRequest/${token}`;

  // Zapis transakcji MUSI się udać — bez niego webhook nie rozpozna płatności (wcześniej błąd
  // był połykany, a klient dostawał link do płatności, której nikt nie zaksięguje).
  let transactionId = null;
  try {
    const { rows } = await pool.query(
      `INSERT INTO payment_transactions
         (tenant_id, invoice_id, gateway, gateway_session_id, gateway_order_id, amount, currency, status, gateway_response)
       VALUES ($1, $2, 'przelewy24', $3, $4, $5, $6, 'pending', $7)
       RETURNING id`,
      [
        req.tenant.id, invoice?.id || null, sessionId, token, amount, currency,
        JSON.stringify({
          purpose: invoice ? 'invoice' : 'form',
          tenant_slug: req.tenant.slug,
          form_id: formId,
          token,
        }),
      ]
    );
    transactionId = rows[0]?.id || null;
  } catch (err) {
    req.log.error({ err }, 'P24 zapis transakcji nieudany');
    return reply.code(500).send({ error: 'Nie udało się zapisać płatności. Spróbuj ponownie.' });
  }

  if (invoice) {
    await pool.query(
      `UPDATE invoices SET payment_url = $1, payment_id = $2 WHERE id = $3 AND tenant_id = $4`,
      [paymentUrl, token, invoice.id, req.tenant.id]
    ).catch((err) => req.log.warn({ err }, 'P24: zapis linku płatności na fakturze nieudany'));
  }

  return reply.send({ success: true, token, paymentUrl, transactionId, sessionId, amount, currency });
}
