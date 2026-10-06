// Publiczne formularze: sekrety płatności nie wychodzą do gościa, e-maile składa serwer
// i escapuje dane wpisane w formularzu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicSettings } from '../src/fn/public-form-get.js';
import { buildSubmissionEmails, findRespondent } from '@avenit/shared/src/forms/formEmails.js';

test('publicSettings usuwa klucze bramek i listę adresów administratorów', () => {
  const s = publicSettings({
    pricing: { przelewy24: { merchantId: '123', crcKey: 'tajny', apiKey: 'tajny2' }, currency: 'PLN' },
    emails: { enabled: true, adminNotification: { enabled: true, emails: ['admin@kosciol.pl'] } },
  });
  assert.equal(s.pricing.przelewy24.merchantId, '123');
  assert.equal(s.pricing.przelewy24.crcKey, undefined);
  assert.equal(s.pricing.przelewy24.apiKey, undefined);
  assert.equal(s.emails.adminNotification.emails, undefined);
  assert.equal(s.emails.adminNotification.enabled, true);
});

const form = {
  id: 'f1', title: 'Rejestracja',
  fields: [{ id: 'e', type: 'email', label: 'E-mail' }, { id: 'n', type: 'text', label: 'Imię i nazwisko' }],
  settings: {
    emails: { enabled: true, adminNotification: { enabled: true, emails: ['admin@kosciol.pl'] } },
    pricing: { paymentMethods: ['transfer'], bankAccount: '12 3456', currency: 'PLN' },
  },
};

test('findRespondent bierze e-mail i imię z odpowiedzi', () => {
  assert.deepEqual(findRespondent(form.fields, { e: 'jan@x.pl', n: 'Jan Nowak' }), { email: 'jan@x.pl', name: 'Jan Nowak' });
});

test('buildSubmissionEmails: potwierdzenie, przelew i admin; HTML z odpowiedzi jest escapowany', () => {
  const mails = buildSubmissionEmails({
    form, answers: { e: 'jan@x.pl', n: '<script>alert(1)</script>' }, totalPrice: 50, paymentMethod: 'transfer', origin: 'https://x',
  });
  assert.deepEqual(mails.map((m) => `${m.type}:${m.to}`), ['confirmation:jan@x.pl', 'payment_info:jan@x.pl', 'admin_notification:admin@kosciol.pl']);
  const admin = mails.find((m) => m.type === 'admin_notification');
  assert.ok(!admin.html.includes('<script>'));
  assert.ok(admin.html.includes('&lt;script&gt;'));
});

test('buildSubmissionEmails: wyłączone e-maile → nic nie wysyła', () => {
  assert.deepEqual(buildSubmissionEmails({ form: { ...form, settings: { emails: { enabled: false } } }, answers: { e: 'a@b.pl' } }), []);
});
