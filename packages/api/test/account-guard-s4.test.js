// Audyt bezpieczeństwa 2026-10, runda 3 (S4): eskalacja uprawnień przez osobę z samym
// action:settings:manage_users (bez roli administratora) — fn kont (reset 2FA, usuwanie, blokada,
// wylogowanie), zapis app_users / app_settings (sso_*) przez Data API, tokeny RSVP serii,
// sessionId płatności formularza P24. Fałszywe bazy — nic nie wychodzi na zewnątrz.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import adminReset2fa from '../src/fn/admin-reset-2fa.js';
import deleteUser from '../src/fn/delete-user.js';
import setUserStatus from '../src/fn/set-user-status.js';
import forceLogout from '../src/fn/force-logout-user.js';
import { enforceAccountWrite } from '../src/dataapi/sharedWrites.js';
import { token as rsvpToken } from '../src/fn/rsvp-series.js';
import * as createPayment from '../src/fn/przelewy24-create-payment.js';
import { config } from '../src/config.js';

const quietLog = { error() {}, warn() {}, info() {} };
let dbSeq = 0;
const nextDbName = () => `s4_${process.pid}_${++dbSeq}`;

function fakeReply() {
  return {
    statusCode: 200, body: undefined,
    code(c) { this.statusCode = c; return this; },
    send(b) { this.body = b; return this; },
  };
}

const GRANTS = [
  { role: 'kadry', user_id: null, capability: 'action:settings:manage_users', allowed: true },
  { role: 'kadry', user_id: null, capability: 'action:settings:manage_integrations', allowed: true },
  { role: 'rada_starszych', user_id: null, capability: '*', allowed: true },
  { role: 'czlonek', user_id: null, capability: 'module:teaching', allowed: true },
];

// Baza tenanta: granty (loadGrants) + konta; log zapytań modyfikujących.
function fakeDb(users = {}, extra = []) {
  const log = [];
  return {
    log,
    async query(sql, params = []) {
      const flat = sql.replace(/\s+/g, ' ').trim();
      if (/^SELECT key FROM app_modules/.test(flat)) return { rows: [] };
      if (/^SELECT role, user_id, capability, allowed FROM permission_grants/.test(flat)) return { rows: GRANTS };
      if (/^SELECT key FROM app_roles WHERE is_admin = true/.test(flat)) return { rows: [{ key: 'admin' }] };
      if (/FROM ministry_memberships/.test(flat)) return { rows: [] };
      log.push({ sql: flat, params });
      for (const [re, fn] of extra) if (re.test(flat)) return fn(params, flat);
      if (/FROM app_users u LEFT JOIN app_roles r ON u.role = r.key WHERE u.id = \$1/.test(flat)) return { rows: users[params[0]] ? [users[params[0]]] : [] };
      if (/FROM app_users WHERE id = \$1/.test(flat)) return { rows: users[params[0]] ? [users[params[0]]] : [] };
      if (/FROM app_roles WHERE key = \$1/.test(flat)) return { rows: [{ a: params[0] === 'admin' }] };
      if (/key = 'account_change_emails'/.test(flat)) return { rows: [{ value: 'off' }] };
      if (/count\(\*\)::int AS n FROM app_users/.test(flat)) return { rows: [{ n: 5 }] };
      return { rows: [], rowCount: 0 };
    },
  };
}

const kadry = { id: 'k1', email: 'kadry@k.pl', role: 'kadry', is_active: true, is_super_admin: false, role_admin: false };
const admin = { id: 'a1', email: 'admin@k.pl', role: 'admin', is_active: true, is_super_admin: false, role_admin: true };
const adminTarget = { id: 'a2', email: 'a2@k.pl', full_name: 'A2', role: 'admin', is_active: true, is_super_admin: false };
const radaTarget = { id: 'r1', email: 'r@k.pl', full_name: 'R', role: 'rada_starszych', is_active: true, is_super_admin: false };
const memberTarget = { id: 'm1', email: 'm@k.pl', full_name: 'M', role: 'czlonek', is_active: true, is_super_admin: false };

const MUTATION = /^(UPDATE app_users|DELETE FROM|UPDATE refresh_tokens|INSERT INTO account_)/;
const FNS = [
  ['admin-reset-2fa', adminReset2fa, {}],
  ['delete-user', deleteUser, {}],
  ['set-user-status (blokada)', setUserStatus, { active: false }],
  ['set-user-status (odblokowanie)', setUserStatus, { active: true }],
  ['force-logout-user', forceLogout, {}],
];

async function call(fn, caller, target, body) {
  const db = fakeDb({ [caller.id]: caller, [target.id]: target });
  const reply = fakeReply();
  await fn({ db, user: { id: caller.id, email: caller.email, role: caller.role }, tenant: { db_name: nextDbName() }, body: { userId: target.id, ...body }, log: quietLog }, reply);
  return { reply, mutated: db.log.some((l) => MUTATION.test(l.sql)) };
}

for (const [label, fn, body] of FNS) {
  test(`${label}: manage_users bez roli admina nie ruszy administratora ani konta z „*” (403, bez zmian)`, async () => {
    for (const target of [adminTarget, radaTarget]) {
      const { reply, mutated } = await call(fn, kadry, target, body);
      assert.equal(reply.statusCode, 403, `${label} → ${target.role}`);
      assert.equal(mutated, false, `${label} → ${target.role}: brak zmian`);
    }
  });

  test(`${label}: manage_users na zwykłym koncie OK; administrator na administratorze OK`, async () => {
    const r1 = await call(fn, kadry, memberTarget, body);
    assert.equal(r1.reply.statusCode, 200, `${label} kadry→członek`);
    assert.equal(r1.mutated, true);
    const r2 = await call(fn, admin, adminTarget, body);
    assert.equal(r2.reply.statusCode, 200, `${label} admin→admin`);
  });
}

// ── Data API: app_users / app_settings ───────────────────────────────────────
// Prosta „tabela” kont dla SELECT ... FROM app_users t WHERE ... (filtr eq id / email).
function dataReq(caller, users, extra = []) {
  const byFilter = (params, flat) => {
    const all = Object.values(users);
    if (/t\."id" = \$1|t\.id = \$1|"id" = \$1/.test(flat)) return all.filter((u) => String(u.id) === String(params[0]));
    if (/email/.test(flat)) return all.filter((u) => u.email === params[0]);
    return all;
  };
  const db = fakeDb(users, [
    [/^SELECT t\.id, t\.role, t\.is_super_admin FROM app_users t/, (p, flat) => ({ rows: byFilter(p, flat) })],
    ...extra,
  ]);
  return { db, user: { id: caller.id, email: caller.email, role: caller.role }, tenant: { db_name: nextDbName() } };
}
const ctx = (caller) => ({ isAdmin: !!caller.role_admin || !!caller.is_super_admin, user: caller });
const upd = (values, id) => ({ table: 'app_users', op: 'update', values, filters: [{ type: 'eq', column: 'id', value: id }] });
const users = { k1: kadry, a2: adminTarget, r1: radaTarget, m1: memberTarget };

async function denied(q, caller, extra) {
  try { await enforceAccountWrite(q, dataReq(caller, users, extra), ctx(caller)); return null; } catch (e) { return e; }
}

test('Data API app_users: kadry nie nada roli admina / z „*”, nie ruszy admina, nie ustawi is_super_admin', async () => {
  for (const q of [
    upd({ role: 'admin' }, 'm1'),
    upd({ role: 'admin' }, 'k1'), // sobie
    upd({ role: 'rada_starszych' }, 'm1'),
    upd({ is_active: false }, 'a2'),
    upd({ full_name: 'X' }, 'a2'),
    upd({ is_active: false }, 'r1'),
    upd({ is_super_admin: true }, 'k1'),
    { table: 'app_users', op: 'delete', filters: [{ type: 'eq', column: 'id', value: 'a2' }] },
    { table: 'app_users', op: 'insert', values: { email: 'n@k.pl', role: 'admin' } },
    { table: 'app_users', op: 'upsert', values: { id: 'a2', email: 'a2@k.pl', role: 'czlonek' } },
  ]) {
    const e = await denied(q, kadry);
    assert.ok(e, JSON.stringify(q));
    assert.equal(e.status, 403, JSON.stringify(q));
  }
});

test('Data API app_users: zmiana masowa bez filtra odrzucona dla nie-admina', async () => {
  const e = await denied({ table: 'app_users', op: 'update', values: { is_active: false }, filters: [] }, kadry);
  assert.equal(e?.status, 400);
});

test('Data API app_users: dozwolone — własny profil, kadry na zwykłym koncie, admin bez ograniczeń', async () => {
  assert.equal(await denied(upd({ full_name: 'Kasia', avatar_url: 'x' }, 'k1'), kadry), null);
  assert.equal(await denied({ ...upd({ onboarding: {} }, 'x'), filters: [{ type: 'eq', column: 'email', value: 'kadry@k.pl' }] }, kadry), null);
  // Zwykły członek: tylko własny profil (ścieżka samoobsługi).
  const member = { ...memberTarget, role_admin: false };
  assert.equal(await denied(upd({ full_name: 'Marek' }, 'm1'), member), null);
  assert.equal((await denied(upd({ role: 'admin' }, 'm1'), member))?.status, 403);
  // kadry zmienia rolę / blokuje zwykłe konto.
  assert.equal(await denied(upd({ role: 'czlonek', is_active: false }, 'm1'), kadry), null);
  assert.equal(await denied({ table: 'app_users', op: 'insert', values: { email: 'n@k.pl', role: 'czlonek' } }, kadry), null);
  // Administrator — bez zmian.
  assert.equal(await denied(upd({ role: 'admin', is_super_admin: true }, 'a2'), admin), null);
  assert.equal(await denied({ table: 'app_users', op: 'upsert', values: { id: 'a2', role: 'admin' } }, admin), null);
});

test('Data API app_settings: sso_* tylko administrator; registration_default_role bez eskalacji', async () => {
  const settingsRows = [
    [/^SELECT t\.key FROM app_settings t/, (p) => ({ rows: [{ key: p[0] }] })],
  ];
  const ups = (key, value) => ({ table: 'app_settings', op: 'upsert', values: { key, value } });
  for (const q of [
    ups('sso_google_enabled', 'on'),
    ups('sso_default_role', 'czlonek'),
    { table: 'app_settings', op: 'insert', values: [{ key: 'org_name', value: 'K' }, { key: 'sso_auto_provision', value: 'on' }] },
    { table: 'app_settings', op: 'update', values: { value: 'off' }, filters: [{ type: 'eq', column: 'key', value: 'sso_microsoft_enabled' }] },
    { table: 'app_settings', op: 'update', values: { key: 'sso_auto_provision' }, filters: [{ type: 'eq', column: 'key', value: 'org_name' }] },
    { table: 'app_settings', op: 'delete', filters: [{ type: 'eq', column: 'key', value: 'sso_google_client_id' }] },
    ups('registration_default_role', 'admin'),
    ups('registration_default_role', 'rada_starszych'),
  ]) {
    const e = await denied(q, kadry, settingsRows);
    assert.equal(e?.status, 403, JSON.stringify(q));
  }
  assert.equal(await denied(ups('module_covers', '{}'), kadry, settingsRows), null);
  assert.equal(await denied(ups('registration_default_role', 'czlonek'), kadry, settingsRows), null);
  assert.equal(await denied(ups('registration_mode', 'open'), kadry, settingsRows), null);
  assert.equal(await denied(ups('sso_google_enabled', 'on'), admin, settingsRows), null);
  assert.equal(await denied(ups('registration_default_role', 'admin'), admin, settingsRows), null);
});

// ── RSVP serii: token kryptograficzny ────────────────────────────────────────
test('rsvp-series: token z crypto (128 bitów), pasuje do formatu rsvp-respond, bez powtórzeń', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const t = rsvpToken();
    assert.match(t, /^r[A-Za-z0-9_-]{22}$/);
    seen.add(t);
  }
  assert.equal(seen.size, 200);
});

// ── P24 formularz: session w adresie powrotu z serwera ───────────────────────
test('przelewy24-create-payment (formularz): urlReturn dostaje sessionId serwera; faktura bez zmian', async () => {
  assert.equal(createPayment.formReturnUrl('https://k.avenit.pl/form/x?payment=success', 's1'), 'https://k.avenit.pl/form/x?payment=success&session=s1');
  assert.equal(createPayment.formReturnUrl('https://k.avenit.pl/form/x?session=evil', 's1'), 'https://k.avenit.pl/form/x?session=s1');
  assert.equal(createPayment.formReturnUrl('https://k.avenit.pl/billing/success', null), 'https://k.avenit.pl/billing/success');

  // Testowa konfiguracja P24 (tylko fałszywa bramka niżej) — przywracana po teście.
  const P24_KEYS = ['P24_MERCHANT_ID', 'P24_POS_ID', 'P24_CRC', 'P24_API_KEY'];
  const prev = Object.fromEntries(P24_KEYS.map((k) => [k, config[k]]));
  Object.assign(config, { P24_MERCHANT_ID: '11111', P24_POS_ID: '11111', P24_CRC: 'test-crc', P24_API_KEY: 'test-key' });
  const calls = [];
  const pool = { log: [], async query(sql, params) { this.log.push({ sql, params }); return { rows: [{ id: 'tx' }] }; } };
  Object.assign(createPayment.deps, {
    platformPool: pool,
    fetch: async (url, opts) => { calls.push(JSON.parse(opts.body)); return { json: async () => ({ data: { token: 'T' } }) }; },
  });
  try {
    const FORM_ID = '11111111-2222-4333-8444-555555555555';
    const tenant = { id: 'aaaaaaaa-0000-4000-8000-000000000001', slug: 'kosciol', subdomain: 'kosciol', db_name: 'x' };
    const reply = fakeReply();
    await createPayment.default({ tenant, log: quietLog, body: { amount: 5000, email: 'x@y.pl', formId: FORM_ID, sessionId: 'mine', urlReturn: `/form/${FORM_ID}?payment=success&session=mine` } }, reply);
    assert.equal(reply.statusCode, 200);
    const u = new URL(calls[0].urlReturn);
    assert.equal(u.searchParams.get('session'), reply.body.sessionId);
    assert.notEqual(reply.body.sessionId, 'mine');
    const ins = pool.log.find((l) => /INSERT INTO payment_transactions/.test(l.sql));
    assert.equal(JSON.parse(ins.params[6]).form_id, FORM_ID);
  } finally {
    Object.assign(config, prev);
  }
});
