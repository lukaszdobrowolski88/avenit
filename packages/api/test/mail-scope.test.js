// Poczta: skrzynka i wiadomości tylko właściciela.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mailScope, enforceMailWrite, mailAudience, isMailTable } from '../src/dataapi/mailScope.js';
import { enforceCampaignStatus } from '../src/dataapi/sharedWrites.js';

test('zakres: konto po user_email, wiadomości przez konto, załączniki przez wiadomość', () => {
  const p = [];
  assert.match(mailScope('mail_accounts', { email: 'A@b.pl' }).select('t', (v) => { p.push(v); return p.length; }), /lower\(t\."user_email"\) = \$1/);
  assert.deepEqual(p, ['a@b.pl']);
  assert.match(mailScope('mail_messages', { email: 'a@b.pl' }).select('t', () => 1), /mail_accounts ma_ WHERE ma_\."id" = t\."account_id"/);
  assert.match(mailScope('mail_attachments', { email: 'a@b.pl' }).select('t', () => 1), /FROM mail_messages mm_/);
  assert.ok(isMailTable('mail_folders') && !isMailTable('email_campaigns'));
});

test('zapis: konto zawsze dla siebie; wiadomość tylko do własnego konta', async () => {
  const req = (n) => ({ user: { email: 'a@b.pl' }, db: { query: async () => ({ rows: [{ n }] }) } });
  const acc = { table: 'mail_accounts', op: 'insert', values: { account_type: 'internal' } };
  await enforceMailWrite(acc, req(1));
  assert.equal(acc.values.user_email, 'a@b.pl');
  await assert.rejects(enforceMailWrite({ table: 'mail_accounts', op: 'insert', values: { user_email: 'inny@b.pl' } }, req(1)), (e) => e.status === 403);
  await assert.rejects(enforceMailWrite({ table: 'mail_messages', op: 'insert', values: { account_id: 'x' } }, req(0)), (e) => e.status === 403);
  await enforceMailWrite({ table: 'mail_messages', op: 'insert', values: { account_id: 'x' } }, req(1));
});

test('realtime Poczty: tylko właściciel', async () => {
  const db = { query: async () => ({ rows: [{ e: 'a@b.pl' }] }) };
  assert.deepEqual([...await mailAudience(db, 'mail_messages', [{ account_id: 'x' }])], ['a@b.pl']);
  assert.equal(await mailAudience(db, 'events', [{}]), null);
});

test('Mailing: status wysyłki tylko z action:mailing:send', () => {
  const r = (...c) => ({ can: (x) => c.includes(x) });
  assert.throws(() => enforceCampaignStatus({ table: 'email_campaigns', op: 'update', values: { status: 'sending' } }, r('module:mailing')), (e) => e.status === 403);
  enforceCampaignStatus({ table: 'email_campaigns', op: 'update', values: { status: 'draft' } }, r('module:mailing'));
  enforceCampaignStatus({ table: 'email_campaigns', op: 'update', values: { status: 'scheduled' } }, r('action:mailing:send'));
});
