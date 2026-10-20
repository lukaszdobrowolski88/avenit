// Audyt uprawnień 2026-10, runda 6:
//  1. Cudze hasło wprost ustawia tylko pełny administrator; osoba z samym manage_users wysyła link
//     do zmiany hasła (fn admin-send-password-reset — token resetu, mail w marce).
//  2. (mobilka — podpisane linki do plików przestrzeni wrażliwych: test w packages/mobile).
//  3. Wiersze zwracane przez zapis (RETURNING / .select()) przechodzą tę samą redakcję co SELECT
//     (redactRows.js), a RETURNING ze złączeniem nie oddaje kolumn ukrytych (password_hash…).
// Na PRAWDZIWYM SQL (PGlite) przez Fastify inject:
//   PGLITE_MODULE=/ścieżka/node_modules/@electric-sql/pglite/dist/index.js node --test test/permissions-audit-r6.test.js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import Fastify from 'fastify';

import { presetGrantRows } from '@avenit/shared/src/permissions/presets.js';
import { invalidatePermissions } from '../src/dataapi/registry.js';
import { buildQuery } from '../src/dataapi/querybuilder.js';
import { redactRows } from '../src/dataapi/redactRows.js';
import { adminPasswordResetEmail } from '../src/lib/email.js';
import dataApiRoutes from '../src/dataapi/routes.js';
import adminSetPassword from '../src/fn/admin-set-user-password.js';
import { makeHandler as makeSendReset, RESET_LINK_HOURS } from '../src/fn/admin-send-password-reset.js';

let PGlite = null;
try {
  ({ PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite'));
} catch { PGlite = null; }
const skipDb = PGlite ? false : 'brak @electric-sql/pglite (ustaw PGLITE_MODULE)';

const quietLog = { error() {}, warn() {}, info() {} };
function fakeReply() {
  return {
    statusCode: 200, body: undefined,
    code(c) { this.statusCode = c; return this; },
    send(b) { this.body = b; return this; },
  };
}
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ── Czysta logika ───────────────────────────────────────────────────────────
test('RETURNING ze złączeniem: cały wiersz, ale bez kolumn ukrytych; alias kolumny odrzucony', () => {
  const upd = (returning) => buildQuery({ table: 'app_users', op: 'update', values: { full_name: 'X' }, filters: [{ type: 'eq', column: 'id', value: 'u' }], returning });
  for (const r of ['*', '*, x(id)', 'id, roles:app_roles(key)']) {
    const { sql } = upd(r);
    assert.match(sql, /RETURNING \(to_jsonb\(t\.\*\) - 'password_hash'/, r);
    assert.doesNotMatch(sql, /RETURNING \*/, r);
  }
  assert.match(upd('id, email').sql, /RETURNING "id", "email"$/);
  assert.throws(() => upd('id, tel:phone'), (e) => e.status === 400);
  assert.throws(() => upd('id, password_hash'), (e) => e.status === 403);
  // INSERT bez aliasu tabeli — odwołanie po nazwie.
  const ins = buildQuery({ table: 'app_users', op: 'insert', values: { email: 'a@x.pl' }, returning: '*, x(id)' });
  assert.match(ins.sql, /RETURNING \(to_jsonb\("app_users"\.\*\) - 'password_hash'/);
});

test('redactRows: przy zapisie redaguje KOPIE (realtime i powiadomienia dostają pełne wiersze)', async () => {
  const resolver = { can: () => false, fieldReadable: (t, c) => c !== 'phone' };
  const raw = [{ id: 'a', email: 'anna@x.pl', phone: '+48 1', last_login_at: 'x' }];
  const out = await redactRows('app_users', raw, { op: 'update', resolver, fieldResolver: null, user: { id: 'k', email: 'k@x.pl' } });
  assert.equal('phone' in out[0], false);
  assert.equal(raw[0].phone, '+48 1', 'oryginał nietknięty');
  // Własny wiersz — pełny.
  const own = await redactRows('app_users', [{ id: 'k', phone: '+48 2' }], { op: 'update', resolver, user: { id: 'k', email: 'k@x.pl' } });
  assert.equal(own[0].phone, '+48 2');
  // Zakaz pola działa na odpowiedź zapisu.
  const f = await redactRows('members', [{ id: 1, phone: '1', email: 'e' }], { op: 'insert', resolver: null, fieldResolver: resolver, user: {} });
  assert.deepEqual(f[0], { id: 1, email: 'e' });
});

test('mail z linkiem do zmiany hasła: w marce, link i ważność, bez wstrzyknięcia HTML', () => {
  const m = adminPasswordResetEmail({ name: '<b>Jan</b>', link: 'https://a.avenit.pl/reset-password?token=abc', hours: 24, orgName: 'SChWro' });
  assert.match(m.subject, /hasło/);
  assert.match(m.html, /Manrope/);
  assert.match(m.html, /#FFBE0B/);
  assert.match(m.html, /reset-password\?token=abc/);
  assert.match(m.html, /24 godziny/);
  assert.doesNotMatch(m.html, /<b>Jan<\/b>/);
  assert.match(m.html, /&lt;b&gt;Jan/);
  assert.match(m.text, /https:\/\/a\.avenit\.pl\/reset-password\?token=abc/);
  assert.match(adminPasswordResetEmail({ link: 'x', hours: 1 }).text, /1 godzinę/);
});

// ── Na prawdziwym SQL ───────────────────────────────────────────────────────
function poolOf(pg) {
  return {
    async query(sql, params) {
      const r = await pg.query(sql, params);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    },
  };
}
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const U = { adm: uid(1), kadry: uid(2), jan: uid(3), anna: uid(4), del: uid(5), kart: uid(6), pani: uid(7) };
const ROLE = { adm: 'superadmin', kadry: 'lider', jan: 'czlonek', anna: 'czlonek', del: 'czlonek', kart: 'czlonek', pani: 'pastor' };
const G1 = uid(101), G2 = uid(102);
const TENANT = { id: 't', slug: 'audyt-r6', subdomain: 'audyt-r6', db_name: `audyt_r6_${process.pid}_${Date.now()}` };

let db;
let app;
const q1 = async (sql, params) => (await db.query(sql, params)).rows;
async function call(who, body) {
  const res = await app.inject({ method: 'POST', url: '/api/db', payload: body, headers: { 'x-test-user': who } });
  return { status: res.statusCode, body: res.json() };
}
const eq = (column, value) => ({ type: 'eq', column, value });
const fnReq = (who, body) => ({ db, tenant: TENANT, user: { id: U[who], email: `${who}@x.pl`, role: ROLE[who] }, body, log: quietLog });

before(async () => {
  if (skipDb) return;
  const pg = new PGlite();
  db = poolOf(pg);
  await pg.exec(`
    CREATE TABLE app_users (id uuid PRIMARY KEY, email text, full_name text, name text, role text, is_super_admin boolean DEFAULT false,
      is_active boolean DEFAULT true, campus_id int, member_id int, phone text, last_login_at timestamptz, avatar_url text,
      auth_user_id uuid, status text, totp_required boolean DEFAULT false, password_hash text, totp_secret text,
      totp_backup_codes text[], backup_codes text[], verify_token_hash text, created_at timestamptz DEFAULT now());
    CREATE TABLE app_roles (key text PRIMARY KEY, label text, is_admin boolean DEFAULT false, is_system boolean DEFAULT false, display_order int);
    CREATE TABLE permission_grants (role text, user_id uuid, capability text, allowed boolean);
    CREATE TABLE app_modules (key text PRIMARY KEY, label text, is_system boolean, is_enabled boolean DEFAULT true);
    CREATE TABLE ministry_memberships (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, ministry_key text, campus_id int, role text DEFAULT 'member');
    CREATE TABLE app_settings (key text PRIMARY KEY, value text);
    CREATE TABLE password_reset_tokens (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      token_hash text UNIQUE NOT NULL, expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz DEFAULT now());
    CREATE TABLE refresh_tokens (id serial PRIMARY KEY, user_id uuid, token_hash text, revoked_at timestamptz);
    CREATE TABLE account_events (id serial PRIMARY KEY, email text, action text, actor text, detail text, created_at timestamptz DEFAULT now());
    CREATE TABLE members (id serial PRIMARY KEY, first_name text, email text, phone text, campus_id int);
    CREATE TABLE home_groups (id uuid PRIMARY KEY, name text, address text, location text, phone text, email text, campus_id int);
    CREATE TABLE home_group_members (id serial PRIMARY KEY, group_id uuid, full_name text, email text, phone text, user_id uuid, role text DEFAULT 'member');
    CREATE TABLE home_group_leaders (id serial PRIMARY KEY, group_id uuid, full_name text, email text, phone text, user_email text);
    CREATE TABLE prayer_requests (id serial PRIMARY KEY, content text, category text, user_email text, user_name text, user_id uuid,
      requester_name text, is_anonymous boolean DEFAULT false, visibility text DEFAULT 'public', is_active boolean DEFAULT true,
      status text DEFAULT 'active', answered_testimony text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
  `);
  const grants = presetGrantRows().filter((g) => ['lider', 'czlonek', 'pastor'].includes(g.role));
  for (const g of grants) await db.query('INSERT INTO permission_grants (role, capability, allowed) VALUES ($1, $2, $3)', [g.role, g.capability, g.allowed]);
  await pg.exec(`
    INSERT INTO app_roles (key, is_admin) VALUES ('superadmin', true), ('lider', false), ('czlonek', false), ('pastor', true);
    INSERT INTO app_settings (key, value) VALUES ('account_change_emails', 'off'), ('org_name', 'SChWro');
    INSERT INTO app_users (id, email, full_name, role, is_super_admin, phone, last_login_at, password_hash, totp_secret) VALUES
      ('${U.adm}', 'adm@x.pl', 'Admin', 'superadmin', true, '+48 500', now(), 'hash-adm', 'sekret-adm'),
      ('${U.kadry}', 'kadry@x.pl', 'Kadry', 'lider', false, '+48 601', now(), 'hash-kadry', NULL),
      ('${U.jan}', 'jan@x.pl', 'Jan', 'czlonek', false, '+48 602', now(), 'hash-jan', 'sekret-jan'),
      ('${U.anna}', 'anna@x.pl', 'Anna', 'czlonek', false, '+48 604', now(), 'hash-anna', NULL),
      ('${U.del}', 'del@x.pl', 'Del', 'czlonek', false, NULL, NULL, 'hash-del', NULL),
      ('${U.kart}', 'kart@x.pl', 'Kart', 'czlonek', false, NULL, NULL, 'hash-kart', NULL),
      ('${U.pani}', 'pani@x.pl', 'Pastor', 'pastor', false, '+48 700', now(), 'hash-pani', NULL);
    -- kadry: lider z manage_users (bez roli administratora); del: usuwa członków grup (bez prawa edycji
    -- składu, więc bez wglądu w kontakty cudzych grup); kart: kartoteka Członków bez odczytu telefonu.
    INSERT INTO permission_grants (user_id, capability, allowed) VALUES
      ('${U.kadry}', 'action:settings:manage_users', true),
      ('${U.del}', 'module:homegroups', true),
      ('${U.del}', 'res:home_group_members:read', true),
      ('${U.del}', 'res:home_group_members:delete', true),
      ('${U.del}', 'res:home_group_members:create', true),
      ('${U.kart}', 'module:members', true),
      ('${U.kart}', 'res:members:*', true),
      ('${U.kart}', 'field:members:phone:read', false);
    INSERT INTO members (id, first_name, email, phone) VALUES (3, 'Jan', 'jan@x.pl', '+48 602'), (4, 'Anna', 'anna@x.pl', '+48 604');
    INSERT INTO home_groups VALUES ('${G1}', 'Krzyki', 'Ul. Jana 1', 'Krzyki', '+48 700', 'krzyki@g.pl', NULL),
      ('${G2}', 'Biskupin', 'Ul. Anny 2', 'Biskupin', '+48 701', 'biskupin@g.pl', NULL);
    INSERT INTO home_group_members (id, group_id, full_name, email, phone) VALUES
      (1, '${G1}', 'Jan', 'jan@x.pl', '+48 602'), (2, '${G1}', 'Ola', 'ola@x.pl', '+48 605'), (3, '${G2}', 'Del', 'del@x.pl', '+48 606');
    SELECT setval('home_group_members_id_seq', 10);
  `);

  app = Fastify();
  app.decorateRequest('user', null);
  app.decorateRequest('db', null);
  app.decorateRequest('tenant', null);
  app.decorate('requireUser', async (req) => {
    const who = String(req.headers['x-test-user'] || 'jan');
    req.user = { id: U[who], email: `${who}@x.pl`, role: ROLE[who] };
    req.db = db;
    req.tenant = TENANT;
  });
  app.decorate('block2FAPending', async () => {});
  await app.register(dataApiRoutes);
});

// ── 1. Hasła ────────────────────────────────────────────────────────────────
test('fn admin-set-user-password: manage_users bez roli admina NIE ustawi hasła zwykłemu kontu; admin tak', { skip: skipDb }, async () => {
  const set = async (who, userId) => {
    const reply = fakeReply();
    await adminSetPassword(fnReq(who, { userId, password: 'Nowe-Haslo-2026x' }), reply);
    return reply;
  };
  const r = await set('kadry', U.jan);
  assert.equal(r.statusCode, 403, JSON.stringify(r.body));
  assert.match(r.body.error, /link/);
  assert.equal((await q1('SELECT password_hash FROM app_users WHERE id = $1', [U.jan]))[0].password_hash, 'hash-jan');

  const ok = await set('adm', U.jan);
  assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
  assert.notEqual((await q1('SELECT password_hash FROM app_users WHERE id = $1', [U.jan]))[0].password_hash, 'hash-jan');
  assert.ok((await q1(`SELECT 1 FROM account_events WHERE action = 'password_set' AND email = 'jan@x.pl' AND actor = 'adm@x.pl'`)).length);
  // Rola z is_admin (bez is_super_admin) to też pełny administrator.
  assert.equal((await set('pani', U.anna)).statusCode, 200);
  // Pełny administrator nie zmieni hasła super-administratorowi.
  assert.equal((await set('pani', U.adm)).statusCode, 403);
});

test('fn admin-send-password-reset: manage_users wysyła link (token 24 h) zwykłemu kontu; nie adminowi', { skip: skipDb }, async () => {
  const sent = [];
  const handler = makeSendReset({ sendMail: async (to, opts) => { sent.push({ to, ...opts }); } });
  const send = async (who, userId, h = handler) => {
    const reply = fakeReply();
    await h(fnReq(who, { userId }), reply);
    return reply;
  };
  const r = await send('kadry', U.anna);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'anna@x.pl');
  assert.equal(sent[0].hours, RESET_LINK_HOURS);
  assert.equal(sent[0].orgName, 'SChWro');
  const m = sent[0].link.match(/^https:\/\/audyt-r6\.[^/]+\/reset-password\?token=([\w-]+)$/);
  assert.ok(m, sent[0].link);
  const [tok] = await q1(`SELECT user_id, used_at, extract(epoch FROM expires_at - now()) AS ttl FROM password_reset_tokens WHERE token_hash = $1`, [sha256(m[1])]);
  assert.equal(tok.user_id, U.anna);
  assert.equal(tok.used_at, null);
  assert.ok(tok.ttl > 23 * 3600 && tok.ttl <= 24 * 3600, String(tok.ttl));
  assert.equal((await q1('SELECT password_hash FROM app_users WHERE id = $1', [U.anna]))[0].password_hash.length > 0, true, 'hasło bez zmian do kliknięcia linku');
  assert.ok((await q1(`SELECT 1 FROM account_events WHERE action = 'password_reset_link' AND email = 'anna@x.pl' AND actor = 'kadry@x.pl'`)).length);

  // Drugi link w ciągu minuty — 429, bez maila.
  assert.equal((await send('kadry', U.anna)).statusCode, 429);
  assert.equal(sent.length, 1);
  // Konto administratora / super-administratora — tylko administrator.
  assert.equal((await send('kadry', U.pani)).statusCode, 403);
  assert.equal((await send('kadry', U.adm)).statusCode, 403);
  // Członek bez manage_users — 403.
  assert.equal((await send('jan', U.anna)).statusCode, 403);
  assert.equal(sent.length, 1);
  // Nieudana wysyłka: 502 i bez osieroconego tokenu.
  const failing = makeSendReset({ sendMail: async () => { throw new Error('SMTP down'); } });
  const before = (await q1(`SELECT count(*)::int AS n FROM password_reset_tokens WHERE user_id = $1`, [U.del]))[0].n;
  assert.equal((await send('kadry', U.del, failing)).statusCode, 502);
  assert.equal((await q1(`SELECT count(*)::int AS n FROM password_reset_tokens WHERE user_id = $1`, [U.del]))[0].n, before);
});

// ── 3. RETURNING po zapisie ─────────────────────────────────────────────────
test('db: zapis konta przez manage_users — w odpowiedzi bez cudzego telefonu, logowań i hash hasła', { skip: skipDb }, async () => {
  const upd = (who, id, returning) => call(who, { table: 'app_users', op: 'update', values: { full_name: 'Zmiana' }, filters: [eq('id', id)], returning });
  const cols = await upd('kadry', U.jan, 'id, full_name, phone, last_login_at');
  assert.equal(cols.status, 200, JSON.stringify(cols.body));
  assert.equal(cols.body.data[0].full_name, 'Zmiana');
  assert.equal('phone' in cols.body.data[0], false, 'telefon jak przy SELECT');
  assert.equal('last_login_at' in cols.body.data[0], false);
  const star = await upd('kadry', U.jan, '*');
  assert.equal(star.status, 200, JSON.stringify(star.body));
  assert.equal(star.body.data[0].email, 'jan@x.pl');
  assert.equal('phone' in star.body.data[0], false);
  assert.equal('password_hash' in star.body.data[0], false);
  // Złączenie w RETURNING dawało gołe RETURNING * — z hashem hasła i sekretem 2FA.
  const emb = await upd('kadry', U.jan, '*, ministry_memberships(id)');
  assert.equal(emb.status, 200, JSON.stringify(emb.body));
  for (const c of ['password_hash', 'totp_secret', 'phone']) assert.equal(c in emb.body.data[0], false, c);
  const admEmb = await upd('adm', U.jan, '*, ministry_memberships(id)');
  assert.equal('password_hash' in admEmb.body.data[0], false, 'kolumny ukryte — dla każdego');
  assert.equal(admEmb.body.data[0].phone, '+48 602', 'administrator widzi telefon');
  // Alias kolumny w RETURNING — odrzucony.
  assert.equal((await upd('kadry', U.jan, 'id, tel:phone')).status, 400);
  // Własny profil (samoobsługa) — pełny własny wiersz, bez hash hasła.
  const own = await call('jan', { table: 'app_users', op: 'update', values: { full_name: 'Jan K.' }, filters: [eq('id', U.jan)], returning: '*' });
  assert.equal(own.status, 200, JSON.stringify(own.body));
  assert.equal(own.body.data[0].phone, '+48 602');
  assert.equal('password_hash' in own.body.data[0], false);
  // .single() po zapisie — obiekt, nie tablica.
  const single = await call('kadry', { table: 'app_users', op: 'update', values: { full_name: 'Anna' }, filters: [eq('id', U.anna)], returning: '*', single: true });
  assert.equal(single.status, 200, JSON.stringify(single.body));
  assert.equal(single.body.data.email, 'anna@x.pl');
  assert.equal('phone' in single.body.data, false);
});

test('db: zakaz odczytu pola działa też na odpowiedź zapisu (członkowie bez telefonu)', { skip: skipDb }, async () => {
  const sel = await call('kart', { table: 'members', op: 'select', select: '*', filters: [eq('id', 4)] });
  assert.equal(sel.status, 200, JSON.stringify(sel.body));
  assert.equal('phone' in sel.body.data[0], false);
  const upd = await call('kart', { table: 'members', op: 'update', values: { first_name: 'Anna M.' }, filters: [eq('id', 4)], returning: '*' });
  assert.equal(upd.status, 200, JSON.stringify(upd.body));
  assert.equal(upd.body.data[0].first_name, 'Anna M.');
  assert.equal(upd.body.data[0].email, 'anna@x.pl');
  assert.equal('phone' in upd.body.data[0], false);
  const ins = await call('kart', { table: 'members', op: 'insert', values: { first_name: 'Nowy', email: 'n@x.pl' }, returning: '*' });
  assert.equal(ins.status, 200, JSON.stringify(ins.body));
  assert.equal('phone' in ins.body.data[0], false);
  // Administrator — pełny wiersz.
  const adm = await call('adm', { table: 'members', op: 'update', values: { first_name: 'Anna' }, filters: [eq('id', 4)], returning: '*' });
  assert.equal(adm.body.data[0].phone, '+48 604');
});

test('db: grupy domowe — usunięcie z cudzej grupy nie oddaje kontaktów; własny zapis pełny', { skip: skipDb }, async () => {
  const del = await call('del', { table: 'home_group_members', op: 'delete', filters: [eq('id', 2)], returning: '*' });
  assert.equal(del.status, 200, JSON.stringify(del.body));
  assert.equal(del.body.data[0].full_name, 'Ola');
  assert.deepEqual([del.body.data[0].email, del.body.data[0].phone], [null, null], 'cudza grupa — bez kontaktów');
  // Własne członkostwo (nowa grupa) — pełny wiersz, mimo że wcześniej nie była „moja”.
  const join = await call('del', { table: 'home_group_members', op: 'insert', values: { group_id: G1, full_name: 'Del', email: 'del@x.pl', phone: '+48 606' }, returning: '*' });
  assert.equal(join.status, 200, JSON.stringify(join.body));
  assert.deepEqual([join.body.data[0].email, join.body.data[0].phone], ['del@x.pl', '+48 606']);
  // Teraz G1 jest moja — kontakt Jana (z mojej grupy) widoczny także w odpowiedzi zapisu.
  const del2 = await call('del', { table: 'home_group_members', op: 'delete', filters: [eq('id', 1)], returning: '*' });
  assert.equal(del2.body.data[0].phone, '+48 602');
  assert.equal((await q1('SELECT count(*)::int AS n FROM home_group_members WHERE id IN (1, 2)'))[0].n, 0);
});

test('db: własna prośba anonimowa — autor dostaje swoje dane w odpowiedzi zapisu', { skip: skipDb }, async () => {
  const ins = await call('jan', { table: 'prayer_requests', op: 'insert', values: { content: 'Praca', is_anonymous: true, user_name: 'Jan' }, returning: '*' });
  assert.equal(ins.status, 200, JSON.stringify(ins.body));
  assert.equal(ins.body.data[0].user_email, 'jan@x.pl');
  assert.equal(ins.body.data[0].user_name, 'Jan');
  const upd = await call('jan', { table: 'prayer_requests', op: 'update', values: { content: 'Nowa praca' }, filters: [eq('id', ins.body.data[0].id)], returning: '*' });
  assert.equal(upd.body.data[0].user_name, 'Jan');
  invalidatePermissions(TENANT.db_name);
});
