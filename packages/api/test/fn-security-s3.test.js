// Audyt bezpieczeństwa 2026-10, runda 3 (S3): funkcje serwera — propozycje budżetu, załącznik
// programu (path traversal), eskalacja uprawnień kont, SSO, AI, limity publicznych funkcji,
// webhook SMS, trasy publiczne po id. Fałszywe bazy i poczta — nic nie wychodzi na zewnątrz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import rateLimitPlugin from '@fastify/rate-limit';

import * as budgetNotify from '../src/fn/budget-proposal-notify.js';
import * as programEmail from '../src/fn/send-program-email.js';
import { storagePath } from '../src/storage/files.js';
import { accountChangeDenied, exceedsCaller, isFullAdmin } from '../src/lib/admin-guard.js';
import adminUpdateUser from '../src/fn/admin-update-user.js';
import adminSetPassword from '../src/fn/admin-set-user-password.js';
import ssoSaveConfig from '../src/fn/sso-save-config.js';
import * as aiAssist from '../src/fn/ai-assist.js';
import * as pushAction from '../src/fn/push-action-handler.js';
import * as pushTrack from '../src/fn/push-event-track.js';
import * as rsvpRespond from '../src/fn/rsvp-respond.js';
import * as smsWebhook from '../src/fn/sms-incoming-webhook.js';
import publicPageRoutes, { isInvalidIdError, PUBLIC_RATE_LIMITS } from '../src/public/routes.js';
import { FN_CAPABILITY } from '@avenit/shared/src/permissions/catalog.js';
import { presetGrantRows } from '@avenit/shared/src/permissions/presets.js';
import { can } from '@avenit/shared/src/permissions/resolve.js';

const quietLog = { error() {}, warn() {}, info() {} };
let dbSeq = 0;
const nextDbName = () => `s3_${process.pid}_${++dbSeq}`;

function fakeReply() {
  return {
    statusCode: 200, body: undefined, sent: false,
    code(c) { this.statusCode = c; return this; },
    send(b) { this.body = b; this.sent = true; return this; },
  };
}

// Baza tenanta: granty (loadGrants) + lista [regex, handler]; log pozostałych zapytań.
function fakeDb({ grants = [], adminRoles = ['admin'], handlers = [] } = {}) {
  const log = [];
  return {
    log,
    async query(sql, params = []) {
      const flat = sql.replace(/\s+/g, ' ').trim();
      if (/^SELECT key FROM app_modules/.test(flat)) return { rows: [] };
      if (/FROM permission_grants$/.test(flat) || /^SELECT role, user_id, capability, allowed FROM permission_grants/.test(flat)) return { rows: grants };
      if (/^SELECT key FROM app_roles WHERE is_admin = true/.test(flat)) return { rows: adminRoles.map((key) => ({ key })) };
      if (/FROM ministry_memberships/.test(flat)) return { rows: [] };
      log.push({ sql: flat, params });
      for (const [re, fn] of handlers) if (re.test(flat)) return fn(params) || { rows: [] };
      return { rows: [], rowCount: 0 };
    },
  };
}

const GRANTS = [
  { role: 'kadry', user_id: null, capability: 'action:settings:manage_users', allowed: true },
  { role: 'kadry', user_id: null, capability: 'module:members', allowed: true },
  { role: 'rada_starszych', user_id: null, capability: '*', allowed: true },
  { role: 'skarbnik', user_id: null, capability: 'action:finance:approve', allowed: true },
  { role: 'czlonek', user_id: null, capability: 'module:teaching', allowed: true },
];

// ── budget-proposal-notify ───────────────────────────────────────────────────
const PROPOSAL_ID = '11111111-2222-4333-8444-555555555555';
const proposal = (over = {}) => ({
  id: PROPOSAL_ID, year: 2027, kind: 'expense', team_type: 'media', description: '<img src=x onerror=alert(1)>Kamera',
  amount: 2500, note: '<script>steal()</script>', submitted_by: 'lider@kosciol.pl', status: 'pending', ...over,
});

test('notifyAccessError: submitted — zgłaszający lub zatwierdzający; decided — tylko zatwierdzający', () => {
  const p = proposal();
  assert.equal(budgetNotify.notifyAccessError({ event: 'submitted', proposal: p, callerEmail: 'LIDER@kosciol.pl', approver: false }), null);
  assert.ok(budgetNotify.notifyAccessError({ event: 'submitted', proposal: p, callerEmail: 'obcy@x.pl', approver: false }));
  assert.equal(budgetNotify.notifyAccessError({ event: 'submitted', proposal: p, callerEmail: 'obcy@x.pl', approver: true }), null);
  assert.ok(budgetNotify.notifyAccessError({ event: 'submitted', proposal: proposal({ status: 'approved' }), callerEmail: 'lider@kosciol.pl', approver: false }));
  assert.ok(budgetNotify.notifyAccessError({ event: 'decided', proposal: proposal({ status: 'approved' }), callerEmail: 'lider@kosciol.pl', approver: false }));
  assert.equal(budgetNotify.notifyAccessError({ event: 'decided', proposal: proposal({ status: 'rejected' }), callerEmail: 'x', approver: true }), null);
  assert.ok(budgetNotify.notifyAccessError({ event: 'decided', proposal: proposal({ status: 'pending' }), callerEmail: 'x', approver: true }));
});

test('buildProposalEmail: treść zgłaszającego escapowana', () => {
  const { html } = budgetNotify.buildProposalEmail('submitted', proposal(), 'Kościół');
  assert.ok(!html.includes('<script>') && !html.includes('<img'));
  assert.ok(html.includes('&lt;script&gt;steal()&lt;/script&gt;'));
  const decided = budgetNotify.buildProposalEmail('decided', proposal({ status: 'approved' }), 'K').html;
  assert.ok(!decided.includes('<img'));
});

function budgetReq({ role, email, id = 'u1', p = proposal() }) {
  const db = fakeDb({
    grants: GRANTS,
    handlers: [
      [/FROM app_users WHERE id = \$1/, () => ({ rows: [{ id, role, is_super_admin: false, is_active: true }] })],
      [/FROM budget_proposals WHERE id = \$1/, () => ({ rows: [p] })],
      [/SELECT DISTINCT u.email FROM app_users/, () => ({ rows: [{ email: 'skarbnik@kosciol.pl' }] })],
    ],
  });
  return { db, user: { id, email, role }, tenant: { slug: 'k', db_name: nextDbName() }, log: quietLog };
}

test('budget-proposal-notify: obcy członek nie wyśle maili o cudzej propozycji (403, zero maili)', async () => {
  const sent = [];
  budgetNotify.deps.sendEmail = async (m) => { sent.push(m); };
  const req = { ...budgetReq({ role: 'czlonek', email: 'obcy@x.pl' }), body: { proposalId: PROPOSAL_ID, event: 'submitted' } };
  const reply = fakeReply();
  await budgetNotify.default(req, reply);
  assert.equal(reply.statusCode, 403);
  const decided = { ...budgetReq({ role: 'czlonek', email: 'lider@kosciol.pl', p: proposal({ status: 'approved' }) }), body: { proposalId: PROPOSAL_ID, event: 'decided' } };
  const reply2 = fakeReply();
  await budgetNotify.default(decided, reply2);
  assert.equal(reply2.statusCode, 403);
  assert.equal(sent.length, 0);
});

test('budget-proposal-notify: zgłaszający → mail do skarbnika z escapowaną treścią; skarbnik może „decided”', async () => {
  const sent = [];
  budgetNotify.deps.sendEmail = async (m) => { sent.push(m); };
  const reply = fakeReply();
  await budgetNotify.default({ ...budgetReq({ role: 'czlonek', email: 'lider@kosciol.pl' }), body: { proposalId: PROPOSAL_ID, event: 'submitted' } }, reply);
  assert.equal(reply.statusCode, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'skarbnik@kosciol.pl');
  assert.ok(!sent[0].html.includes('<script>'));

  const reply2 = fakeReply();
  await budgetNotify.default({ ...budgetReq({ role: 'skarbnik', email: 'skarbnik@kosciol.pl', p: proposal({ status: 'approved' }) }), body: { proposalId: PROPOSAL_ID, event: 'decided' } }, reply2);
  assert.equal(reply2.statusCode, 200);
  assert.equal(sent.at(-1).to, 'lider@kosciol.pl');
});

// ── send-program-email: ścieżka załącznika ───────────────────────────────────
test('storagePath: wyjście poza bucket tenanta odrzucone (stary exploit ../../inny-tenant)', () => {
  const base = '/data/storage';
  assert.equal(storagePath('kosciol', 'programs', 'p1/Program-2026-10-12.pdf', base), '/data/storage/kosciol/programs/p1/Program-2026-10-12.pdf');
  for (const bad of ['../../inny/programs/x.pdf', '../finance/x.pdf', '/etc/passwd', 'a/../../x.pdf', '..', 'a//b.pdf', './x.pdf', 'a\\..\\x.pdf', 'x\0.pdf', '']) {
    assert.throws(() => storagePath('kosciol', 'programs', bad, base), (e) => e.status === 400, bad);
  }
  assert.throws(() => storagePath('../inny', 'programs', 'x.pdf', base), (e) => e.status === 400);
});

test('programAttachmentPath: tylko PDF w buckecie programs bieżącego tenanta', () => {
  assert.equal(programEmail.programAttachmentPath('kosciol', 'p1/Program.pdf', '/s'), 'p1/Program.pdf');
  assert.throws(() => programEmail.programAttachmentPath('kosciol', 'p1/haslo.txt', '/s'));
  assert.throws(() => programEmail.programAttachmentPath('kosciol', '../../inny/programs/x.pdf', '/s'));
  assert.throws(() => programEmail.programAttachmentPath('kosciol', '/abs/x.pdf', '/s'));
});

test('send-program-email: traversal → 400 bez wysyłki; poprawna ścieżka → załącznik z bucketu tenanta', async () => {
  const sent = [];
  const reads = [];
  programEmail.deps.sendEmail = async (m) => { sent.push(m); };
  programEmail.deps.readStorageFileBase64 = async (...args) => { reads.push(args); return 'UEZE'; };
  const base = { tenant: { slug: 'kosciol' }, log: quietLog };
  const bad = fakeReply();
  await programEmail.default({ ...base, body: { emailTo: ['a@b.pl'], htmlBody: '<p>x</p>', filePath: '../../inny/programs/tajne.pdf' } }, bad);
  assert.equal(bad.statusCode, 400);
  assert.equal(sent.length, 0);
  assert.equal(reads.length, 0);

  const ok = fakeReply();
  await programEmail.default({ ...base, body: { emailTo: ['a@b.pl'], htmlBody: '<p>x</p>', filePath: 'p1/Program-2026-10-12.pdf', filename: '../x"' } }, ok);
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(reads[0], ['kosciol', 'programs', 'p1/Program-2026-10-12.pdf']);
  assert.equal(sent[0].attachments.length, 1);
  assert.ok(!/[\\/"]/.test(sent[0].attachments[0].filename));
});

// ── Konta: manage_users bez roli admina ──────────────────────────────────────
const kadry = { id: 'k1', email: 'kadry@k.pl', role: 'kadry', is_active: true, is_super_admin: false, role_admin: false, canManage: true };
const admin = { id: 'a1', email: 'admin@k.pl', role: 'admin', is_active: true, is_super_admin: false, role_admin: true, canManage: true };
const rolesDb = () => fakeDb({
  grants: GRANTS,
  handlers: [[/FROM app_roles WHERE key = \$1/, (p) => ({ rows: [{ a: p[0] === 'admin' }] })]],
});
const loaded = { grants: GRANTS, adminRoles: new Set(['admin']) };

test('admin-guard: isFullAdmin tylko superadmin / rola is_admin', () => {
  assert.equal(isFullAdmin(kadry), false);
  assert.equal(isFullAdmin(admin), true);
  assert.equal(isFullAdmin({ ...admin, is_active: false }), false);
});

test('admin-guard: kadry nie nada roli admina ani roli z „*”, nie ruszy admina; admin bez ograniczeń', async () => {
  const db = rolesDb();
  const member = { id: 'm1', role: 'czlonek', is_super_admin: false, role_admin: false };
  assert.equal(await accountChangeDenied(db, 'x', kadry, member, { newRole: 'czlonek' }, loaded), null);
  assert.match(await accountChangeDenied(db, 'x', kadry, member, { newRole: 'admin' }, loaded), /administratora/);
  assert.match(await accountChangeDenied(db, 'x', kadry, member, { newRole: 'rada_starszych' }, loaded), /których sam nie masz/);
  assert.match(await accountChangeDenied(db, 'x', kadry, { id: 'a1', role: 'admin', role_admin: true }, {}, loaded), /administratora/);
  assert.match(await accountChangeDenied(db, 'x', kadry, { id: 'r1', role: 'rada_starszych' }, {}, loaded), /szerszymi/);
  assert.equal(await accountChangeDenied(db, 'x', kadry, { ...kadry }, { newRole: 'kadry' }, loaded), null, 'edycja siebie bez zmiany roli');
  assert.equal(await accountChangeDenied(db, 'x', admin, { id: 'a2', role: 'admin', role_admin: true }, { newRole: 'rada_starszych' }, loaded), null);
  assert.equal(await exceedsCaller(db, 'x', { role: 'czlonek' }, kadry, loaded), false);
});

function accountsDb({ caller, target, onUpdate }) {
  const users = { [caller.id]: caller, [target.id]: target };
  return fakeDb({
    grants: GRANTS,
    handlers: [
      [/FROM app_users u LEFT JOIN app_roles r ON u.role = r.key WHERE u.id = \$1/, (p) => ({ rows: users[p[0]] ? [users[p[0]]] : [] })],
      [/FROM app_users WHERE id = \$1/, (p) => ({ rows: users[p[0]] ? [users[p[0]]] : [] })],
      [/FROM app_roles WHERE key = \$1/, (p) => ({ rows: [{ a: p[0] === 'admin' }] })],
      [/^UPDATE app_users/, (p) => { onUpdate?.(p); return { rows: [], rowCount: 1 }; }],
      // Powiadomienia o zmianie konta wyłączone — test nie może wysłać maila.
      [/key = 'account_change_emails'/, () => ({ rows: [{ value: 'off' }] })],
    ],
  });
}

test('admin-update-user: kadry (manage_users) nadające sobie/innym rolę admina → 403 bez UPDATE', async () => {
  const target = { id: 'm1', email: 'm@k.pl', role: 'czlonek', is_active: true, is_super_admin: false, role_admin: false, full_name: 'M', status: 'active', campus_id: null, totp_required: false };
  for (const [who, body] of [[target, { userId: 'm1', role: 'admin' }], [kadry, { userId: 'k1', role: 'admin' }], [target, { userId: 'm1', role: 'rada_starszych' }]]) {
    let updated = false;
    const db = accountsDb({ caller: { ...kadry }, target: { ...target, ...(who === kadry ? kadry : {}) }, onUpdate: () => { updated = true; } });
    const reply = fakeReply();
    await adminUpdateUser({ db, user: { id: 'k1', role: 'kadry' }, tenant: { db_name: nextDbName() }, body, log: quietLog }, reply);
    assert.equal(reply.statusCode, 403, JSON.stringify(body));
    assert.equal(updated, false);
  }
});

test('admin-update-user: kadry zmienia zwykłe konto (bez eskalacji) → OK; admin może nadać admina', async () => {
  const target = { id: 'm1', email: 'm@k.pl', role: 'czlonek', is_active: true, is_super_admin: false, role_admin: false, full_name: 'M', status: 'active', campus_id: null, totp_required: false };
  let updated = false;
  const db = accountsDb({ caller: { ...kadry }, target, onUpdate: () => { updated = true; } });
  const reply = fakeReply();
  await adminUpdateUser({ db, user: { id: 'k1', role: 'kadry' }, tenant: { db_name: nextDbName() }, body: { userId: 'm1', full_name: 'Marek' }, log: quietLog }, reply);
  assert.equal(reply.statusCode, 200);
  assert.equal(updated, true);

  let adminUpdated = false;
  const db2 = accountsDb({ caller: { ...admin }, target, onUpdate: () => { adminUpdated = true; } });
  const reply2 = fakeReply();
  await adminUpdateUser({ db: db2, user: { id: 'a1', role: 'admin' }, tenant: { db_name: nextDbName() }, body: { userId: 'm1', role: 'admin' }, log: quietLog }, reply2);
  assert.equal(reply2.statusCode, 200);
  assert.equal(adminUpdated, true);
});

test('admin-set-user-password: kadry nie ustawi hasła administratorowi ani roli z „*” (przejęcie konta)', async () => {
  for (const target of [
    { id: 'a2', email: 'a2@k.pl', role: 'admin', is_active: true, is_super_admin: false },
    { id: 'r1', email: 'r@k.pl', role: 'rada_starszych', is_active: true, is_super_admin: false },
  ]) {
    let updated = false;
    const db = accountsDb({ caller: { ...kadry }, target, onUpdate: () => { updated = true; } });
    const reply = fakeReply();
    await adminSetPassword({ db, user: { id: 'k1' }, tenant: { db_name: nextDbName() }, body: { userId: target.id, password: 'Silne-Haslo-2026x' }, log: quietLog }, reply);
    assert.equal(reply.statusCode, 403, target.role);
    assert.equal(updated, false);
  }
});

test('sso-save-config: samo manage_users → 403; administrator zapisuje', async () => {
  const target = { id: 'x', role: 'czlonek' };
  const db = accountsDb({ caller: { ...kadry }, target });
  const reply = fakeReply();
  await ssoSaveConfig({ db, user: { id: 'k1' }, tenant: { db_name: nextDbName() }, body: { provider: 'google', enabled: true, default_role: 'admin' } }, reply);
  assert.equal(reply.statusCode, 403);
  assert.ok(!db.log.some((l) => l.sql.startsWith('INSERT INTO app_settings')));

  const db2 = accountsDb({ caller: { ...admin }, target });
  const reply2 = fakeReply();
  await ssoSaveConfig({ db: db2, user: { id: 'a1' }, tenant: { db_name: nextDbName() }, body: { provider: 'google', enabled: true } }, reply2);
  assert.equal(reply2.statusCode, 200);
  assert.ok(db2.log.some((l) => l.sql.startsWith('INSERT INTO app_settings')));
});

// ── ai-assist ────────────────────────────────────────────────────────────────
test('ai-assist: domyślnie wyłączone (env), tenant może wyłączyć, wymaga action:ai:use, ma limit', async () => {
  const db = (value) => ({ query: async () => ({ rows: value == null ? [] : [{ value }] }) });
  assert.equal(await aiAssist.aiEnabled(db(null), {}), false);
  assert.equal(await aiAssist.aiEnabled(db(null), { AI_ENABLED: 'false' }), false);
  assert.equal(await aiAssist.aiEnabled(db(null), { AI_ENABLED: 'true' }), true);
  assert.equal(await aiAssist.aiEnabled(db('off'), { AI_ENABLED: 'true' }), false);
  assert.equal(FN_CAPABILITY['ai-assist'], 'action:ai:use');
  const presets = presetGrantRows();
  assert.equal(can(presets, { role: 'czlonek' }, 'action:ai:use'), false);
  assert.equal(can(presets, { role: 'rada_starszych' }, 'action:ai:use'), true);
  assert.ok(aiAssist.rateLimit?.max > 0);
});

test('ai-assist: przy wyłączonym AI → 403 bez wywołania LLM', async () => {
  const prev = process.env.AI_ENABLED;
  delete process.env.AI_ENABLED;
  const origFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; return { ok: true, json: async () => ({}) }; };
  try {
    const reply = fakeReply();
    await aiAssist.default({ db: { query: async () => ({ rows: [] }) }, user: { email: 'a@b.pl' }, body: { task: 'draft_message', input: 'x' }, log: quietLog }, reply);
    assert.equal(reply.statusCode, 403);
    assert.equal(reply.body.code, 'ai_disabled');
    assert.equal(called, false);
  } finally {
    globalThis.fetch = origFetch;
    if (prev !== undefined) process.env.AI_ENABLED = prev;
  }
});

// ── Publiczne funkcje: limity + walidacja ────────────────────────────────────
test('rateLimit na publicznych funkcjach push/RSVP i powiadomieniach budżetu', () => {
  for (const mod of [pushAction, pushTrack, rsvpRespond, budgetNotify]) assert.ok(mod.rateLimit?.max > 0);
});

const CAMP = 'aaaaaaaa-1111-4111-8111-111111111111';
const RCPT = 'bbbbbbbb-2222-4222-8222-222222222222';

test('push-action-handler: zły UUID / nieznana para → 404; e-mail z wiersza odbiorcy, nie z body', async () => {
  const db0 = fakeDb();
  const r0 = fakeReply();
  await pushAction.default({ db: db0, log: quietLog, body: { campaign_id: 'x', recipient_id: RCPT, user_email: 'a@b.pl' } }, r0);
  assert.equal(r0.statusCode, 404);
  assert.equal(db0.log.length, 0);

  const db1 = fakeDb({ handlers: [[/^UPDATE push_campaign_recipients/, () => ({ rows: [] })]] });
  const r1 = fakeReply();
  await pushAction.default({ db: db1, log: quietLog, body: { campaign_id: CAMP, recipient_id: RCPT, action_type: 'inline_rsvp', action_value: 'yes' } }, r1);
  assert.equal(r1.statusCode, 404);
  assert.ok(!db1.log.some((l) => /push_inline_responses|update_push_campaign_stats/.test(l.sql)));

  const db2 = fakeDb({ handlers: [[/^UPDATE push_campaign_recipients/, () => ({ rows: [{ user_email: 'jan@kosciol.pl' }] })]] });
  const r2 = fakeReply();
  await pushAction.default({ db: db2, log: quietLog, body: { campaign_id: CAMP, recipient_id: RCPT, user_email: 'evil@x.pl', action_type: 'inline_rsvp', action_value: 'yes' } }, r2);
  assert.equal(r2.statusCode, 200);
  const ins = db2.log.find((l) => l.sql.startsWith('INSERT INTO push_inline_responses'));
  assert.equal(ins.params[2], 'jan@kosciol.pl');
});

test('push-event-track: nieznana para → 404 bez przeliczania statystyk', async () => {
  const db = fakeDb({ handlers: [[/^SELECT status FROM push_campaign_recipients/, () => ({ rows: [] })]] });
  const reply = fakeReply();
  await pushTrack.default({ db, log: quietLog, body: { campaign_id: CAMP, recipient_id: RCPT, event: 'opened' } }, reply);
  assert.equal(reply.statusCode, 404);
  assert.ok(!db.log.some((l) => /update_push_campaign_stats/.test(l.sql)));
});

test('rsvp-respond: token w złym formacie → 404 bez zapytań; goście ograniczeni', async () => {
  const db0 = fakeDb();
  const r0 = fakeReply();
  await rsvpRespond.default({ db: db0, log: quietLog, body: { token: { $ne: 1 } } }, r0);
  assert.equal(r0.statusCode, 404);
  assert.equal(db0.log.length, 0);

  const db = fakeDb({ handlers: [[/FROM rsvp_invitations i JOIN rsvp_campaigns c ON c.id = i.campaign_id WHERE i.token = \$1$/, () => ({ rows: [{ status: 'open' }] })]] });
  const r = fakeReply();
  await rsvpRespond.default({ db, log: quietLog, body: { token: 'r0abcdefgh12', answer: 'yes', guests: 100000 } }, r);
  const upd = db.log.find((l) => l.sql.startsWith('UPDATE rsvp_invitations'));
  assert.equal(upd.params[1], 50);
});

// ── sms-incoming-webhook ─────────────────────────────────────────────────────
test('sms-incoming-webhook: bez skonfigurowanego sekretu → 401 i nic nie zapisuje', async () => {
  assert.equal(smsWebhook.webhookAuthorized(null, 'x'), false);
  assert.equal(smsWebhook.webhookAuthorized('s3cret', 's3cret'), true);
  assert.equal(smsWebhook.webhookAuthorized('s3cret', 's3cre'), false);
  assert.equal(smsWebhook.webhookAuthorized('s3cret', undefined), false);

  const db = fakeDb();
  const reply = fakeReply();
  await smsWebhook.default({ db, method: 'GET', query: { sms_from: '48500100200', sms_text: 'TAK' }, log: quietLog }, reply);
  assert.equal(reply.statusCode, 401);
  assert.ok(!db.log.some((l) => /INSERT|UPDATE/.test(l.sql)));

  const db2 = fakeDb({ handlers: [[/FROM integration_settings/, () => ({ rows: [{ key: 'smsapi_webhook_secret', value: 's3cret' }] })]] });
  const bad = fakeReply();
  await smsWebhook.default({ db: db2, method: 'GET', query: { secret: 'zle', sms_from: '48500100200', sms_text: 'TAK' }, log: quietLog }, bad);
  assert.equal(bad.statusCode, 401);
});

// ── public/routes.js: id typowane + limity ───────────────────────────────────
test('public/routes: bez id::text; zły format id dla typu kolumny → 404', async () => {
  const src = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '../src/public/routes.js'), 'utf8');
  assert.doesNotMatch(src, /id::text/);
  assert.equal(isInvalidIdError({ code: '22P02' }), true);
  assert.equal(isInvalidIdError({ code: '23505' }), false);

  const app = Fastify();
  await app.register(rateLimitPlugin, { global: false });
  app.decorateRequest('db', null);
  app.decorateRequest('tenant', null);
  app.decorateRequest('user', null);
  const db = {
    query: async (sql) => {
      if (/FROM schedule_assignments WHERE id = \$1/.test(sql)) { const e = new Error('invalid input syntax for type uuid'); e.code = '22P02'; throw e; }
      return { rows: [] };
    },
  };
  app.decorate('requireTenant', async (req) => { req.db = db; req.tenant = { slug: 'k' }; });
  app.decorate('requireUser', async (req) => { req.db = db; req.tenant = { slug: 'k' }; req.user = { id: 'u', email: 'a@b.pl' }; });
  app.decorate('block2FAPending', async () => {});
  await app.register(publicPageRoutes);
  const res = await app.inject({ method: 'POST', url: '/api/assignment/abc/respond', payload: { action: 'accept' } });
  assert.equal(res.statusCode, 404);

  // Limit na odpowiedzi po tokenie (zgadywanie tokenów).
  const token = '00000000-0000-4000-8000-000000000000';
  let last;
  for (let i = 0; i <= PUBLIC_RATE_LIMITS.assignmentRespond.max; i++) {
    last = await app.inject({ method: 'POST', url: `/api/public/assignment/${token}/respond`, payload: { action: 'accept' } });
  }
  assert.equal(last.statusCode, 429);
  await app.close();
});
