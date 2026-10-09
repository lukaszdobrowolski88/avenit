// Audyt bezpieczeństwa 2026-10, runda 3 (S3): płatności Przelewy24 (faktury, formularze, Dawanie)
// i webhook. Bez prawdziwej bramki, bazy i poczty — fałszywe pule, fetch i sendEmail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Konfiguracja PRZED pierwszym importem config.js (dynamiczne importy niżej).
process.env.P24_MERCHANT_ID = '11111';
process.env.P24_POS_ID = '11111';
process.env.P24_CRC = 'test-crc-secret';
process.env.P24_API_KEY = 'test-api-key';
process.env.P24_SANDBOX = 'true';
process.env.APP_DOMAIN = 'avenit.pl';
process.env.PUBLIC_API_URL = 'https://api.avenit.pl';

const p24 = await import('../src/lib/p24.js');
const createPayment = await import('../src/fn/przelewy24-create-payment.js');
const webhook = await import('../src/fn/przelewy24-webhook.js');
const giving = await import('../src/fn/giving-create-payment.js');

const TENANT = { id: 'aaaaaaaa-0000-4000-8000-000000000001', slug: 'kosciol', subdomain: 'kosciol', db_name: 'avenit_tenant_kosciol' };
const OTHER_TENANT_ID = 'bbbbbbbb-0000-4000-8000-000000000002';
const INVOICE_ID = 'cccccccc-0000-4000-8000-000000000003';
const quietLog = { error() {}, warn() {}, info() {} };

function fakeReply() {
  return {
    statusCode: 200, body: undefined, sent: false,
    code(c) { this.statusCode = c; return this; },
    send(b) { this.body = b; this.sent = true; return this; },
  };
}

// Pula: lista [regex, handler(params)] — pierwsze dopasowanie wygrywa; log zapytań.
function fakePool(handlers = []) {
  const log = [];
  return {
    log,
    async query(sql, params = []) {
      const flat = sql.replace(/\s+/g, ' ').trim();
      log.push({ sql: flat, params });
      for (const [re, fn] of handlers) if (re.test(flat)) return fn(params) || { rows: [] };
      return { rows: [], rowCount: 0 };
    },
  };
}

function fakeFetch(responder) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, body: opts?.body ? JSON.parse(opts.body) : null });
    return { json: async () => responder(url, opts) };
  };
  fn.calls = calls;
  return fn;
}

const invoiceRow = (over = {}) => ({
  id: INVOICE_ID, tenant_id: TENANT.id, invoice_number: 'FN/001/10/2026', total: 12300,
  currency: 'PLN', status: 'pending', buyer_email: 'ksiegowa@kosciol.pl', ...over,
});

// ── Helpery P24 ────────────────────────────────────────────────────────────────
test('safeReturnUrl: tylko domena tenanta, inaczej domyślny adres', () => {
  assert.equal(p24.safeReturnUrl('https://kosciol.avenit.pl/billing/success?invoice=1', TENANT, '/billing/success'),
    'https://kosciol.avenit.pl/billing/success?invoice=1');
  assert.equal(p24.safeReturnUrl('/give/success', TENANT, '/x'), 'https://kosciol.avenit.pl/give/success');
  assert.equal(p24.safeReturnUrl('https://evil.example/phish', TENANT, '/give/success'), 'https://kosciol.avenit.pl/give/success');
  assert.equal(p24.safeReturnUrl('https://inny.avenit.pl/x', TENANT, '/give/success'), 'https://kosciol.avenit.pl/give/success');
  assert.equal(p24.safeReturnUrl('javascript:alert(1)', TENANT, '/give/success'), 'https://kosciol.avenit.pl/give/success');
  assert.equal(p24.p24StatusUrl(TENANT), 'https://kosciol.avenit.pl/api/fn/przelewy24-webhook');
});

test('groszeFromPln: od 1 zł do 100 000 zł, bez NaN/ujemnych', () => {
  assert.equal(p24.groszeFromPln(12.5), 1250);
  assert.equal(p24.groszeFromPln('50'), 5000);
  assert.equal(p24.groszeFromPln(0.01), null);
  assert.equal(p24.groszeFromPln(-5), null);
  assert.equal(p24.groszeFromPln('abc'), null);
  assert.equal(p24.groszeFromPln(100001), null);
});

// Podpis powiadomienia liczony niezależnie, wg dokumentacji P24 (kolejność pól + crc).
function signNotification(n, crc = 'test-crc-secret') {
  const payload = JSON.stringify({
    merchantId: n.merchantId, posId: n.posId, sessionId: n.sessionId, amount: n.amount, originAmount: n.originAmount,
    currency: n.currency, orderId: n.orderId, methodId: n.methodId, statement: n.statement, crc,
  });
  return crypto.createHash('sha384').update(payload, 'utf8').digest('hex');
}
function notification(over = {}) {
  const n = {
    merchantId: 11111, posId: 11111, sessionId: 'inv_sess_1', amount: 12300, originAmount: 12300,
    currency: 'PLN', orderId: 987654, methodId: 25, statement: 'p24-A12-B34', ...over,
  };
  return { ...n, sign: over.sign || signNotification(n) };
}

test('verifyP24NotificationSign: poprawny podpis tak, podrobiony/zmieniona kwota nie', () => {
  assert.equal(p24.verifyP24NotificationSign(notification()), true);
  const n = notification();
  assert.equal(p24.verifyP24NotificationSign({ ...n, amount: 1 }), false, 'zmiana kwoty unieważnia podpis');
  assert.equal(p24.verifyP24NotificationSign(notification({ sign: signNotification({ ...notification() }, 'zly-crc') })), false);
  assert.equal(p24.verifyP24NotificationSign({ ...n, sign: undefined }), false);
});

// ── przelewy24-create-payment ─────────────────────────────────────────────────
test('create-payment: rateLimit per IP', () => {
  assert.ok(createPayment.rateLimit?.max > 0);
});

test('resolveInvoicePayment: cudza faktura = 404, opłacona = 409, kwota z faktury', async () => {
  const pool = (row) => fakePool([[/FROM invoices WHERE id = \$1/, () => ({ rows: row ? [row] : [] })]]);
  assert.equal((await createPayment.resolveInvoicePayment(pool(invoiceRow({ tenant_id: OTHER_TENANT_ID })), TENANT, INVOICE_ID)).status, 404);
  assert.equal((await createPayment.resolveInvoicePayment(pool(invoiceRow({ status: 'paid' })), TENANT, INVOICE_ID)).status, 409);
  assert.equal((await createPayment.resolveInvoicePayment(pool(null), TENANT, INVOICE_ID)).status, 404);
  assert.equal((await createPayment.resolveInvoicePayment(pool(invoiceRow()), TENANT, 'nie-uuid')).status, 404);
  const ok = await createPayment.resolveInvoicePayment(pool(invoiceRow()), TENANT, INVOICE_ID);
  assert.equal(ok.amount, 12300);
  assert.equal(ok.currency, 'PLN');
});

test('create-payment (faktura): kwota 0,01 zł z klienta ignorowana — P24 i zapis dostają sumę faktury', async () => {
  const pool = fakePool([
    [/FROM invoices WHERE id = \$1/, () => ({ rows: [invoiceRow()] })],
    [/^INSERT INTO payment_transactions/, () => ({ rows: [{ id: 'tx-1' }] })],
  ]);
  const fetchFn = fakeFetch(() => ({ data: { token: 'TOKEN-1' } }));
  Object.assign(createPayment.deps, { platformPool: pool, fetch: fetchFn });
  const reply = fakeReply();
  await createPayment.default({
    tenant: TENANT, log: quietLog,
    body: { invoiceId: INVOICE_ID, tenantId: OTHER_TENANT_ID, amount: 1, email: 'x@y.pl', urlStatus: 'https://evil.example/hook', returnUrl: 'https://evil.example/' },
  }, reply);
  assert.equal(reply.statusCode, 200);
  const reg = fetchFn.calls[0].body;
  assert.equal(reg.amount, 12300);
  assert.equal(reg.currency, 'PLN');
  assert.equal(reg.urlStatus, 'https://kosciol.avenit.pl/api/fn/przelewy24-webhook');
  assert.equal(reg.urlReturn, 'https://kosciol.avenit.pl/billing/success');
  assert.match(reg.sessionId, /^inv_/);
  const ins = pool.log.find((l) => l.sql.startsWith('INSERT INTO payment_transactions'));
  assert.equal(ins.params[0], TENANT.id, 'tenant z hosta, nie z body');
  assert.equal(ins.params[1], INVOICE_ID);
  assert.equal(ins.params[4], 12300);
});

test('create-payment (faktura innego tenanta): 404 bez rejestracji w P24', async () => {
  const pool = fakePool([[/FROM invoices WHERE id = \$1/, () => ({ rows: [invoiceRow({ tenant_id: OTHER_TENANT_ID })] })]]);
  const fetchFn = fakeFetch(() => ({ data: { token: 'T' } }));
  Object.assign(createPayment.deps, { platformPool: pool, fetch: fetchFn });
  const reply = fakeReply();
  await createPayment.default({ tenant: TENANT, log: quietLog, body: { invoiceId: INVOICE_ID, amount: 1, email: 'x@y.pl' } }, reply);
  assert.equal(reply.statusCode, 404);
  assert.equal(fetchFn.calls.length, 0);
});

test('create-payment: nieudany zapis transakcji → 500 i brak linku do płatności', async () => {
  const pool = fakePool([
    [/FROM invoices WHERE id = \$1/, () => ({ rows: [invoiceRow()] })],
    [/^INSERT INTO payment_transactions/, () => { throw new Error('db down'); }],
  ]);
  Object.assign(createPayment.deps, { platformPool: pool, fetch: fakeFetch(() => ({ data: { token: 'T' } })) });
  const reply = fakeReply();
  await createPayment.default({ tenant: TENANT, log: quietLog, body: { invoiceId: INVOICE_ID, email: 'x@y.pl' } }, reply);
  assert.equal(reply.statusCode, 500);
  assert.equal(reply.body.paymentUrl, undefined);
});

// Formularz w bazie tenanta (forms.fields/settings) — kwotę liczy serwer.
const FORM_ID = 'dddddddd-0000-4000-8000-000000000004';
const formRow = (over = {}) => ({
  id: FORM_ID, title: 'Obóz', status: 'published', closes_at: null,
  fields: [
    { id: 'f_price', type: 'price', priceConfig: { basePrice: 100, pricingType: 'per_person', currency: 'PLN' } },
    { id: 'f_qty', type: 'quantity', validation: { min: 1, max: 5 } },
    { id: 'f_mail', type: 'email' },
  ],
  settings: {
    pricing: { enabled: true, currency: 'PLN', paymentRequired: true, paymentMethods: ['przelewy24'], przelewy24: { merchantId: '1', description: 'Obóz 2026' } },
    addons: { enabled: true, items: [
      { id: 'a_shirt', name: 'Koszulka', price: 40, scope: 'per_person', maxQuantity: 1 },
      { id: 'a_bus', name: 'Autokar', price: 25.5, scope: 'per_registration', maxQuantity: 2 },
    ] },
    discounts: { enabled: true, rules: [{ type: 'quantity', minQuantity: 3, discountType: 'percentage', value: 10, label: '10%' }], stackingMode: 'best' },
  },
  ...over,
});
const formDb = (row = formRow()) => fakePool([[/FROM forms WHERE id = \$1/, () => ({ rows: row ? [row] : [] })]]);
const formReq = (body, db = formDb()) => ({ tenant: TENANT, db, log: quietLog, body: { formId: FORM_ID, email: 'x@y.pl', ...body } });

test('resolveFormPayment: kwota z cennika formularza (osoby, dodatki, rabat) — kwota klienta ignorowana', async () => {
  // 3 osoby × 100 = 300, rabat 10% od bazowej = 30, koszulka 40, autokar 2 × 25,50 = 51 → 361 zł
  const r = await createPayment.resolveFormPayment(formDb(), {
    formId: FORM_ID, amount: 100, answers: { f_qty: '3', _addons: { a_shirt: 1 }, _registrationAddons: { a_bus: 2 } },
  });
  assert.equal(r.amount, 36100);
  assert.equal(r.currency, 'PLN');
  assert.equal(r.description, 'Obóz 2026');
  // Liczby spoza limitów formularza są przycinane: ujemne dodatki → 0, ilość ponad max → max, nieznany dodatek pominięty.
  const cut = await createPayment.resolveFormPayment(formDb(), {
    formId: FORM_ID, answers: { f_qty: 999, _addons: { a_shirt: -50, hack: 9 }, _registrationAddons: { a_bus: 0.5 } },
  });
  assert.equal(cut.amount, 45000); // 5 × 100 − 10% = 450
});

test('resolveFormPayment: grupa, cennik datowy (dzień w Polsce), błędy formularza', async () => {
  const group = formRow({
    fields: [{ id: 'f_price', type: 'price', priceConfig: { basePrice: 80, pricingType: 'per_person',
      datePricing: { enabled: true, tiers: [{ until: '2026-10-09', price: 50 }] } } }],
    settings: { ...formRow().settings, discounts: {}, groupRegistration: { enabled: true, maxParticipants: 3 } },
  });
  const body = { formId: FORM_ID, answers: { _contactPerson: { _addons: { a_shirt: 1 } }, _participants: [{}, {}, {}, {}, {}] } };
  // 23:30 czasu polskiego 9.10 (21:30 UTC) — próg „do 9.10” obowiązuje; maks. 3 osoby → 3 × 50 + 40
  const late = await createPayment.resolveFormPayment(formDb(group), body, { now: new Date('2026-10-09T21:30:00Z') });
  assert.equal(late.amount, 19000);
  // 00:30 czasu polskiego 10.10 (22:30 UTC 9.10) — próg minął, cena bazowa 80
  const next = await createPayment.resolveFormPayment(formDb(group), body, { now: new Date('2026-10-09T22:30:00Z') });
  assert.equal(next.amount, 28000);

  assert.equal((await createPayment.resolveFormPayment(formDb(), { answers: {} })).status, 400, 'bez formId');
  assert.equal((await createPayment.resolveFormPayment(formDb(null), { formId: FORM_ID })).status, 404);
  assert.equal((await createPayment.resolveFormPayment(formDb(formRow({ status: 'draft' })), { formId: FORM_ID })).status, 403);
  assert.equal((await createPayment.resolveFormPayment(formDb(formRow({ closes_at: '2020-01-01T00:00:00Z' })), { formId: FORM_ID })).status, 403);
  const noP24 = formRow({ settings: { ...formRow().settings, pricing: { enabled: true, paymentMethods: ['transfer'] } } });
  assert.equal((await createPayment.resolveFormPayment(formDb(noP24), { formId: FORM_ID })).status, 400);
  const free = formRow({ fields: [{ id: 'f_price', type: 'price', priceConfig: { basePrice: 0 } }], settings: { ...formRow().settings, addons: {}, discounts: {} } });
  const zero = await createPayment.resolveFormPayment(formDb(free), { formId: FORM_ID, amount: 5000 });
  assert.equal(zero.status, 400, 'formularz bez ceny nie przyjmuje kwoty od klienta');
});

test('resolveFormPayment: dowolna kwota tylko gdy formularz pozwala (customAmount min/max)', async () => {
  const donation = formRow({
    fields: [],
    settings: { ...formRow().settings, addons: {}, discounts: {}, pricing: { ...formRow().settings.pricing, customAmount: { enabled: true, min: 10, max: 500 } } },
  });
  assert.equal((await createPayment.resolveFormPayment(formDb(donation), { formId: FORM_ID, amount: 2500 })).amount, 2500);
  assert.equal((await createPayment.resolveFormPayment(formDb(donation), { formId: FORM_ID, amount: 500 })).status, 400, 'poniżej min');
  assert.equal((await createPayment.resolveFormPayment(formDb(donation), { formId: FORM_ID, amount: 50001 })).status, 400, 'powyżej max');
  assert.equal((await createPayment.resolveFormPayment(formDb(donation), { formId: FORM_ID, amount: 12.5 })).status, 400, 'nie grosze');
});

test('create-payment (formularz): P24 i zapis dostają kwotę serwera, transakcja przypięta do tenanta', async () => {
  const bad = fakeReply();
  Object.assign(createPayment.deps, { platformPool: fakePool(), fetch: fakeFetch(() => ({ data: { token: 'T' } })) });
  await createPayment.default({ tenant: TENANT, log: quietLog, body: { amount: 5000, email: 'x@y.pl' } }, bad);
  assert.equal(bad.statusCode, 400, 'bez formularza — brak płatności „z ręki”');

  const pool = fakePool([[/^INSERT INTO payment_transactions/, () => ({ rows: [{ id: 'tx-2' }] })]]);
  const fetchFn = fakeFetch(() => ({ data: { token: 'T2' } }));
  Object.assign(createPayment.deps, { platformPool: pool, fetch: fetchFn });
  const ok = fakeReply();
  await createPayment.default(formReq({ amount: 100, description: 'Fałsz', sessionId: 'inv_sess_1', answers: { f_qty: 2 } }), ok);
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.amount, 20000);
  const reg = fetchFn.calls[0].body;
  assert.equal(reg.amount, 20000, 'kwota z cennika, nie 1 zł od klienta');
  assert.equal(reg.description, 'Obóz 2026');
  const ins = pool.log.find((l) => l.sql.startsWith('INSERT INTO payment_transactions'));
  assert.equal(ins.params[0], TENANT.id);
  assert.equal(ins.params[1], null, 'bez faktury');
  assert.notEqual(ins.params[2], 'inv_sess_1', 'sessionId z serwera, nie od klienta');
  assert.equal(ins.params[4], 20000);
  const meta = JSON.parse(ins.params[6]);
  assert.equal(meta.form_id, FORM_ID);
  assert.deepEqual(meta.form_pricing, { participants: 2, custom: false });
});

// ── przelewy24-webhook ────────────────────────────────────────────────────────
function webhookPool({ tx, invoice = invoiceRow() }) {
  return fakePool([
    [/FROM payment_transactions WHERE gateway_session_id = \$1/, () => ({ rows: tx ? [tx] : [] })],
    [/FROM invoices WHERE id = \$1/, () => ({ rows: invoice ? [invoice] : [] })],
    [/^UPDATE payment_transactions SET status = 'completed'/, () => ({ rows: [{ id: tx.id }] })],
  ]);
}
const pendingTx = (over = {}) => ({
  id: 'tx-1', tenant_id: TENANT.id, invoice_id: INVOICE_ID, gateway: 'przelewy24', gateway_session_id: 'inv_sess_1',
  amount: 12300, currency: 'PLN', status: 'pending', gateway_response: { purpose: 'invoice' }, ...over,
});

test('webhook: podrobiony podpis → 400, bez dotykania bazy', async () => {
  const pool = webhookPool({ tx: pendingTx() });
  const fetchFn = fakeFetch(() => ({ data: { status: 'success' } }));
  Object.assign(webhook.deps, { platformPool: pool, fetch: fetchFn });
  const reply = fakeReply();
  await webhook.default({ tenant: TENANT, log: quietLog, body: { ...notification(), sign: 'a'.repeat(96) } }, reply);
  assert.equal(reply.statusCode, 400);
  assert.equal(pool.log.length, 0);
  assert.equal(fetchFn.calls.length, 0);
});

test('webhook: 0,01 zł za fakturę na 123 zł → odrzucone, transakcja failed, faktura nieopłacona', async () => {
  const tx = pendingTx({ amount: 1 }); // stara transakcja zarejestrowana z kwotą od klienta
  const pool = webhookPool({ tx });
  const fetchFn = fakeFetch(() => ({ data: { status: 'success' } }));
  Object.assign(webhook.deps, { platformPool: pool, fetch: fetchFn });
  const reply = fakeReply();
  await webhook.default({ tenant: TENANT, log: quietLog, body: notification({ amount: 1, originAmount: 1 }) }, reply);
  assert.equal(reply.statusCode, 400);
  assert.equal(fetchFn.calls.length, 0, 'bez weryfikacji w P24');
  assert.ok(!pool.log.some((l) => l.sql.includes("status = 'completed'")));
  assert.ok(pool.log.some((l) => l.sql.startsWith("UPDATE payment_transactions SET status = 'failed'")));
});

test('webhook: kwota powiadomienia ≠ zarejestrowanej → 400', async () => {
  const pool = webhookPool({ tx: pendingTx() });
  Object.assign(webhook.deps, { platformPool: pool, fetch: fakeFetch(() => ({ data: { status: 'success' } })) });
  const reply = fakeReply();
  await webhook.default({ tenant: TENANT, log: quietLog, body: notification({ amount: 100, originAmount: 100 }) }, reply);
  assert.equal(reply.statusCode, 400);
});

test('webhook: waluta inna niż zarejestrowana → 400', async () => {
  const pool = webhookPool({ tx: pendingTx() });
  Object.assign(webhook.deps, { platformPool: pool, fetch: fakeFetch(() => ({ data: { status: 'success' } })) });
  const reply = fakeReply();
  await webhook.default({ tenant: TENANT, log: quietLog, body: notification({ currency: 'EUR' }) }, reply);
  assert.equal(reply.statusCode, 400);
});

test('webhook: transakcja innego tenanta niż host → 404', async () => {
  const pool = webhookPool({ tx: pendingTx({ tenant_id: OTHER_TENANT_ID }) });
  Object.assign(webhook.deps, { platformPool: pool, fetch: fakeFetch(() => ({ data: { status: 'success' } })) });
  const reply = fakeReply();
  await webhook.default({ tenant: TENANT, log: quietLog, body: notification() }, reply);
  assert.equal(reply.statusCode, 404);
});

test('paymentMismatch: faktura z inną sumą/tenantem niż transakcja', async () => {
  const tx = pendingTx();
  const withInvoice = (inv) => fakePool([[/FROM invoices/, () => ({ rows: [inv] })]]);
  assert.equal(await webhook.paymentMismatch(withInvoice(invoiceRow()), tx, { amount: 12300, currency: 'PLN' }), null);
  assert.equal(await webhook.paymentMismatch(withInvoice(invoiceRow({ total: 99900 })), tx, { amount: 12300, currency: 'PLN' }), 'invoice_amount_mismatch');
  assert.equal(await webhook.paymentMismatch(withInvoice(invoiceRow({ tenant_id: OTHER_TENANT_ID })), tx, { amount: 12300, currency: 'PLN' }), 'invoice_mismatch');
});

test('webhook: poprawna płatność → weryfikacja kwotą z bazy, completed; powtórka idempotentna', async () => {
  const tx = pendingTx();
  const pool = webhookPool({ tx });
  const fetchFn = fakeFetch(() => ({ data: { status: 'success' } }));
  Object.assign(webhook.deps, { platformPool: pool, fetch: fetchFn });
  const reply = fakeReply();
  await webhook.default({ tenant: TENANT, log: quietLog, body: notification() }, reply);
  assert.equal(reply.statusCode, 200);
  assert.equal(fetchFn.calls.length, 1);
  assert.equal(fetchFn.calls[0].body.amount, 12300);
  assert.equal(fetchFn.calls[0].body.orderId, 987654);
  const done = pool.log.find((l) => l.sql.startsWith("UPDATE payment_transactions SET status = 'completed'"));
  assert.ok(done && done.sql.includes("status <> 'completed'"), 'warunkowa zmiana statusu');

  // Ponowne powiadomienie dla opłaconej transakcji — bez weryfikacji i zmian.
  const pool2 = webhookPool({ tx: { ...tx, status: 'completed' } });
  const fetch2 = fakeFetch(() => ({ data: { status: 'success' } }));
  Object.assign(webhook.deps, { platformPool: pool2, fetch: fetch2 });
  const again = fakeReply();
  await webhook.default({ tenant: TENANT, log: quietLog, body: notification() }, again);
  assert.equal(again.statusCode, 200);
  assert.equal(fetch2.calls.length, 0);
  assert.ok(!pool2.log.some((l) => l.sql.startsWith('UPDATE')));
});

test('webhook (darowizna): domknięcie tylko oczekującej darowizny o tej kwocie, jedno podziękowanie', async () => {
  const tx = pendingTx({
    invoice_id: null, amount: 5000,
    gateway_response: { purpose: 'donation', tenant_db: 'avenit_tenant_kosciol', donation_id: 'd-1' },
  });
  const tenantPool = fakePool([[/^UPDATE donations/, () => ({ rows: [{ donor_email: 'dar@x.pl', amount: 50, currency: 'PLN' }] })]]);
  const mails = [];
  Object.assign(webhook.deps, {
    platformPool: webhookPool({ tx }),
    fetch: fakeFetch(() => ({ data: { status: 'success' } })),
    getTenantPool: () => tenantPool,
    sendEmail: async (m) => { mails.push(m); },
  });
  const reply = fakeReply();
  await webhook.default({ tenant: TENANT, log: quietLog, body: notification({ amount: 5000, originAmount: 5000 }) }, reply);
  assert.equal(reply.statusCode, 200);
  const upd = tenantPool.log.find((l) => l.sql.startsWith('UPDATE donations'));
  assert.ok(upd.sql.includes("status = 'pending'") && upd.sql.includes('round(amount * 100) = $4'));
  assert.equal(upd.params[3], 5000);
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, 'dar@x.pl');
});

test('schema platform: trigger odblokowuje tenanta tylko dla pełnej płatności faktury', async () => {
  const fs = await import('node:fs');
  const sql = fs.readFileSync(new URL('../db/platform/schema.sql', import.meta.url), 'utf8');
  const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION update_invoice_on_payment'), sql.indexOf('DROP TRIGGER IF EXISTS trigger_update_invoice_on_payment'));
  assert.match(fn, /NEW\.invoice_id IS NOT NULL/);
  assert.match(fn, /NEW\.amount = inv\.total/);
  assert.match(fn, /inv\.tenant_id = NEW\.tenant_id/);
  // Odblokowanie tenanta wewnątrz warunku faktury (po sprawdzeniu kwoty).
  assert.ok(fn.indexOf('UPDATE tenants') > fn.indexOf('NEW.amount = inv.total'));
});

// ── giving-create-payment ─────────────────────────────────────────────────────
const CAMPAIGN_ID = 'dddddddd-0000-4000-8000-000000000004';
const FUND_ID = 'eeeeeeee-0000-4000-8000-000000000005';

test('giving: rateLimit per IP', () => {
  assert.ok(giving.rateLimit?.max > 0);
});

test('resolveGivingTarget: nieaktywna/obca kampania i fundusz odrzucone; fundusz z kampanii', async () => {
  const empty = fakePool();
  assert.ok((await giving.resolveGivingTarget(empty, { campaign_id: CAMPAIGN_ID })).error);
  assert.ok((await giving.resolveGivingTarget(empty, { fund_id: FUND_ID })).error);
  assert.ok((await giving.resolveGivingTarget(empty, { fund_id: '1; DROP TABLE x' })).error);
  const db = fakePool([[/FROM giving_campaigns/, () => ({ rows: [{ id: CAMPAIGN_ID, fund_id: FUND_ID }] })]]);
  const r = await giving.resolveGivingTarget(db, { campaign_id: CAMPAIGN_ID, fund_id: 'ffffffff-0000-4000-8000-000000000009' });
  assert.deepEqual(r, { fundId: FUND_ID, campaignId: CAMPAIGN_ID });
  assert.match(db.log[0].sql, /COALESCE\(is_active, true\)/);
});

test('giving: zła kwota/e-mail → 400 bez zapisu darowizny', async () => {
  for (const body of [{ amount: 0.001, email: 'a@b.pl' }, { amount: 'abc', email: 'a@b.pl' }, { amount: 20, email: 'nie-email' }]) {
    const db = fakePool();
    const reply = fakeReply();
    await giving.default({ tenant: TENANT, db, log: quietLog, body }, reply);
    assert.equal(reply.statusCode, 400);
    assert.equal(db.log.length, 0);
  }
});

test('giving: zarejestrowana kwota w groszach = zapisana w transakcji, adres powrotu tylko tenanta', async () => {
  const db = fakePool([
    [/FROM giving_funds/, () => ({ rows: [{ id: FUND_ID }] })],
    [/^INSERT INTO donations/, () => ({ rows: [{ id: 'don-1' }] })],
  ]);
  const platform = fakePool();
  const fetchFn = fakeFetch(() => ({ data: { token: 'GT' } }));
  Object.assign(giving.deps, { platformPool: platform, fetch: fetchFn });
  const reply = fakeReply();
  await giving.default({
    tenant: TENANT, db, log: quietLog,
    body: { amount: 50.5, email: 'dar@x.pl', fund_id: FUND_ID, returnUrl: 'https://evil.example/' },
  }, reply);
  assert.equal(reply.statusCode, 200);
  assert.equal(fetchFn.calls[0].body.amount, 5050);
  assert.equal(fetchFn.calls[0].body.urlReturn, 'https://kosciol.avenit.pl/give/success');
  assert.equal(fetchFn.calls[0].body.urlStatus, 'https://kosciol.avenit.pl/api/fn/przelewy24-webhook');
  const ins = platform.log.find((l) => l.sql.startsWith('INSERT INTO payment_transactions'));
  assert.equal(ins.params[0], TENANT.id);
  assert.equal(ins.params[3], 5050);
  assert.equal(JSON.parse(ins.params[4]).donation_id, 'don-1');
});

test('giving: nieudany zapis transakcji → darowizna failed, 500, brak linku', async () => {
  const db = fakePool([[/^INSERT INTO donations/, () => ({ rows: [{ id: 'don-2' }] })]]);
  const platform = fakePool([[/^INSERT INTO payment_transactions/, () => { throw new Error('down'); }]]);
  Object.assign(giving.deps, { platformPool: platform, fetch: fakeFetch(() => ({ data: { token: 'GT' } })) });
  const reply = fakeReply();
  await giving.default({ tenant: TENANT, db, log: quietLog, body: { amount: 20, email: 'dar@x.pl' } }, reply);
  assert.equal(reply.statusCode, 500);
  assert.equal(reply.body.paymentUrl, undefined);
  assert.ok(db.log.some((l) => l.sql.startsWith("UPDATE donations SET status = 'failed'")));
});
