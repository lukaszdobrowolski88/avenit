// Audyt uprawnień 2026-10, runda 5: eskalacja przez ministry_memberships, aliasy / filtry / złączenia
// omijające redakcję, zakres Plików (materials_*), kontakty grup domowych, powiązanie konta z osobą,
// role administracyjne, funkcje (prayer-wall, content-report, chat-policy, campaign-progress,
// admin-update-user). Czysta logika zawsze; /api/db na PRAWDZIWYM SQL (PGlite) przez Fastify inject:
//   PGLITE_MODULE=/ścieżka/node_modules/@electric-sql/pglite/dist/index.js node --test test/permissions-audit-r5.test.js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';

import { membershipCapabilities, ministryGrants, isMinistryKey, MINISTRY_MODULES } from '@avenit/shared/src/permissions/ministry.js';
import { can } from '@avenit/shared/src/permissions/resolve.js';
import { presetGrantRows } from '@avenit/shared/src/permissions/presets.js';
import { isSignedMaterialsPath, materialsPathTeam } from '@avenit/shared/src/lib/materialsAccess.js';
import { sensitiveColumnsFor, assertSensitiveQuery } from '../src/dataapi/sensitiveColumns.js';
import { materialsTeamAccess, teamVisible } from '../src/dataapi/materialsScope.js';
import { redactHomeGroupRows } from '../src/dataapi/homeGroupContacts.js';
import { realtimeRedactor } from '../src/realtime/redact.js';
import { invalidatePermissions } from '../src/dataapi/registry.js';
import dataApiRoutes from '../src/dataapi/routes.js';
import campaignProgress from '../src/fn/campaign-progress.js';
import chatPolicy from '../src/fn/chat-policy.js';
import prayerWall from '../src/fn/prayer-wall.js';
import adminUpdateUser from '../src/fn/admin-update-user.js';

let PGlite = null;
try {
  ({ PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite'));
} catch { PGlite = null; }
const skipDb = PGlite ? false : 'brak @electric-sql/pglite (ustaw PGLITE_MODULE)';

const resolverOf = (caps = [], deniedFields = []) => ({
  can: (c) => caps.includes(c),
  fieldReadable: (t, c) => !deniedFields.includes(`${t}.${c}`),
});

// ── Czysta logika ───────────────────────────────────────────────────────────
test('służby: przynależność daje granty tylko dla zespołów i modułów własnych', () => {
  for (const k of ['members', 'finance', 'giving', 'settings', 'mail', 'mailing', 'forms', 'attendance', 'rooms',
    'analytics', 'automation', 'care', 'rsvp', 'ai', 'dashboard', 'sermons', 'calendar', 'programs', 'prayer', 'komunikator', 'boards']) {
    assert.equal(isMinistryKey(k), false, k);
    assert.deepEqual(membershipCapabilities(k, 'leader'), [], k);
  }
  for (const k of [...MINISTRY_MODULES, 'faceci', 'youth']) assert.equal(isMinistryKey(k), true, k);
  assert.ok(membershipCapabilities('faceci', 'leader').includes('res:custom_faceci_members:delete'));
  assert.ok(membershipCapabilities('media', 'member').includes('res:media_events:read'));

  // Wiersz z kluczem spoza służb (np. dopisany przed poprawką) — martwy: żadnych grantów.
  const grants = ministryGrants([
    { ministry_key: 'settings', role: 'leader' }, { ministry_key: 'members', role: 'leader' }, { ministry_key: 'worship', role: 'member' },
  ]).map((g) => ({ role: null, user_id: 'u1', capability: g.capability, allowed: g.allowed }));
  const s = { role: 'czlonek', userId: 'u1' };
  assert.equal(can(grants, s, 'action:settings:manage_permissions'), false);
  assert.equal(can(grants, s, 'module:members'), false);
  assert.equal(can(grants, s, 'res:members:read'), false);
  assert.equal(can(grants, s, 'module:worship'), true);
});

test('kolumny wrażliwe: jedna lista z redaktorów; admin tylko głosy ankiet', () => {
  const member = { isAdmin: false, resolver: resolverOf([]) };
  assert.deepEqual([...sensitiveColumnsFor('app_users', member)].sort(), ['failed_login_count', 'invited_at', 'last_login_at', 'locked_until', 'phone']);
  assert.equal(sensitiveColumnsFor('app_users', { isAdmin: false, resolver: resolverOf(['module:members']) }).size, 0);
  assert.deepEqual([...sensitiveColumnsFor('home_groups', member)].sort(), ['email', 'phone']);
  assert.deepEqual([...sensitiveColumnsFor('home_group_leaders', member)].sort(), ['email', 'phone', 'user_email']);
  assert.ok(sensitiveColumnsFor('rsvp_invitations', member).has('token'));
  assert.equal(sensitiveColumnsFor('rsvp_invitations', { isAdmin: false, resolver: resolverOf(['module:rsvp']) }).size, 0);
  assert.ok(sensitiveColumnsFor('prayer_requests', member).has('user_email'));
  assert.ok(sensitiveColumnsFor('members', { isAdmin: false, resolver: resolverOf([], ['members.phone']) }).has('phone'));
  assert.deepEqual([...sensitiveColumnsFor('poll_votes', { isAdmin: true, resolver: null })], ['user_email']);
  assert.equal(sensitiveColumnsFor('app_users', { isAdmin: true, resolver: null }).size, 0);
});

test('strażnik zapytań: bez aliasów, filtrów i sortowania po ukrytych kolumnach; własna wartość OK', () => {
  const viewer = { isAdmin: false, resolver: resolverOf([]) };
  const me = { email: 'Jan@X.pl', userId: 'u-jan', memberId: 7 };
  const sel = (table, extra) => ({ table, op: 'select', select: '*', filters: [], ...extra });
  const denied = (q) => assert.throws(() => assertSensitiveQuery(q, viewer, me), (e) => e.status === 403, JSON.stringify(q));
  const ok = (q) => assert.doesNotThrow(() => assertSensitiveQuery(q, viewer, me), JSON.stringify(q));

  denied(sel('app_users', { select: 'id, tel:phone' }));
  denied(sel('app_users', { select: 'id, imie:full_name' })); // alias w tabeli z redakcją — żaden
  denied(sel('home_group_members', { select: 'e:email' }));
  denied(sel('rsvp_invitations', { select: 't:token' }));
  denied(sel('prayer_requests', { select: 'a:user_email' }));
  denied(sel('poll_votes', { select: 'e:user_email' }));
  denied(sel('app_users', { filters: [{ type: 'like', column: 'phone', value: '+48 60%' }] }));
  denied(sel('app_users', { head: true, count: 'exact', filters: [{ type: 'ilike', column: 'phone', value: '%600%' }] }));
  denied(sel('app_users', { order: [{ column: 'last_login_at', ascending: false }] }));
  denied(sel('prayer_requests', { filters: [{ type: 'eq', column: 'user_email', value: 'anna@x.pl' }] }));
  denied(sel('prayer_requests', { filters: [{ type: 'or', value: 'visibility.eq.public,user_email.eq.anna@x.pl' }] }));
  denied(sel('home_group_members', { filters: [{ type: 'match', value: { phone: '600' } }] }));
  denied(sel('home_group_members', { filters: [{ type: 'in', column: 'email', value: ['jan@x.pl', 'anna@x.pl'] }] }));
  denied(sel('home_group_members', { filters: [{ type: 'not', column: 'email', operator: 'eq', value: 'x' }] }));

  ok(sel('prayer_requests', { filters: [{ type: 'eq', column: 'user_email', value: 'jan@x.pl' }] }));
  ok(sel('prayer_requests', { filters: [{ type: 'or', value: 'visibility.eq.public,user_email.eq.JAN@x.pl' }] }));
  ok(sel('home_group_members', { select: 'group_id', filters: [{ type: 'ilike', column: 'email', value: 'jan@x.pl' }] }));
  ok(sel('home_group_members', { filters: [{ type: 'eq', column: 'user_id', value: 'u-jan' }, { type: 'is', column: 'phone', value: null }] }));
  ok(sel('rsvp_invitations', { filters: [{ type: 'eq', column: 'member_id', value: 7 }] }));
  ok(sel('app_users', { select: 'email, full_name', filters: [{ type: 'in', column: 'email', value: ['a@x.pl'] }], order: [{ column: 'full_name' }] }));
  ok(sel('app_users', { select: '*, users:user_id(full_name)' })); // złączenie z aliasem to nie alias kolumny
  ok(sel('events', { select: 't:title', filters: [{ type: 'eq', column: 'created_by', value: 'x' }] })); // tabela bez redakcji
  ok({ table: 'app_users', op: 'update', values: { full_name: 'x' }, filters: [{ type: 'eq', column: 'phone', value: '1' }] });
  // Admin: wszystko poza głosami w ankietach.
  assert.doesNotThrow(() => assertSensitiveQuery(sel('app_users', { select: 'tel:phone' }), { isAdmin: true, resolver: null }, me));
  assert.throws(() => assertSensitiveQuery(sel('poll_votes', { select: 'e:user_email' }), { isAdmin: true, resolver: null }, me));
});

test('pliki: przestrzenie wrażliwe po ścieżce; dostęp do przestrzeni z wildcardem i bez', () => {
  assert.equal(isSignedMaterialsPath('finance/123_faktura.pdf'), true);
  assert.equal(isSignedMaterialsPath('/members/x.pdf'), true);
  assert.equal(isSignedMaterialsPath('worship/plan.pdf'), false);
  assert.equal(isSignedMaterialsPath('global/x.pdf'), false);
  assert.equal(materialsPathTeam('care/a/b.pdf'), 'care');
  const lider = materialsTeamAccess(resolverOf(['module:media', 'module:faceci']), ['faceci']);
  assert.equal(lider.mode, 'allow');
  assert.deepEqual(lider.teams.sort(), ['faceci', 'media']);
  const koord = materialsTeamAccess({ can: (c) => c.startsWith('module:') && c !== 'module:finance' }, []);
  assert.equal(koord.mode, 'deny');
  assert.ok(koord.teams.includes('finance'));
  const v = { access: lider, me: 'jan@x.pl' };
  assert.equal(teamVisible(v, 'media'), true);
  assert.equal(teamVisible(v, 'finance'), false);
  assert.equal(teamVisible(v, null), true);
});

test('grupy domowe: telefon/e-mail grupy i liderów tylko z moich grup; adres jawny', () => {
  const groups = [
    { id: 'g1', name: 'A', address: 'Ul. 1', phone: '1', email: 'a@g.pl' },
    { id: 'g2', name: 'B', address: 'Ul. 2', phone: '2', email: 'b@g.pl' },
  ];
  redactHomeGroupRows('home_groups', groups, { groupIds: new Set(['g1']), email: 'jan@x.pl' });
  assert.deepEqual(groups.map((g) => [g.address, g.phone, g.email]), [['Ul. 1', '1', 'a@g.pl'], ['Ul. 2', null, null]]);
  const leaders = [
    { id: 1, group_id: 'g1', full_name: 'L1', email: 'l1@x.pl', phone: '1' },
    { id: 2, group_id: 'g2', full_name: 'L2', email: 'l2@x.pl', phone: '2', user_email: 'l2@x.pl' },
    { id: 3, group_id: 'g2', full_name: 'Ja', email: null, user_email: 'JAN@x.pl', phone: '3' },
  ];
  redactHomeGroupRows('home_group_leaders', leaders, { groupIds: new Set(['g1']), email: 'jan@x.pl' });
  assert.deepEqual(leaders.map((l) => l.phone), ['1', null, '3']);
  assert.equal(leaders[1].full_name, 'L2');
});

test('realtime: kontakty grup i liderów, pliki przestrzeni bez dostępu', () => {
  const user = { id: 'u1', email: 'jan@x.pl' };
  const resolver = resolverOf(['module:worship']);
  const hg = realtimeRedactor({ table: 'home_groups', isAdmin: false, resolver, user });
  const input = [{ id: 'g1', phone: '1', email: 'g@x.pl', address: 'Ul. 1' }];
  assert.deepEqual(hg(input)[0], { id: 'g1', phone: null, email: null, address: 'Ul. 1' });
  assert.equal(input[0].phone, '1', 'bez mutacji wspólnego wiersza');
  const hl = realtimeRedactor({ table: 'home_group_leaders', isAdmin: false, resolver, user });
  assert.equal(hl([{ id: 1, email: 'l@x.pl', phone: '2' }])[0].phone, null);
  const files = realtimeRedactor({ table: 'materials_files', isAdmin: false, resolver, user, moduleKeys: [] });
  const out = files([
    { id: 1, team_type: 'worship' }, { id: 2, team_type: 'finance' }, { id: 3, team_type: null },
    { id: 4, team_type: 'finance', uploaded_by: 'JAN@x.pl' }, { id: 5, team_type: 'media' },
  ]);
  assert.deepEqual(out.map((r) => r.id), [1, 3, 4]);
  assert.equal(realtimeRedactor({ table: 'materials_files', isAdmin: true, resolver: null, user }), null);
});

// ── Funkcje bez bazy ────────────────────────────────────────────────────────
function fakeReply() {
  return {
    statusCode: 200, body: undefined,
    code(c) { this.statusCode = c; return this; },
    send(b) { this.body = b; return this; },
  };
}
const quietLog = { error() {}, warn() {}, info() {} };

test('campaign-progress: tylko aktywne zbiórki; zły identyfikator = 404 bez zapytania', async () => {
  const seen = [];
  const db = {
    async query(sql, params) {
      seen.push(sql);
      if (/FROM giving_campaigns/.test(sql)) {
        assert.match(sql, /is_active IS NOT FALSE/);
        return { rows: params[0] === '00000000-0000-4000-8000-000000000001' ? [{ id: params[0], name: 'Dach', goal_amount: 100 }] : [] };
      }
      return { rows: [{ raised: 40 }] };
    },
  };
  const call = async (id) => { const r = fakeReply(); await campaignProgress({ db, tenant: {}, body: { campaign_id: id }, log: quietLog }, r); return r; };
  const ok = await call('00000000-0000-4000-8000-000000000001');
  assert.deepEqual([ok.statusCode, ok.body.raised, ok.body.pct], [200, 40, 40]);
  assert.equal((await call('00000000-0000-4000-8000-000000000002')).statusCode, 404, 'nieaktywna/nieznana');
  const n = seen.length;
  assert.equal((await call("1' OR '1'='1")).statusCode, 404);
  assert.equal(seen.length, n, 'bez zapytania do bazy');
});

test('chat-policy: „z kim wolno” tylko dla kont aplikacji (bez wyroczni niepełnoletności po e-mailu)', async () => {
  const db = {
    async query(sql, params) {
      if (/FROM app_settings/.test(sql)) return { rows: [{ key: 'chat_dm_policy', value: 'all' }, { key: 'chat_protect_minors', value: 'true' }] };
      if (/FROM app_users WHERE lower\(email\) = ANY/.test(sql)) return { rows: params[0].filter((e) => e === 'ola@x.pl').map((e) => ({ e })) };
      return { rows: [] };
    },
  };
  const reply = fakeReply();
  await chatPolicy({ db, user: { email: 'jan@x.pl' }, body: { with: ['ola@x.pl', 'dziecko@x.pl'] }, log: quietLog }, reply);
  assert.ok(reply.body.allowedWith, JSON.stringify(reply.body));
  assert.deepEqual(Object.keys(reply.body.allowedWith), ['ola@x.pl']);
});

// ── /api/db na prawdziwym SQL ───────────────────────────────────────────────
function poolOf(pg) {
  return {
    async query(sql, params) {
      const r = await pg.query(sql, params);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    },
  };
}

const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const U = { adm: uid(1), kadry: uid(2), jan: uid(3), fin: uid(4), anna: uid(5), roles: uid(6) };
const ROLE = { adm: 'superadmin', kadry: 'lider', jan: 'czlonek', fin: 'czlonek', anna: 'czlonek', roles: 'czlonek' };
const G1 = uid(101), G2 = uid(102);
const F = { worship: uid(201), finance: uid(202), general: uid(203), finShared: uid(204), worShared: uid(205), worEvent: uid(206), finEvent: uid(207), media: uid(208) };
const TENANT = { id: 't', slug: 'audyt-r5', db_name: `audyt_r5_${process.pid}_${Date.now()}` };

let db;
let app;
const q1 = async (sql, params) => (await db.query(sql, params)).rows;
async function call(who, body) {
  const res = await app.inject({ method: 'POST', url: '/api/db', payload: body, headers: { 'x-test-user': who } });
  return { status: res.statusCode, body: res.json() };
}
const eq = (column, value) => ({ type: 'eq', column, value });
const sel = (table, select = '*', extra = {}) => ({ table, op: 'select', select, filters: [], ...extra });

before(async () => {
  if (skipDb) return;
  const pg = new PGlite();
  db = poolOf(pg);
  await pg.exec(`
    CREATE TABLE app_users (id uuid PRIMARY KEY, email text, full_name text, name text, role text, is_super_admin boolean DEFAULT false,
      is_active boolean DEFAULT true, campus_id int, member_id int, phone text, last_login_at timestamptz, avatar_url text,
      auth_user_id uuid, status text, totp_required boolean DEFAULT false);
    CREATE TABLE app_roles (key text PRIMARY KEY, label text, is_admin boolean DEFAULT false, is_system boolean DEFAULT false, display_order int);
    CREATE TABLE permission_grants (role text, user_id uuid, capability text, allowed boolean);
    CREATE TABLE app_modules (key text PRIMARY KEY, label text, is_system boolean, is_enabled boolean DEFAULT true);
    CREATE TABLE ministry_memberships (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES app_users(id),
      ministry_key text NOT NULL, campus_id int, role text NOT NULL DEFAULT 'member', created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE members (id serial PRIMARY KEY, first_name text, email text, phone text);
    CREATE TABLE groups (id uuid PRIMARY KEY, name text);
    CREATE TABLE group_members (id serial PRIMARY KEY, group_id uuid, member_id int);
    CREATE TABLE home_groups (id uuid PRIMARY KEY, name text, address text, location text, phone text, email text, campus_id int);
    CREATE TABLE home_group_members (id serial PRIMARY KEY, group_id uuid, full_name text, email text, phone text, user_id uuid, role text DEFAULT 'member');
    CREATE TABLE home_group_leaders (id serial PRIMARY KEY, group_id uuid, full_name text, email text, phone text, user_email text);
    CREATE TABLE materials_folders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, parent_id uuid, team_type text, created_by text);
    CREATE TABLE materials_files (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), folder_id uuid, name text, storage_path text, team_type text,
      uploaded_by text, file_size int, mime_type text, download_count int DEFAULT 0, updated_at timestamptz);
    CREATE TABLE materials_shares (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), file_id uuid, folder_id uuid, target_type text, target_id text,
      target_label text, permission text DEFAULT 'view', created_by text);
    CREATE TABLE event_materials (id serial PRIMARY KEY, event_id int NOT NULL, file_id uuid NOT NULL);
    CREATE TABLE prayer_requests (id serial PRIMARY KEY, content text, category text, user_email text, user_name text, user_id uuid,
      requester_name text, is_anonymous boolean DEFAULT false, visibility text DEFAULT 'public', is_active boolean DEFAULT true,
      status text DEFAULT 'active', answered_testimony text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE prayer_interactions (id serial PRIMARY KEY, request_id int, user_email text);
    CREATE TABLE equipment (id serial PRIMARY KEY, name text);
  `);
  const grants = presetGrantRows().filter((g) => ['lider', 'czlonek', 'koordynator', 'rada_starszych'].includes(g.role));
  for (const g of grants) await db.query('INSERT INTO permission_grants (role, capability, allowed) VALUES ($1, $2, $3)', [g.role, g.capability, g.allowed]);
  await pg.exec(`
    INSERT INTO app_roles (key, is_admin) VALUES ('superadmin', true), ('lider', false), ('czlonek', false), ('koordynator', false);
    INSERT INTO app_modules (key, label, is_system) VALUES ('media', 'Media', true), ('worship', 'Uwielbienie', true), ('finance', 'Finanse', true),
      ('rsvp', 'RSVP', true), ('faceci', 'Faceci', false), ('members', 'Członkowie', true);
    INSERT INTO app_users (id, email, full_name, role, is_super_admin, phone, last_login_at, member_id) VALUES
      ('${U.adm}', 'adm@x.pl', 'Admin', 'superadmin', true, '+48 500', now(), NULL),
      ('${U.kadry}', 'kadry@x.pl', 'Kadry', 'lider', false, '+48 601', now(), NULL),
      ('${U.jan}', 'jan@x.pl', 'Jan', 'czlonek', false, '+48 602', now(), 3),
      ('${U.fin}', 'fin@x.pl', 'Fin', 'czlonek', false, '+48 603', now(), NULL),
      ('${U.anna}', 'anna@x.pl', 'Anna', 'czlonek', false, '+48 604', now(), 4),
      ('${U.roles}', 'roles@x.pl', 'Role', 'czlonek', false, NULL, NULL, NULL);
    -- Lider Mediów z manage_users (jak na żywym tenancie) i osoby z prawami modułów.
    INSERT INTO permission_grants (user_id, capability, allowed) VALUES
      ('${U.kadry}', 'action:settings:manage_users', true),
      ('${U.fin}', 'module:finance', true),
      ('${U.roles}', 'action:settings:manage_roles', true);
    INSERT INTO ministry_memberships (user_id, ministry_key, role) VALUES ('${U.kadry}', 'media', 'leader');
    INSERT INTO members (id, first_name, email) VALUES (3, 'Jan', 'jan@x.pl'), (4, 'Anna', 'anna@x.pl');
    INSERT INTO groups VALUES ('${uid(301)}', 'Muzycy');
    INSERT INTO group_members (group_id, member_id) VALUES ('${uid(301)}', 3);
    INSERT INTO home_groups VALUES ('${G1}', 'Krzyki', 'Ul. Jana 1', 'Krzyki', '+48 700', 'krzyki@g.pl', NULL),
      ('${G2}', 'Biskupin', 'Ul. Anny 2', 'Biskupin', '+48 701', 'biskupin@g.pl', NULL);
    INSERT INTO home_group_members (group_id, full_name, email, phone) VALUES
      ('${G1}', 'Jan', 'Jan@x.pl', '+48 602'), ('${G2}', 'Anna', 'anna@x.pl', '+48 604');
    INSERT INTO home_group_leaders (group_id, full_name, email, phone) VALUES
      ('${G1}', 'Lider Krzyki', 'lk@x.pl', '+48 710'), ('${G2}', 'Lider Biskupin', 'lb@x.pl', '+48 711');
    INSERT INTO materials_files (id, name, storage_path, team_type, uploaded_by) VALUES
      ('${F.worship}', 'Akordy', 'worship/a.pdf', 'worship', 'ola@x.pl'),
      ('${F.finance}', 'Faktura', 'finance/f.pdf', 'finance', 'fin@x.pl'),
      ('${F.general}', 'Regulamin', 'global/r.pdf', NULL, 'adm@x.pl'),
      ('${F.finShared}', 'Budżet', 'finance/b.pdf', 'finance', 'fin@x.pl'),
      ('${F.worShared}', 'Setlista', 'worship/s.pdf', 'worship', 'ola@x.pl'),
      ('${F.worEvent}', 'Plan wydarzenia', 'worship/e.pdf', 'worship', 'ola@x.pl'),
      ('${F.finEvent}', 'Koszty wydarzenia', 'finance/e.pdf', 'finance', 'fin@x.pl'),
      ('${F.media}', 'Kable', 'media/k.pdf', 'media', 'ola@x.pl');
    INSERT INTO materials_shares (file_id, target_type, target_id) VALUES
      ('${F.finShared}', 'user', 'jan@x.pl'), ('${F.worShared}', 'group', '${uid(301)}');
    INSERT INTO event_materials (event_id, file_id) VALUES (1, '${F.worEvent}'), (1, '${F.finEvent}');
    INSERT INTO prayer_requests (id, content, user_email, user_name, is_anonymous, visibility) VALUES
      (1, 'Zdrowie', 'anna@x.pl', 'Anna', true, 'public'),
      (2, 'Dla liderów', 'anna@x.pl', 'Anna', false, 'leaders_only'),
      (3, 'Moja', 'jan@x.pl', 'Jan', false, 'public');
    INSERT INTO prayer_interactions (request_id, user_email) VALUES (1, 'jan@x.pl'), (2, 'jan@x.pl');
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

test('db: manage_users nie da sobie Członków/Ustawień przez przynależność; tylko służby, bez eskalacji', { skip: skipDb }, async () => {
  const ins = (who, values) => call(who, { table: 'ministry_memberships', op: 'insert', values, returning: '*' });
  for (const key of ['members', 'settings', 'finance', 'giving', 'rsvp']) {
    const r = await ins('kadry', { user_id: U.kadry, ministry_key: key, role: 'leader' });
    assert.equal(r.status, 400, `${key}: ${JSON.stringify(r.body)}`);
  }
  assert.equal((await ins('adm', { user_id: U.jan, ministry_key: 'finance', role: 'member' })).status, 400, 'także admin — klucz spoza służb');
  assert.equal((await ins('kadry', { user_id: U.jan, ministry_key: 'media', role: 'owner' })).status, 400, 'zła rola');
  // Do własnej służby (lider Mediów) — tak; do cudzej / siebie na lidera innej — nie.
  const okIns = await ins('kadry', { user_id: U.jan, ministry_key: 'media', role: 'member' });
  assert.equal(okIns.status, 200, JSON.stringify(okIns.body));
  assert.equal((await ins('kadry', { user_id: U.kadry, ministry_key: 'worship', role: 'leader' })).status, 403);
  assert.equal((await ins('kadry', { user_id: U.anna, ministry_key: 'faceci', role: 'member' })).status, 403, 'moduł własny bez dostępu');
  assert.equal((await ins('kadry', { user_id: U.adm, ministry_key: 'media', role: 'member' })).status, 403, 'konto administratora');
  assert.equal((await call('kadry', { table: 'ministry_memberships', op: 'upsert', values: { user_id: U.anna, ministry_key: 'media', role: 'member' } })).status, 403);
  // Awans w swojej służbie — OK; przeniesienie wiersza na Członków — 400.
  const promote = await call('kadry', { table: 'ministry_memberships', op: 'update', values: { role: 'leader' }, filters: [eq('id', okIns.body.data[0].id)] });
  assert.equal(promote.status, 200, JSON.stringify(promote.body));
  assert.equal((await call('kadry', { table: 'ministry_memberships', op: 'update', values: { ministry_key: 'members' }, filters: [eq('id', okIns.body.data[0].id)] })).status, 400);
  // Administrator: moduł własny z kreatora tak, systemowy RSVP nie.
  assert.equal((await ins('adm', { user_id: U.anna, ministry_key: 'faceci', role: 'leader' })).status, 200);

  // Martwy wiersz sprzed poprawki (wpisany SQL-em) nie daje Członków.
  await q1(`INSERT INTO ministry_memberships (user_id, ministry_key, role) VALUES ($1, 'members', 'leader')`, [U.kadry]);
  invalidatePermissions(TENANT.db_name);
  assert.equal((await call('kadry', sel('members'))).status, 403);
  assert.equal((await call('kadry', sel('equipment'))).status, 200, 'własna służba działa');
  // Sprzątanie: Jan bez Mediów w kolejnych testach.
  await q1(`DELETE FROM ministry_memberships WHERE user_id = $1`, [U.jan]);
  invalidatePermissions(TENANT.db_name);
});

test('db: rolę administratora (app_roles.is_admin) zmienia tylko administrator', { skip: skipDb }, async () => {
  assert.equal((await call('roles', { table: 'app_roles', op: 'insert', values: { key: 'nowa', label: 'Nowa', is_admin: false } })).status, 200);
  assert.equal((await call('roles', { table: 'app_roles', op: 'insert', values: { key: 'boss', is_admin: true } })).status, 403);
  assert.equal((await call('roles', { table: 'app_roles', op: 'update', values: { is_admin: true }, filters: [eq('key', 'czlonek')] })).status, 403);
  assert.equal((await call('roles', { table: 'app_roles', op: 'update', values: { label: 'X' }, filters: [eq('key', 'superadmin')] })).status, 403);
  assert.equal((await call('roles', { table: 'app_roles', op: 'delete', filters: [eq('key', 'superadmin')] })).status, 403);
  assert.equal((await call('roles', { table: 'app_roles', op: 'update', values: { label: 'Członek' }, filters: [eq('key', 'czlonek')] })).status, 200);
  assert.equal((await call('adm', { table: 'app_roles', op: 'update', values: { is_admin: false }, filters: [eq('key', 'nowa')] })).status, 200);
  assert.equal((await call('kadry', { table: 'app_roles', op: 'update', values: { is_admin: true }, filters: [eq('key', 'lider')] })).status, 403, 'manage_users to nie manage_roles');
  assert.equal((await call('kadry', { table: 'permission_grants', op: 'insert', values: { user_id: U.kadry, capability: '*', allowed: true } })).status, 403);
  assert.equal((await q1(`SELECT is_admin FROM app_roles WHERE key = 'czlonek'`))[0].is_admin, false);
});

test('db: konto nie przepnie się na cudzy profil członka ani e-mail (także własne)', { skip: skipDb }, async () => {
  const upd = (values, id = U.kadry) => call('kadry', { table: 'app_users', op: 'update', values, filters: [eq('id', id)] });
  assert.equal((await upd({ member_id: 4 })).status, 403);
  assert.equal((await upd({ email: 'anna@x.pl' })).status, 403);
  assert.equal((await upd({ member_id: 4 }, U.jan)).status, 403);
  assert.equal((await upd({ full_name: 'Kadry K.' })).status, 200);
  assert.equal((await upd({ role: 'czlonek' }, U.jan)).status, 200, 'zwykła zmiana konta działa');
  assert.equal((await call('kadry', { table: 'app_users', op: 'insert', values: { id: uid(9), email: 'nowy@x.pl', role: 'czlonek', member_id: 4 } })).status, 403);
  assert.equal((await call('adm', { table: 'app_users', op: 'update', values: { member_id: 3 }, filters: [eq('id', U.jan)] })).status, 200);
  const [row] = await q1('SELECT member_id, email FROM app_users WHERE id = $1', [U.kadry]);
  assert.deepEqual(row, { member_id: null, email: 'kadry@x.pl' });
});

test('db: alias, filtr i licznik po telefonie kont — 403; cudzy telefon ukryty; złączenie bez telefonu', { skip: skipDb }, async () => {
  assert.equal((await call('jan', sel('app_users', 'id, tel:phone'))).status, 403);
  assert.equal((await call('jan', sel('app_users', 'id', { filters: [{ type: 'like', column: 'phone', value: '+48 60%' }] }))).status, 403);
  assert.equal((await call('jan', sel('app_users', '*', { head: true, count: 'exact', filters: [{ type: 'like', column: 'phone', value: '+48 60%' }] }))).status, 403);
  const list = await call('jan', sel('app_users', 'id, email, phone', { order: [{ column: 'email' }] }));
  assert.equal(list.status, 200);
  const byEmail = Object.fromEntries(list.body.data.map((r) => [r.email, r]));
  assert.equal(byEmail['jan@x.pl'].phone, '+48 602', 'własny');
  assert.equal('phone' in byEmail['anna@x.pl'], false);

  // Złączenie do kont (ministry_memberships → app_users:user_id) — bez telefonu i logowań.
  const emb = await call('kadry', sel('ministry_memberships', 'ministry_key, app_users:user_id(*)'));
  assert.equal(emb.status, 200, JSON.stringify(emb.body));
  assert.ok(emb.body.data.length > 0);
  for (const r of emb.body.data) {
    assert.ok(r.app_users?.email);
    assert.equal('phone' in r.app_users, false);
    assert.equal('last_login_at' in r.app_users, false);
  }
  assert.equal((await call('kadry', sel('ministry_memberships', 'ministry_key, app_users:user_id(email, phone)'))).status, 403);
  // Administrator widzi wszystko.
  const adm = await call('adm', sel('ministry_memberships', 'ministry_key, app_users:user_id(email, phone)'));
  assert.equal(adm.status, 200);
  assert.ok(adm.body.data.some((r) => r.app_users?.phone));
});

test('db: prośby — filtr po cudzym e-mailu 403, własny OK; złączenie bez leaders_only i bez autora anonimowej', { skip: skipDb }, async () => {
  assert.equal((await call('jan', sel('prayer_requests', 'id', { filters: [eq('user_email', 'anna@x.pl')] }))).status, 403);
  assert.equal((await call('jan', sel('prayer_requests', 'id', { head: true, count: 'exact', filters: [eq('user_email', 'anna@x.pl'), eq('is_anonymous', true)] }))).status, 403);
  const mine = await call('jan', sel('prayer_requests', 'id', { filters: [eq('user_email', 'jan@x.pl')] }));
  assert.deepEqual(mine.body.data.map((r) => r.id), [3]);
  assert.equal((await call('jan', sel('prayer_requests', 'id, a:user_email'))).status, 403);

  const emb = await call('jan', sel('prayer_interactions', 'request_id, prayer_requests:request_id(*)', { order: [{ column: 'request_id' }] }));
  assert.equal(emb.status, 200, JSON.stringify(emb.body));
  const byId = Object.fromEntries(emb.body.data.map((r) => [r.request_id, r.prayer_requests]));
  assert.equal(byId[2], null, 'leaders_only — nie dla członka');
  assert.equal(byId[1].content, 'Zdrowie');
  assert.equal('user_email' in byId[1], false);
  assert.equal('user_name' in byId[1], false);
  // Lider widzi prośbę „tylko dla liderów” także w złączeniu.
  const lead = await call('kadry', sel('prayer_interactions', 'request_id, prayer_requests:request_id(id, content)', { filters: [eq('request_id', 2)] }));
  assert.equal(lead.body.data[0].prayer_requests.content, 'Dla liderów');
});

test('db: grupy domowe — telefon i e-mail grupy oraz liderów tylko z moich grup, adres jawny', { skip: skipDb }, async () => {
  const groups = await call('jan', sel('home_groups', '*', { order: [{ column: 'name' }] }));
  assert.equal(groups.status, 200, JSON.stringify(groups.body));
  const g = Object.fromEntries(groups.body.data.map((r) => [r.name, r]));
  assert.deepEqual([g.Krzyki.phone, g.Krzyki.email], ['+48 700', 'krzyki@g.pl'], 'moja grupa');
  assert.deepEqual([g.Biskupin.phone, g.Biskupin.email, g.Biskupin.address], [null, null, 'Ul. Anny 2'], 'cudza: bez kontaktów, z adresem');
  const leaders = await call('jan', sel('home_group_leaders', '*'));
  const l = Object.fromEntries(leaders.body.data.map((r) => [r.full_name, r]));
  assert.equal(l['Lider Krzyki'].phone, '+48 710');
  assert.deepEqual([l['Lider Biskupin'].phone, l['Lider Biskupin'].email], [null, null]);
  // Złączenie liderów z grupy — kolumny kontaktowe pominięte.
  const emb = await call('jan', sel('home_groups', 'name, home_group_leaders(*)'));
  assert.equal(emb.status, 200, JSON.stringify(emb.body));
  for (const r of emb.body.data) for (const x of r.home_group_leaders) assert.equal('phone' in x, false);
  assert.equal((await call('jan', sel('home_group_leaders', 'id', { filters: [{ type: 'ilike', column: 'phone', value: '+48 71%' }] }))).status, 403);
  assert.equal((await call('jan', sel('home_groups', 't:phone'))).status, 403);
  // Moje grupy po e-mailu (useShares) — działa.
  const mineHg = await call('jan', sel('home_group_members', 'group_id', { filters: [{ type: 'ilike', column: 'email', value: 'jan@x.pl' }] }));
  assert.deepEqual(mineHg.body.data.map((r) => r.group_id), [G1]);
});

test('db: Pliki — przestrzeń modułu tylko z dostępem; udostępnienia i wydarzenia poza przestrzeniami wrażliwymi', { skip: skipDb }, async () => {
  const names = async (who, extra = {}) => {
    const r = await call(who, sel('materials_files', 'id, name', { order: [{ column: 'name' }], ...extra }));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body.data.map((x) => x.name).sort();
  };
  // Członek: ogólne, udostępnione grupie (Setlista), materiał wydarzenia — bez Finansów (nawet udostępnionych).
  assert.deepEqual(await names('jan'), ['Plan wydarzenia', 'Regulamin', 'Setlista']);
  // Lider Mediów: Media + to samo, bez Finansów.
  assert.deepEqual(await names('kadry'), ['Kable', 'Plan wydarzenia', 'Regulamin']);
  // Finanse: swoje pliki + przestrzeń Finansów.
  assert.deepEqual(await names('fin'), ['Budżet', 'Faktura', 'Koszty wydarzenia', 'Plan wydarzenia', 'Regulamin']);
  assert.equal((await names('adm')).length, 8);
  // Licznik — ten sam zakres.
  const cnt = await call('jan', sel('materials_files', '*', { head: true, count: 'exact', filters: [eq('team_type', 'finance')] }));
  assert.equal(cnt.body.count, 0);
  // Złączenie z materiałów wydarzenia — plik Finansów pusty dla członka.
  const emb = await call('jan', sel('event_materials', 'file_id, materials_files:file_id(name)'));
  assert.equal(emb.status, 200, JSON.stringify(emb.body));
  const byFile = Object.fromEntries(emb.body.data.map((r) => [r.file_id, r.materials_files]));
  assert.equal(byFile[F.worEvent].name, 'Plan wydarzenia');
  assert.equal(byFile[F.finEvent], null);
  // Zmiana pliku, którego nie widzę (lider ma res:materials_files:update) — bez skutku.
  const upd = await call('kadry', { table: 'materials_files', op: 'update', values: { name: 'Hack' }, filters: [eq('id', F.finance)], returning: '*' });
  assert.equal(upd.status, 200);
  assert.deepEqual(upd.body.data, []);
  assert.equal((await q1('SELECT name FROM materials_files WHERE id = $1', [F.finance]))[0].name, 'Faktura');
  // Dodanie pliku do przestrzeni Finansów bez dostępu — 403; do przestrzeni ogólnej — tak.
  assert.equal((await call('jan', { table: 'materials_files', op: 'insert', values: { name: 'x', storage_path: 'finance/x.pdf', team_type: 'finance', uploaded_by: 'jan@x.pl' } })).status, 403);
  assert.equal((await call('jan', { table: 'materials_files', op: 'insert', values: { name: 'y', storage_path: 'global/y.pdf', team_type: null, uploaded_by: 'jan@x.pl' } })).status, 200);
});

test('fn: prayer-wall i admin-update-user na prawdziwym SQL — capability zamiast listy ról, e-mail tylko z Członkami', { skip: skipDb }, async () => {
  const wall = async (who) => {
    const reply = fakeReply();
    await prayerWall({ db, tenant: TENANT, user: { id: U[who], email: `${who}@x.pl`, role: ROLE[who] }, log: quietLog }, reply);
    return reply.body.requests.map((r) => r.id).sort();
  };
  assert.deepEqual(await wall('jan'), [1, 3]);
  assert.deepEqual(await wall('kadry'), [1, 2, 3], 'lider: tab:prayer:leaders_requests z presetu');
  // Odebranie zakładki liderowi (nadpisanie użytkownika) — prośby „tylko dla liderów” znikają.
  await q1(`INSERT INTO permission_grants (user_id, capability, allowed) VALUES ($1, 'tab:prayer:leaders_requests', false)`, [U.kadry]);
  invalidatePermissions(TENANT.db_name);
  assert.deepEqual(await wall('kadry'), [1, 3]);
  await q1(`DELETE FROM permission_grants WHERE user_id = $1 AND capability = 'tab:prayer:leaders_requests'`, [U.kadry]);
  invalidatePermissions(TENANT.db_name);

  const reply = fakeReply();
  await adminUpdateUser({ db, tenant: TENANT, user: { id: U.kadry, email: 'kadry@x.pl' }, body: { userId: U.jan, email: 'anna2@x.pl' }, log: quietLog }, reply);
  assert.equal(reply.statusCode, 403, JSON.stringify(reply.body));
  assert.equal((await q1('SELECT email FROM app_users WHERE id = $1', [U.jan]))[0].email, 'jan@x.pl');
});
