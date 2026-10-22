// Integracje Google Workspace / Microsoft 365 — Faza 1 (migracja 118, src/integrations).
// Czysta logika zawsze; przepływy na PRAWDZIWYM SQL (PGlite) z atrapą fetch (Google / Graph):
//   PGLITE_MODULE=/ścieżka/node_modules/@electric-sql/pglite/dist/index.js node --test test/workspace-integrations.test.js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  computeDirectoryPlan, normalizeGoogleUser, normalizeMicrosoftUser, normalizeDirectorySettings, parseDomains,
  runDirectorySync, saveDirectorySettings,
} from '../src/integrations/directory.js';
import { signIntegrationState, verifyIntegrationState, handleCallback, startConnect, setConsentRetryDelay, NONCE_COOKIE } from '../src/integrations/oauth.js';
import { getAccessToken, saveTenantConnection, loadConnection, decryptToken } from '../src/integrations/tokens.js';
import { msAuthority, PURPOSES } from '../src/integrations/providers.js';
import { integrationCaller } from '../src/integrations/access.js';
import { invalidatePermissions, REGISTRY, getTableRule } from '../src/dataapi/registry.js';
import { workspaceAction } from '../src/fn/workspace-integration.js';
import { directoryAction, runForTenant } from '../src/fn/directory-sync.js';
import { settingsReturnUrl } from '../src/integrations/routes.js';

let PGlite = null;
try {
  ({ PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite'));
} catch { PGlite = null; }
const skip = PGlite ? false : 'brak @electric-sql/pglite (ustaw PGLITE_MODULE)';

// ── Czysta logika ───────────────────────────────────────────────────────────
test('normalizacja Microsoft: goście, wyłączone (skrzynki współdzielone/sale), bez adresu, aliasy z proxyAddresses', () => {
  const u = normalizeMicrosoftUser({ id: '1', displayName: 'Jan', mail: 'Jan@Kosciol.PL', userPrincipalName: 'jan.k@kosciol.onmicrosoft.com', accountEnabled: true, proxyAddresses: ['SMTP:jan@kosciol.pl', 'smtp:jk@kosciol.pl', 'X500:/o=x'] });
  assert.equal(u.email, 'jan@kosciol.pl');
  assert.deepEqual(u.emails.sort(), ['jan.k@kosciol.onmicrosoft.com', 'jan@kosciol.pl', 'jk@kosciol.pl']);
  assert.equal(u.skip, null);
  assert.equal(normalizeMicrosoftUser({ id: '2', mail: 'g@x.pl', userType: 'Guest', accountEnabled: true }).skip, 'guest');
  assert.equal(normalizeMicrosoftUser({ id: '3', mail: 'g@x.pl', userPrincipalName: 'g_x.pl#EXT#@k.onmicrosoft.com', accountEnabled: true }).skip, 'guest');
  assert.equal(normalizeMicrosoftUser({ id: '4', mail: 'sala@k.pl', accountEnabled: false }).skip, 'disabled');
  assert.equal(normalizeMicrosoftUser({ id: '5', mail: null, userPrincipalName: 'svc@k.pl', accountEnabled: true }).skip, 'no_mail');
});

test('normalizacja Google: zawieszone i zarchiwizowane pomijane, aliasy i emails[] do dopasowania', () => {
  const u = normalizeGoogleUser({ id: 'g1', primaryEmail: 'Ola@Kosciol.pl', name: { fullName: 'Ola K' }, aliases: ['ola.k@kosciol.pl'], emails: [{ address: 'ola@kosciol.pl' }, { address: 'stary@kosciol.pl' }] });
  assert.equal(u.email, 'ola@kosciol.pl');
  assert.deepEqual(u.emails.sort(), ['ola.k@kosciol.pl', 'ola@kosciol.pl', 'stary@kosciol.pl']);
  assert.equal(normalizeGoogleUser({ id: 'g2', primaryEmail: 'a@k.pl', suspended: true }).skip, 'disabled');
  assert.equal(normalizeGoogleUser({ id: 'g3', primaryEmail: 'a@k.pl', archived: true }).skip, 'disabled');
});

test('ustawienia: wartości domyślne (kolejka, nic przy wyłączeniu, czlonek), domeny oczyszczone', () => {
  const s = normalizeDirectorySettings({});
  assert.deepEqual([s.mode, s.on_disable, s.default_role, s.enabled, s.send_invite], ['queue', 'none', 'czlonek', false, false]);
  assert.equal(normalizeDirectorySettings({ mode: 'cokolwiek', on_disable: 'usun' }).mode, 'queue');
  assert.deepEqual(parseDomains('@Kosciol.pl, kosciol.org; zle;  kosciol.pl'), ['kosciol.pl', 'kosciol.org']);
  assert.equal(msAuthority('common'), 'organizations');
  assert.equal(msAuthority(''), 'organizations');
  assert.equal(msAuthority('11111111-2222-3333-4444-555555555555'), '11111111-2222-3333-4444-555555555555');
});

const D = (id, email, extra = {}) => ({ externalId: id, email, emails: [email, ...(extra.aliases || [])], name: extra.name || id, jobTitle: null, skip: extra.skip || null });

test('plan: dopasowanie po e-mailu bez wielkości liter i po aliasie/UPN, domeny, duplikaty', () => {
  const plan = computeDirectoryPlan({
    dirUsers: [
      D('a', 'anna@kosciol.pl'),                                 // istnieje jako ANNA@Kosciol.pl
      D('b', 'bartek@kosciol.pl', { aliases: ['b@kosciol.pl'] }), // istnieje pod aliasem
      D('c', 'cezary@kosciol.pl'),                               // nowe
      D('d', 'dorota@obca.pl'),                                  // spoza domen
      D('e', 'ewa@kosciol.pl', { skip: 'guest' }),
      D('f', 'cezary@kosciol.pl'),                               // duplikat adresu w katalogu
    ],
    appUsers: [
      { id: 'u1', email: 'ANNA@Kosciol.pl', role: 'lider', is_active: true, status: 'active' },
      { id: 'u2', email: 'b@kosciol.pl', role: 'czlonek', is_active: true, status: 'active' },
    ],
    links: [], settings: {}, allowedDomains: ['kosciol.pl'],
  });
  assert.deepEqual(plan.link.map((l) => [l.user_id, l.external_id]), [['u1', 'a'], ['u2', 'b']]);
  assert.deepEqual(plan.create.map((c) => c.email), ['cezary@kosciol.pl']);
  assert.deepEqual(plan.skipped.map((s) => s.reason).sort(), ['duplicate', 'guest', 'outside_domain']);
  assert.equal(plan.counts.block, 0);
});

test('plan: blokada przy usunięciu/wyłączeniu tylko z on_disable=block, nigdy administratorów', () => {
  const base = {
    dirUsers: [D('a', 'anna@k.pl'), D('x', 'xawery@k.pl', { skip: 'disabled' }), D('adm2', 'szef2@k.pl', { skip: 'disabled' })],
    appUsers: [
      { id: 'u1', email: 'anna@k.pl', is_active: true, status: 'active' },
      { id: 'u2', email: 'xawery@k.pl', is_active: true, status: 'active' },
      { id: 'u3', email: 'usuniety@k.pl', is_active: true, status: 'active' },
      { id: 'u4', email: 'szef@k.pl', is_active: true, status: 'active', role_admin: true },
      { id: 'u5', email: 'szef2@k.pl', is_active: true, status: 'active', is_super_admin: true },
      { id: 'u6', email: 'juz@k.pl', is_active: false, status: 'blocked' },
    ],
    links: [
      { user_id: 'u1', external_id: 'a' }, { user_id: 'u2', external_id: 'x' }, { user_id: 'u3', external_id: 'gone' },
      { user_id: 'u4', external_id: 'adm' }, { user_id: 'u5', external_id: 'adm2' }, { user_id: 'u6', external_id: 'gone2' },
    ],
    allowedDomains: ['k.pl'],
  };
  const none = computeDirectoryPlan({ ...base, settings: { on_disable: 'none' } });
  assert.equal(none.block.length, 0);
  const blk = computeDirectoryPlan({ ...base, settings: { on_disable: 'block' } });
  assert.deepEqual(blk.block.map((b) => [b.user_id, b.reason]).sort(), [['u2', 'disabled'], ['u3', 'removed']]);
  assert.deepEqual(blk.protected.map((p) => p.user_id).sort(), ['u4', 'u5']);
  assert.deepEqual(blk.linked.map((l) => l.user_id), ['u1']);
});

test('state: podpis HMAC, odrzucenie podróbki i stanu SSO', () => {
  const s = signIntegrationState({ tenant: 'schwro', stateId: 'abc', provider: 'microsoft' });
  assert.deepEqual(verifyIntegrationState(s), { tenant: 'schwro', stateId: 'abc', provider: 'microsoft' });
  const [p, sig] = s.split('.');
  const forged = Buffer.from(JSON.stringify({ t: 'inny', s: 'abc', p: 'microsoft' })).toString('base64url');
  assert.equal(verifyIntegrationState(`${forged}.${sig}`), null);
  assert.equal(verifyIntegrationState(`${p}.${'0'.repeat(sig.length)}`), null);
  assert.equal(verifyIntegrationState('zepsuty'), null);
  assert.match(settingsReturnUrl('schwro', 'google', 'error', 'not_admin'), /\/settings\?tab=integrations&ws=google&ws_result=error&ws_reason=not_admin$/);
});

test('rejestr /api/db: tabele integracji są wyłącznie serwerowe', () => {
  for (const t of ['integration_connections', 'integration_oauth_states', 'workspace_integration_settings', 'directory_links', 'directory_sync_runs']) {
    assert.equal(REGISTRY[t], undefined, t);
    assert.equal(getTableRule(t), null, t);
  }
});

// ── Prawdziwy SQL (PGlite) + atrapa fetch ───────────────────────────────────
const MIG = new URL('../db/tenant-migrations/118_workspace_integrations.sql', import.meta.url);
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TID = '11111111-2222-3333-4444-555555555555';
const OTHER_TID = '99999999-2222-3333-4444-555555555555';
const DB_NAME = 'test_workspace_integrations';

function poolOf(pg) {
  return {
    async query(sql, params) {
      const r = await pg.query(sql, params);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    },
  };
}

const jwt = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Atrapa fetch: lista [predykat(url, opts), odpowiedź|fn]; log wywołań.
let routes = [];
const calls = [];
const realFetch = globalThis.fetch;
function mockFetch(list) { routes = list; calls.length = 0; }
async function fakeFetch(url, opts = {}) {
  const u = String(url);
  const body = opts.body instanceof URLSearchParams ? Object.fromEntries(opts.body) : opts.body;
  calls.push({ url: u, method: opts.method || 'GET', body, auth: opts.headers?.Authorization });
  for (const [pred, resp] of routes) {
    if (pred(u, { ...opts, body })) return typeof resp === 'function' ? resp(u, { ...opts, body }) : resp.clone();
  }
  return json({ error: 'not_mocked', url: u }, 599);
}

let pg, db;
const CREDS = { clientId: 'cid', clientSecret: 'csecret', msTenant: '', source: 'platform' };
const ADMIN = uid(1), SEKR = uid(2), INTEG = uid(3), MEMBER = uid(4);
const reqOf = (body, userId = ADMIN) => ({ db, body, tenant: { subdomain: 'schwro', db_name: DB_NAME }, user: { id: userId }, log: { error() {}, warn() {}, info() {} } });

before(async () => {
  if (skip) return;
  globalThis.fetch = fakeFetch;
  setConsentRetryDelay(0);
  pg = new PGlite();
  db = poolOf(pg);
  await pg.exec(`
    CREATE TABLE app_roles (key text PRIMARY KEY, is_admin boolean DEFAULT false);
    CREATE TABLE app_users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email varchar(255) UNIQUE NOT NULL, full_name text, name varchar(255),
      role varchar(50), is_active boolean DEFAULT true, status text DEFAULT 'active', pending_kind text, email_verified boolean DEFAULT false,
      password_hash text, is_super_admin boolean DEFAULT false, invited_at timestamptz, failed_login_count int DEFAULT 0, locked_until timestamptz);
    CREATE TABLE app_settings (key text PRIMARY KEY, value text);
    CREATE TABLE account_events (id bigserial PRIMARY KEY, email varchar(255), action varchar(40) NOT NULL, actor varchar(255), detail text, created_at timestamptz DEFAULT now());
    CREATE TABLE refresh_tokens (id bigserial PRIMARY KEY, user_id uuid, revoked_at timestamptz);
    CREATE TABLE password_reset_tokens (id bigserial PRIMARY KEY, user_id uuid, token_hash text, expires_at timestamptz);
    CREATE TABLE permission_grants (role text, user_id uuid, capability text, allowed boolean);
    CREATE TABLE app_modules (key text);
    INSERT INTO app_roles (key, is_admin) VALUES ('superadmin', true), ('rada', true), ('czlonek', false), ('sekretarz', false), ('integrator', false), ('lider', false);
    INSERT INTO permission_grants (role, capability, allowed) VALUES
      ('sekretarz', 'action:settings:manage_integrations', true), ('sekretarz', 'action:settings:manage_users', true),
      ('integrator', 'action:settings:manage_integrations', true),
      ('lider', 'action:settings:manage_users', true);
  `);
  await pg.exec(fs.readFileSync(MIG, 'utf8'));
  await pg.exec(fs.readFileSync(MIG, 'utf8')); // idempotentna
  await db.query(`INSERT INTO app_users (id, email, full_name, role, is_super_admin) VALUES
    ($1, 'admin@kosciol.pl', 'Admin', 'superadmin', true), ($2, 'sekretarz@kosciol.pl', 'Sekretarz', 'sekretarz', false),
    ($3, 'integrator@kosciol.pl', 'Integrator', 'integrator', false), ($4, 'czlonek@kosciol.pl', 'Członek', 'czlonek', false)`,
  [ADMIN, SEKR, INTEG, MEMBER]);
  invalidatePermissions(DB_NAME);
});

after(() => { globalThis.fetch = realFetch; });

test('migracja 118: tabele, unikalne połączenie kościoła per dostawca, FK do app_users', { skip }, async () => {
  const { rows } = await db.query(`SELECT table_name FROM information_schema.tables WHERE table_name IN
    ('integration_connections','integration_oauth_states','workspace_integration_settings','directory_links','directory_sync_runs') ORDER BY 1`);
  assert.equal(rows.length, 5);
  await db.query(`INSERT INTO integration_connections (provider, scope_kind) VALUES ('google', 'tenant')`);
  await assert.rejects(db.query(`INSERT INTO integration_connections (provider, scope_kind) VALUES ('google', 'tenant')`));
  // Połączenia osób (Faza 2/3) — osobny unikat per osoba.
  await db.query(`INSERT INTO integration_connections (provider, scope_kind, user_id) VALUES ('google', 'user', $1)`, [MEMBER]);
  await assert.rejects(db.query(`INSERT INTO integration_connections (provider, scope_kind, user_id) VALUES ('google', 'user', $1)`, [MEMBER]));
  await assert.rejects(db.query(`INSERT INTO integration_connections (provider) VALUES ('dropbox')`));
  await db.query(`DELETE FROM integration_connections`);
});

test('uprawnienia: manage_integrations do konfiguracji, + manage_users do zastosowania, sekrety tylko administrator', { skip }, async () => {
  const a = await integrationCaller(db, ADMIN, DB_NAME);
  assert.deepEqual([a.fullAdmin, a.canIntegrations, a.canUsers], [true, true, true]);
  const s = await integrationCaller(db, SEKR, DB_NAME);
  assert.deepEqual([s.fullAdmin, s.canIntegrations, s.canUsers], [false, true, true]);
  const i = await integrationCaller(db, INTEG, DB_NAME);
  assert.deepEqual([i.canIntegrations, i.canUsers], [true, false]);
  const m = await integrationCaller(db, MEMBER, DB_NAME);
  assert.deepEqual([m.canIntegrations, m.canUsers], [false, false]);

  await assert.rejects(workspaceAction(reqOf({ action: 'status' }, MEMBER), m), (e) => e.status === 403);
  await assert.rejects(directoryAction(reqOf({ action: 'preview', provider: 'google' }, MEMBER), m), (e) => e.status === 403);
  await assert.rejects(directoryAction(reqOf({ action: 'apply', provider: 'google' }, INTEG), i), (e) => e.status === 403 && /Zarządzaj użytkownikami/.test(e.message));
  await assert.rejects(workspaceAction(reqOf({ action: 'save_credentials', provider: 'google', client_id: 'x', client_secret: 'y' }, SEKR), s), (e) => e.status === 403);
  // Domyślna rola: nie administracyjna.
  await assert.rejects(workspaceAction(reqOf({ action: 'save_settings', provider: 'google', settings: { default_role: 'rada' } }, SEKR), s), (e) => e.status === 403);
  // Automat przed pierwszym „Zastosuj” — odmowa; bez manage_users — odmowa.
  await assert.rejects(workspaceAction(reqOf({ action: 'save_settings', provider: 'google', settings: { enabled: true } }, INTEG), i), (e) => e.status === 403);
  await assert.rejects(workspaceAction(reqOf({ action: 'save_settings', provider: 'google', settings: { enabled: true } }, SEKR), s), (e) => e.status === 409);
  const ok = await workspaceAction(reqOf({ action: 'save_settings', provider: 'google', settings: { allowed_domains: 'kosciol.pl, @Kosciol.org', mode: 'active' } }, INTEG), i);
  assert.deepEqual(ok.settings.allowed_domains, ['kosciol.pl', 'kosciol.org']);
  assert.equal(ok.settings.mode, 'active');
  await saveDirectorySettings(db, 'google', { allowed_domains: [], mode: 'queue' }, 'test');
});

test('własna aplikacja OAuth: sekret szyfrowany, nie wraca w statusie; status bez tokenów', { skip }, async () => {
  const a = await integrationCaller(db, ADMIN, DB_NAME);
  await workspaceAction(reqOf({ action: 'save_credentials', provider: 'google', client_id: 'own-client', client_secret: 'own-secret' }), a);
  const { rows } = await db.query(`SELECT client_id, client_secret_enc FROM workspace_integration_settings WHERE provider = 'google'`);
  assert.equal(rows[0].client_id, 'own-client');
  assert.notEqual(rows[0].client_secret_enc, 'own-secret');
  await saveTenantConnection(db, { provider: 'google', externalTenant: 'kosciol.pl', accountEmail: 'admin@kosciol.pl', scopes: ['x'], accessToken: 'AT-SECRET-1', refreshToken: 'RT-SECRET-1', expiresIn: 3600 });
  const st = await workspaceAction(reqOf({ action: 'status' }), a);
  const text = JSON.stringify(st);
  for (const secret of ['own-secret', 'AT-SECRET-1', 'RT-SECRET-1', 'access_token_enc', 'refresh_token_enc', 'client_secret_enc']) assert.ok(!text.includes(secret), secret);
  assert.equal(st.providers.google.creds_source, 'tenant');
  assert.equal(st.providers.google.connection.status, 'active');
  assert.equal(st.providers.google.connection.has_refresh_token, true);
  assert.match(st.providers.microsoft.redirect_uri, /\/api\/integrations\/oauth\/microsoft\/callback$/);
  // Wyczyszczenie własnej aplikacji.
  await workspaceAction(reqOf({ action: 'save_credentials', provider: 'google', client_id: '' }), a);
  await db.query(`DELETE FROM integration_connections`);
});

test('tokeny: odświeżenie Google z zapisem, invalid_grant → revoked, inny błąd → error', { skip }, async () => {
  const conn = await saveTenantConnection(db, { provider: 'google', externalTenant: 'kosciol.pl', accountEmail: 'admin@kosciol.pl', scopes: [], accessToken: 'old', refreshToken: 'RT', expiresIn: 10 });
  mockFetch([[(u, o) => u === 'https://oauth2.googleapis.com/token' && o.body.grant_type === 'refresh_token' && o.body.refresh_token === 'RT', json({ access_token: 'NEW', expires_in: 3599, scope: 'openid email' })]]);
  assert.equal(await getAccessToken(db, conn, { creds: CREDS }), 'NEW');
  let fresh = await loadConnection(db, 'google');
  assert.equal(await decryptToken(fresh.access_token_enc), 'NEW');
  assert.equal(await decryptToken(fresh.refresh_token_enc), 'RT'); // Google nie zwrócił nowego — stary zostaje
  assert.deepEqual(fresh.scopes, ['openid', 'email']);
  // Ważny token — bez wywołania sieci.
  calls.length = 0;
  assert.equal(await getAccessToken(db, fresh, { creds: CREDS }), 'NEW');
  assert.equal(calls.length, 0);
  // Błąd przejściowy → error.
  mockFetch([[() => true, json({ error: 'server_error' }, 500)]]);
  await assert.rejects(getAccessToken(db, fresh, { creds: CREDS, force: true }), (e) => e.code === 'refresh_failed');
  assert.equal((await loadConnection(db, 'google')).status, 'error');
  // Cofnięta zgoda → revoked, kolejne wywołanie bez sieci.
  mockFetch([[() => true, json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400)]]);
  fresh = await loadConnection(db, 'google');
  await assert.rejects(getAccessToken(db, fresh, { creds: CREDS, force: true }), (e) => e.code === 'revoked');
  fresh = await loadConnection(db, 'google');
  assert.equal(fresh.status, 'revoked');
  assert.match(fresh.last_error, /revoked/);
  await assert.rejects(getAccessToken(db, fresh, { creds: CREDS }), (e) => e.code === 'revoked');
  await db.query(`DELETE FROM integration_connections`);
});

// Katalog Google: 2 strony (nextPageToken).
const googleDirectory = () => [
  [(u) => u.startsWith('https://admin.googleapis.com/admin/directory/v1/users') && !u.includes('pageToken='), json({
    users: [
      { id: 'g-czl', primaryEmail: 'CZLONEK@kosciol.pl', name: { fullName: 'Członek' } },
      { id: 'g-new1', primaryEmail: 'nowy1@kosciol.pl', name: { fullName: 'Nowy Jeden' } },
      { id: 'g-susp', primaryEmail: 'zawieszony@kosciol.pl', suspended: true },
    ],
    nextPageToken: 'P2',
  })],
  [(u) => u.includes('pageToken=P2'), json({
    users: [
      { id: 'g-new2', primaryEmail: 'nowy2@kosciol.pl', name: { fullName: 'Nowy Dwa' } },
      { id: 'g-obcy', primaryEmail: 'ktos@gmail.com', name: { fullName: 'Spoza' } },
      { id: 'g-adm', primaryEmail: 'admin@kosciol.pl', aliases: ['szef@kosciol.pl'], isAdmin: true },
    ],
  })],
  [(u) => u.startsWith('https://admin.googleapis.com/admin/directory/v1/groups'), json({ groups: [{ id: 'gr1', email: 'liderzy@kosciol.pl', name: 'Liderzy', directMembersCount: '4' }] })],
];

test('Google: podgląd (paginacja, domena połączonego konta), zastosowanie w trybie kolejki, role bez zmian', { skip }, async () => {
  await db.query(`UPDATE app_users SET role = 'lider' WHERE id = $1`, [MEMBER]);
  await saveTenantConnection(db, {
    provider: 'google', externalTenant: 'kosciol.pl', accountEmail: 'admin@kosciol.pl',
    scopes: PURPOSES.directory.google, accessToken: 'GAT', refreshToken: 'GRT', expiresIn: 3600,
  });
  mockFetch(googleDirectory());
  const s = await integrationCaller(db, SEKR, DB_NAME);
  const prev = await directoryAction(reqOf({ action: 'preview', provider: 'google' }, SEKR), s);
  assert.deepEqual(prev.allowed_domains, ['kosciol.pl']);
  assert.equal(prev.allowed_domains_source, 'connection');
  assert.equal(prev.plan.counts.directory, 6);
  assert.deepEqual(prev.plan.create.map((c) => c.email).sort(), ['nowy1@kosciol.pl', 'nowy2@kosciol.pl']);
  assert.deepEqual(prev.plan.link.map((l) => l.email).sort(), ['admin@kosciol.pl', 'czlonek@kosciol.pl']);
  assert.deepEqual(prev.plan.skipped.map((x) => x.reason).sort(), ['disabled', 'outside_domain']);
  assert.deepEqual(prev.groups, [{ id: 'gr1', email: 'liderzy@kosciol.pl', name: 'Liderzy', members: 4 }]);
  assert.ok(calls.every((c) => c.auth === 'Bearer GAT'));
  // Podgląd niczego nie zmienia.
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM directory_links`)).rows[0].n, 0);

  const res = await directoryAction(reqOf({ action: 'apply', provider: 'google' }, SEKR), s);
  assert.deepEqual(res.applied, { created: 2, linked: 2, blocked: 0, invited: 0, block_skipped: 0 });
  const { rows: created } = await db.query(`SELECT email, role, status, is_active, pending_kind, password_hash FROM app_users WHERE email LIKE 'nowy%' ORDER BY email`);
  assert.deepEqual(created.map((u) => [u.email, u.role, u.status, u.is_active, u.pending_kind, u.password_hash]), [
    ['nowy1@kosciol.pl', 'czlonek', 'pending', false, 'admin', ''],
    ['nowy2@kosciol.pl', 'czlonek', 'pending', false, 'admin', ''],
  ]);
  // Istniejące konto: rola NIE zmieniona.
  assert.equal((await db.query(`SELECT role FROM app_users WHERE id = $1`, [MEMBER])).rows[0].role, 'lider');
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM directory_links WHERE provider = 'google'`)).rows[0].n, 4);
  const ev = await db.query(`SELECT action, actor FROM account_events WHERE actor = 'directory:google' ORDER BY action`);
  assert.deepEqual([...new Set(ev.rows.map((r) => r.action))], ['directory_linked', 'registered']);
  const hist = await directoryAction(reqOf({ action: 'history', provider: 'google' }, SEKR), s);
  assert.deepEqual(hist.history.map((h) => [h.trigger, h.dry_run, h.status]), [['manual', false, 'ok'], ['preview', true, 'ok']]);
  assert.equal(hist.history[0].counts.applied.created, 2);
  // Drugi przebieg: wszystko już powiązane.
  const again = await directoryAction(reqOf({ action: 'preview', provider: 'google' }, SEKR), s);
  assert.deepEqual([again.plan.counts.create, again.plan.counts.link, again.plan.counts.linked], [0, 0, 4]);
});

test('Google: blokada usuniętych z katalogu (on_disable=block) — nigdy administratora; harmonogram co 6 h', { skip }, async () => {
  await saveDirectorySettings(db, 'google', { on_disable: 'block', enabled: true }, 'test');
  // Katalog bez nowy2 i bez admina (oba „usunięte”).
  mockFetch([
    [(u) => u.includes('/directory/v1/users'), json({ users: [
      { id: 'g-czl', primaryEmail: 'czlonek@kosciol.pl' }, { id: 'g-new1', primaryEmail: 'nowy1@kosciol.pl' },
    ] })],
  ]);
  const before = (await db.query(`SELECT count(*)::int AS n FROM directory_sync_runs`)).rows[0].n;
  const logs = [];
  await runForTenant(db, { tenantSubdomain: 'schwro', log: (m) => logs.push(m) });
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM directory_sync_runs WHERE trigger = 'schedule'`)).rows[0].n, 1);
  assert.ok((await db.query(`SELECT count(*)::int AS n FROM directory_sync_runs`)).rows[0].n > before);
  const { rows } = await db.query(`SELECT email, status, is_active FROM app_users WHERE email IN ('nowy2@kosciol.pl', 'admin@kosciol.pl') ORDER BY email`);
  assert.deepEqual(rows.map((r) => [r.email, r.status, r.is_active]), [['admin@kosciol.pl', 'active', true], ['nowy2@kosciol.pl', 'blocked', false]]);
  assert.match(logs.join('\n'), /1 blokad/);
  const blockedEv = await db.query(`SELECT email, detail FROM account_events WHERE action = 'blocked' AND actor = 'directory:google'`);
  assert.deepEqual(blockedEv.rows.map((r) => [r.email, r.detail]), [['nowy2@kosciol.pl', 'usunięte z katalogu']]);
  await saveDirectorySettings(db, 'google', { on_disable: 'none', enabled: false }, 'test');
});

test('pusty katalog / błąd API: przerwanie bez zmian, status połączenia i historia z błędem', { skip }, async () => {
  const s = await integrationCaller(db, SEKR, DB_NAME);
  mockFetch([[(u) => u.includes('/directory/v1/users'), json({ users: [] })]]);
  await assert.rejects(directoryAction(reqOf({ action: 'apply', provider: 'google' }, SEKR), s), (e) => e.code === 'empty_directory');
  mockFetch([[(u) => u.includes('/directory/v1/users'), json({ error: { message: 'Not Authorized to access this resource/api' } }, 403)]]);
  await assert.rejects(directoryAction(reqOf({ action: 'preview', provider: 'google' }, SEKR), s), (e) => e.status === 403);
  const conn = await loadConnection(db, 'google');
  assert.equal(conn.status, 'error');
  assert.match(conn.last_error, /Not Authorized/);
  const { rows } = await db.query(`SELECT status, errors FROM directory_sync_runs WHERE provider = 'google' ORDER BY started_at DESC LIMIT 1`);
  assert.equal(rows[0].status, 'error');
  await pg.exec(`DELETE FROM integration_connections; DELETE FROM directory_links;`);
});

test('Microsoft: client credentials dla katalogu kościoła, paginacja @odata.nextLink, tryb aktywny + zaproszenia, domeny', { skip }, async () => {
  await db.query(`INSERT INTO app_settings (key, value) VALUES ('sso_allowed_domains', 'schwro.pl') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
  await saveTenantConnection(db, { provider: 'microsoft', externalTenant: TID, accountEmail: 'it@schwro.pl', scopes: ['User.Read.All'] });
  await saveDirectorySettings(db, 'microsoft', { mode: 'active', send_invite: true }, 'test');
  await db.query(`INSERT INTO workspace_integration_settings (provider, client_id, client_secret_enc) VALUES ('microsoft', 'ms-own', NULL)
    ON CONFLICT (provider) DO UPDATE SET client_id = 'ms-own'`);
  // Własny klient bez sekretu → brak poświadczeń → błąd konfiguracji.
  const s = await integrationCaller(db, SEKR, DB_NAME);
  await assert.rejects(directoryAction(reqOf({ action: 'preview', provider: 'microsoft' }, SEKR), s), (e) => e.code === 'not_configured');
  await workspaceAction(reqOf({ action: 'save_credentials', provider: 'microsoft', client_id: 'ms-own', client_secret: 'ms-secret' }), await integrationCaller(db, ADMIN, DB_NAME));
  await db.query(`UPDATE integration_connections SET status = 'active', last_error = NULL WHERE provider = 'microsoft'`);

  const next = 'https://graph.microsoft.com/v1.0/users?$skiptoken=X2';
  mockFetch([
    [(u, o) => u === `https://login.microsoftonline.com/${TID}/oauth2/v2.0/token` && o.body.grant_type === 'client_credentials'
      && o.body.client_id === 'ms-own' && o.body.client_secret === 'ms-secret' && o.body.scope === 'https://graph.microsoft.com/.default',
    json({ access_token: jwt({ roles: ['User.Read.All'] }), expires_in: 3599 })],
    [(u) => u.startsWith('https://graph.microsoft.com/v1.0/users?$select='), json({
      value: [
        { id: 'm1', displayName: 'Marta', mail: 'Marta@SCHWRO.pl', userPrincipalName: 'marta@schwro.pl', accountEnabled: true },
        { id: 'm2', displayName: 'Sala Główna', mail: 'sala@schwro.pl', accountEnabled: false },
        { id: 'm3', displayName: 'Gość', mail: 'g@gmail.com', userType: 'Guest', accountEnabled: true },
      ],
      '@odata.nextLink': next,
    })],
    [(u) => u === next, json({ value: [
      { id: 'm4', displayName: 'Czlonek', mail: 'inny@schwro.pl', userPrincipalName: 'czlonek@kosciol.pl', accountEnabled: true },
      { id: 'm5', displayName: 'Technik', mail: null, userPrincipalName: 'svc@schwro.pl', accountEnabled: true },
      { id: 'm6', displayName: 'Obcy', mail: 'x@obca.pl', accountEnabled: true },
    ] })],
  ]);
  const invites = [];
  const res = await directoryAction(reqOf({ action: 'apply', provider: 'microsoft' }, SEKR), s, { sendInvite: async (email, data) => { invites.push([email, data.link]); } });
  assert.deepEqual(res.allowed_domains, ['schwro.pl']);
  assert.equal(res.allowed_domains_source, 'sso');
  assert.deepEqual(res.plan.create.map((c) => c.email), ['marta@schwro.pl']);
  assert.deepEqual(res.plan.link.map((l) => [l.email, l.external_id]), [['czlonek@kosciol.pl', 'm4']]); // po UPN
  assert.deepEqual(res.plan.skipped.map((x) => x.reason).sort(), ['disabled', 'guest', 'no_mail', 'outside_domain']);
  assert.equal(res.applied.created, 1);
  assert.equal(res.applied.invited, 1);
  assert.equal(invites[0][0], 'marta@schwro.pl');
  assert.match(invites[0][1], /^https:\/\/schwro\..+\/reset-password\?token=/);
  const { rows } = await db.query(`SELECT status, is_active, role FROM app_users WHERE email = 'marta@schwro.pl'`);
  assert.deepEqual([rows[0].status, rows[0].is_active, rows[0].role], ['active', true, 'czlonek']);
  // Token aplikacji zapisany (zaszyfrowany) — drugi przebieg bez nowego tokenu.
  const tokenCalls = calls.filter((c) => c.url.includes('/oauth2/v2.0/token')).length;
  assert.equal(tokenCalls, 1);
  await directoryAction(reqOf({ action: 'preview', provider: 'microsoft' }, SEKR), s);
  assert.equal(calls.filter((c) => c.url.includes('/oauth2/v2.0/token')).length, 1);
  await db.query(`DELETE FROM app_settings WHERE key = 'sso_allowed_domains'`);
});

test('Microsoft: nextLink spoza Graph odrzucony (token nie wycieka)', { skip }, async () => {
  const s = await integrationCaller(db, SEKR, DB_NAME);
  mockFetch([
    [(u) => u.includes('/oauth2/v2.0/token'), json({ access_token: jwt({ roles: ['User.Read.All'] }), expires_in: 3599 })],
    [(u) => u.startsWith('https://graph.microsoft.com/v1.0/users?$select='), json({ value: [{ id: 'm1', mail: 'marta@schwro.pl', accountEnabled: true }], '@odata.nextLink': 'https://evil.example/users' })],
  ]);
  await assert.rejects(directoryAction(reqOf({ action: 'preview', provider: 'microsoft' }, SEKR), s), (e) => e.code === 'bad_next_link');
  assert.ok(!calls.some((c) => c.url.startsWith('https://evil.example')));
  await pg.exec(`DELETE FROM integration_connections; DELETE FROM workspace_integration_settings WHERE provider = 'microsoft'`);
});

test('OAuth Google: PKCE + nonce przeglądarki, konto Workspace, administrator; cudza przeglądarka odrzucona', { skip }, async () => {
  const { url, nonce, stateId } = await startConnect(db, { provider: 'google', tenant: 'schwro', user: { id: ADMIN, email: 'admin@kosciol.pl' }, creds: CREDS });
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(u.searchParams.get('access_type'), 'offline');
  assert.equal(u.searchParams.get('prompt'), 'consent');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.match(u.searchParams.get('scope'), /admin\.directory\.user\.readonly/);
  assert.match(u.searchParams.get('redirect_uri'), /\/api\/integrations\/oauth\/google\/callback$/);
  const parsed = verifyIntegrationState(u.searchParams.get('state'));
  assert.equal(parsed.stateId, stateId);

  // Inna przeglądarka (brak / zły nonce) — odmowa, stan nietknięty.
  const bad = await handleCallback(db, { provider: 'google', stateId, query: { code: 'C' }, nonceCookie: 'cudzy', creds: CREDS, tenant: 'schwro' });
  assert.equal(bad.reason, 'state');

  const { rows: [st] } = await db.query(`SELECT code_verifier FROM integration_oauth_states WHERE id = $1`, [stateId]);
  mockFetch([
    [(x, o) => x === 'https://oauth2.googleapis.com/token' && o.body.code === 'C' && o.body.code_verifier === st.code_verifier, json({
      access_token: 'GAT2', refresh_token: 'GRT2', expires_in: 3599,
      scope: `openid email ${PURPOSES.directory.google[3]} ${PURPOSES.directory.google[4]}`,
      id_token: jwt({ email: 'Admin@Kosciol.pl', email_verified: true, hd: 'kosciol.pl' }),
    })],
    [(x) => x.startsWith('https://admin.googleapis.com/admin/directory/v1/users'), json({ users: [{ id: '1' }] })],
  ]);
  const ok = await handleCallback(db, { provider: 'google', stateId, query: { code: 'C' }, nonceCookie: nonce, creds: CREDS, tenant: 'schwro' });
  assert.equal(ok.result, 'connected');
  const conn = await loadConnection(db, 'google');
  assert.deepEqual([conn.status, conn.external_tenant, conn.account_email, conn.created_by], ['active', 'kosciol.pl', 'admin@kosciol.pl', 'admin@kosciol.pl']);
  assert.equal(await decryptToken(conn.refresh_token_enc), 'GRT2');
  // Stan jednorazowy.
  const replay = await handleCallback(db, { provider: 'google', stateId, query: { code: 'C' }, nonceCookie: nonce, creds: CREDS, tenant: 'schwro' });
  assert.equal(replay.reason, 'state');

  // Prywatne konto Gmail (bez hd) — odmowa.
  const s2 = await startConnect(db, { provider: 'google', tenant: 'schwro', user: { id: ADMIN }, creds: CREDS });
  mockFetch([[(x) => x === 'https://oauth2.googleapis.com/token', json({ access_token: 'x', refresh_token: 'y', scope: PURPOSES.directory.google.join(' '), id_token: jwt({ email: 'ja@gmail.com' }) })]]);
  const gm = await handleCallback(db, { provider: 'google', stateId: s2.stateId, query: { code: 'C' }, nonceCookie: s2.nonce, creds: CREDS, tenant: 'schwro' });
  assert.equal(gm.reason, 'not_workspace');

  // Konto Workspace bez roli administratora — połączenie z błędem.
  const s3 = await startConnect(db, { provider: 'google', tenant: 'schwro', user: { id: ADMIN }, creds: CREDS });
  mockFetch([
    [(x) => x === 'https://oauth2.googleapis.com/token', json({ access_token: 'x', refresh_token: 'y', scope: PURPOSES.directory.google.join(' '), id_token: jwt({ email: 'zwykly@kosciol.pl', hd: 'kosciol.pl' }) })],
    [(x) => x.includes('/directory/v1/users'), json({ error: { message: 'Not Authorized' } }, 403)],
  ]);
  const na = await handleCallback(db, { provider: 'google', stateId: s3.stateId, query: { code: 'C' }, nonceCookie: s3.nonce, creds: CREDS, tenant: 'schwro' });
  assert.equal(na.reason, 'not_admin');
  assert.equal((await loadConnection(db, 'google')).status, 'error');
  // Odmowa zgody u dostawcy.
  const s4 = await startConnect(db, { provider: 'google', tenant: 'schwro', user: { id: ADMIN }, creds: CREDS });
  const den = await handleCallback(db, { provider: 'google', stateId: s4.stateId, query: { error: 'access_denied' }, nonceCookie: s4.nonce, creds: CREDS, tenant: 'schwro' });
  assert.equal(den.reason, 'denied');
  await db.query(`DELETE FROM integration_connections`);
});

test('OAuth Microsoft: logowanie administratora (tid + rola) → zgoda administratora tego samego katalogu → User.Read.All', { skip }, async () => {
  const start = await startConnect(db, { provider: 'microsoft', tenant: 'schwro', user: { id: ADMIN, email: 'admin@kosciol.pl' }, creds: CREDS });
  const u = new URL(start.url);
  assert.equal(u.origin + u.pathname, 'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize');
  assert.equal(u.searchParams.get('scope'), 'openid profile email User.Read');

  const tokenOk = (claims) => [(x, o) => x === 'https://login.microsoftonline.com/organizations/oauth2/v2.0/token' && o.body.grant_type === 'authorization_code',
    json({ access_token: 'DELEGATED', id_token: jwt({ aud: 'cid', tid: TID, preferred_username: 'IT@schwro.pl', ...claims }) })];

  // Zwykły użytkownik katalogu (bez wids i bez roli w /me/memberOf) — odmowa.
  mockFetch([tokenOk({}), [(x) => x.includes('/me/memberOf'), json({ value: [{ roleTemplateId: '88d8e3e3-8f55-4a1e-953a-9b9898b8876b' }] })]]);
  const notAdmin = await handleCallback(db, { provider: 'microsoft', stateId: start.stateId, query: { code: 'C' }, nonceCookie: start.nonce, creds: CREDS, tenant: 'schwro' });
  assert.equal(notAdmin.reason, 'not_admin');

  // Administrator globalny (memberOf) → przekierowanie na adminconsent tego katalogu.
  const s2 = await startConnect(db, { provider: 'microsoft', tenant: 'schwro', user: { id: ADMIN, email: 'admin@kosciol.pl' }, creds: CREDS });
  mockFetch([tokenOk({}), [(x) => x.includes('/me/memberOf'), json({ value: [{ roleTemplateId: '62e90394-69f5-4237-9190-012177145e10' }] })]]);
  const step1 = await handleCallback(db, { provider: 'microsoft', stateId: s2.stateId, query: { code: 'C' }, nonceCookie: s2.nonce, creds: CREDS, tenant: 'schwro' });
  assert.equal(step1.result, 'next');
  const consent = new URL(step1.next);
  assert.equal(consent.origin + consent.pathname, `https://login.microsoftonline.com/${TID}/v2.0/adminconsent`);
  assert.equal(consent.searchParams.get('scope'), 'https://graph.microsoft.com/.default');
  const st2 = verifyIntegrationState(consent.searchParams.get('state'));
  assert.equal(st2.stateId, s2.stateId);

  // Podrobiony callback zgody dla INNEGO katalogu — odmowa (stan zużyty).
  const forged = await handleCallback(db, { provider: 'microsoft', stateId: s2.stateId, query: { admin_consent: 'True', tenant: OTHER_TID }, nonceCookie: s2.nonce, creds: CREDS, tenant: 'schwro' });
  assert.equal(forged.reason, 'tenant');
  assert.equal(await loadConnection(db, 'microsoft'), null);

  // Pełny przepływ z oświadczeniem wids (bez /me/memberOf).
  const s3 = await startConnect(db, { provider: 'microsoft', tenant: 'schwro', user: { id: ADMIN, email: 'admin@kosciol.pl' }, creds: CREDS });
  mockFetch([
    tokenOk({ wids: ['62E90394-69F5-4237-9190-012177145E10'] }),
    [(x, o) => x === `https://login.microsoftonline.com/${TID}/oauth2/v2.0/token` && o.body.grant_type === 'client_credentials', json({ access_token: jwt({ roles: ['User.Read.All'] }), expires_in: 3599 })],
  ]);
  const a1 = await handleCallback(db, { provider: 'microsoft', stateId: s3.stateId, query: { code: 'C' }, nonceCookie: s3.nonce, creds: CREDS, tenant: 'schwro' });
  assert.equal(a1.result, 'next');
  assert.ok(!calls.some((c) => c.url.includes('/me/memberOf')));
  const a2 = await handleCallback(db, { provider: 'microsoft', stateId: s3.stateId, query: { admin_consent: 'True', tenant: TID }, nonceCookie: s3.nonce, creds: CREDS, tenant: 'schwro' });
  assert.equal(a2.result, 'connected');
  const conn = await loadConnection(db, 'microsoft');
  assert.deepEqual([conn.status, conn.external_tenant, conn.account_email, conn.scopes], ['active', TID, 'it@schwro.pl', ['User.Read.All']]);
  assert.equal(conn.refresh_token_enc, null); // katalog: client credentials, bez refresh tokenu

  // Zgoda bez roli User.Read.All (np. jeszcze nie rozpropagowana) → połączenie z błędem.
  const s4 = await startConnect(db, { provider: 'microsoft', tenant: 'schwro', user: { id: ADMIN }, creds: CREDS });
  mockFetch([
    tokenOk({ wids: ['e8611ab8-c189-46e8-94e1-60213ab1f814'] }),
    [(x, o) => o.body?.grant_type === 'client_credentials', json({ access_token: jwt({ roles: [] }), expires_in: 3599 })],
  ]);
  await handleCallback(db, { provider: 'microsoft', stateId: s4.stateId, query: { code: 'C' }, nonceCookie: s4.nonce, creds: CREDS, tenant: 'schwro' });
  const pend = await handleCallback(db, { provider: 'microsoft', stateId: s4.stateId, query: { admin_consent: 'True', tenant: TID }, nonceCookie: s4.nonce, creds: CREDS, tenant: 'schwro' });
  assert.equal(pend.reason, 'consent_pending');
  assert.equal((await loadConnection(db, 'microsoft')).status, 'error');
  await db.query(`DELETE FROM integration_connections`);
});

test('rozłączenie: usuwa połączenie (Google — próba unieważnienia tokenu), wpis w historii konta', { skip }, async () => {
  const a = await integrationCaller(db, ADMIN, DB_NAME);
  await saveTenantConnection(db, { provider: 'google', externalTenant: 'kosciol.pl', accountEmail: 'admin@kosciol.pl', refreshToken: 'RT-X', accessToken: 'a', expiresIn: 3600 });
  mockFetch([[(u) => u.startsWith('https://oauth2.googleapis.com/revoke'), json({})]]);
  const r = await workspaceAction(reqOf({ action: 'disconnect', provider: 'google' }), a);
  assert.equal(r.removed, true);
  assert.equal(await loadConnection(db, 'google'), null);
  assert.ok(calls.some((c) => c.url.includes('token=RT-X')));
  const { rows } = await db.query(`SELECT action, detail FROM account_events WHERE action = 'integration_disconnected'`);
  assert.equal(rows[0].detail, 'google');
  assert.equal(NONCE_COOKIE, 'avenit_intg');
});
