// Audyt 2026-10-11, runda 4 — logowanie: blokada konta, zmiana hasła (obecne hasło + wylogowanie
// innych urządzeń), 2FA bez nadpisywania, SSO tylko z potwierdzonym e-mailem, CORS tylko platforma.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';

import authRoutes, { FRESH_LOGIN_MINUTES } from '../src/auth/routes.js';
import { hashPassword } from '../src/auth/passwords.js';
import { isLocked, registerFailedLogin, LOCK_THRESHOLD } from '../src/auth/lockout.js';
import { ssoEmailTrusted } from '../src/lib/sso.js';
import { corsOriginAllowed } from '../src/lib/cors.js';

let state;
const queries = [];
async function resetState({ fresh = false, totp = false } = {}) {
  state = { hash: await hashPassword('stare-Haslo-1'), fresh, totp, failed: 0, revokedWith: undefined, newHash: null };
  queries.length = 0;
}

function fakeDb() {
  return {
    async query(sql, params = []) {
      queries.push(sql);
      if (/FROM app_settings/.test(sql)) return { rows: [] }; // polityka haseł domyślna
      if (/SELECT password_hash, failed_login_count, locked_until/.test(sql)) {
        return { rows: [{ password_hash: state.hash, failed_login_count: state.failed, locked_until: null, fresh: state.fresh }] };
      }
      if (/UPDATE app_users SET failed_login_count = \$1/.test(sql)) { state.failed = params[0]; return { rows: [] }; }
      if (/UPDATE app_users SET failed_login_count = 0, locked_until = now\(\)/.test(sql)) { state.locked = true; return { rows: [] }; }
      if (/UPDATE app_users SET password_hash/.test(sql)) { state.newHash = params[0]; return { rows: [] }; }
      if (/UPDATE refresh_tokens SET revoked_at/.test(sql)) { state.revokedWith = params[1]; return { rows: [] }; }
      if (/SELECT totp_enabled FROM app_users/.test(sql)) return { rows: [{ totp_enabled: state.totp }] };
      return { rows: [] };
    },
  };
}

let app;
before(async () => {
  app = Fastify();
  await app.register(cookie);
  app.decorate('requireTenant', async (req) => { req.tenant = { slug: 'k', subdomain: 'k' }; req.db = fakeDb(); });
  app.decorate('requireUser', async (req) => { req.tenant = { slug: 'k' }; req.db = fakeDb(); req.user = { id: 'u1', email: 'ja@k.pl' }; });
  await app.register(authRoutes);
});
after(() => app?.close());

const changePassword = (body, headers = {}) => app.inject({ method: 'POST', url: '/api/auth/update-password', payload: body, headers });

test('zmiana hasła: bez obecnego hasła tylko tuż po zalogowaniu', async () => {
  assert.equal(FRESH_LOGIN_MINUTES, 10);
  await resetState({ fresh: false });
  const r = await changePassword({ password: 'Nowe-haslo-123' });
  assert.equal(r.statusCode, 403);
  assert.equal(r.json().code, 'CURRENT_PASSWORD_REQUIRED');
  assert.equal(state.newHash, null);

  await resetState({ fresh: true });
  assert.equal((await changePassword({ password: 'Nowe-haslo-123' })).statusCode, 200, 'świeże logowanie');
  assert.ok(state.newHash);
});

test('zmiana hasła: złe obecne hasło liczy się do blokady; dobre — zmiana i wylogowanie innych urządzeń', async () => {
  await resetState();
  const bad = await changePassword({ password: 'Nowe-haslo-123', currentPassword: 'zle' });
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.json().code, 'WRONG_CURRENT_PASSWORD');
  assert.equal(state.failed, 1);
  assert.equal(state.newHash, null);

  await resetState();
  const ok = await changePassword({ password: 'Nowe-haslo-123', currentPassword: 'stare-Haslo-1' }, { 'x-refresh-token': 'moj-token' });
  assert.equal(ok.statusCode, 200);
  assert.ok(state.newHash);
  assert.equal(typeof state.revokedWith, 'string', 'bieżąca sesja zostaje (hash jej tokena)');
  assert.notEqual(state.revokedWith, 'moj-token', 'porównanie po hashu, nie surowym tokenie');
});

test('2FA: włączonej nie da się nadpisać nowym sekretem', async () => {
  await resetState({ totp: true });
  const r = await app.inject({ method: 'POST', url: '/api/auth/2fa/enable', payload: { secret: 'JBSWY3DPEHPK3PXP', code: '123456' } });
  assert.equal(r.statusCode, 409);
  assert.equal(r.json().code, 'TOTP_ALREADY_ENABLED');
  assert.ok(!queries.some((q) => /SET totp_secret/.test(q)));
});

test('blokada: próg nieudanych prób, potem 15 minut', async () => {
  const calls = [];
  const db = { query: async (sql, params) => { calls.push([sql, params]); return { rows: [] }; } };
  await registerFailedLogin(db, { id: 'u', failed_login_count: 1 });
  assert.match(calls[0][0], /SET failed_login_count = \$1/);
  await registerFailedLogin(db, { id: 'u', failed_login_count: LOCK_THRESHOLD - 1 });
  assert.match(calls[1][0], /locked_until = now\(\) \+ interval '15 minutes'/);
  assert.equal(isLocked({ locked_until: new Date(Date.now() + 60_000) }), true);
  assert.equal(isLocked({ locked_until: new Date(Date.now() - 60_000) }), false);
  assert.equal(isLocked({}), false);
});

test('SSO: tylko potwierdzony e-mail i właściwa aplikacja (nOAuth)', () => {
  const creds = { clientId: 'cid' };
  assert.equal(ssoEmailTrusted('google', { aud: 'cid', email: 'a@k.pl', email_verified: true }, creds), true);
  assert.equal(ssoEmailTrusted('google', { aud: 'cid', email: 'a@k.pl', email_verified: false }, creds), false);
  assert.equal(ssoEmailTrusted('google', { aud: 'cid', email: 'a@k.pl' }, creds), false);
  assert.equal(ssoEmailTrusted('google', { aud: 'inna', email: 'a@k.pl', email_verified: true }, creds), false);
  // Microsoft: obca organizacja z wpisanym cudzym adresem — odrzucona.
  assert.equal(ssoEmailTrusted('microsoft', { aud: 'cid', email: 'admin@k.pl', tid: 'obca' }, { ...creds, msTenant: 'common' }), false);
  assert.equal(ssoEmailTrusted('microsoft', { aud: 'cid', email: 'a@k.pl', xms_edov: true }, { ...creds, msTenant: 'common' }), true);
  const tid = '11111111-2222-3333-4444-555555555555';
  assert.equal(ssoEmailTrusted('microsoft', { aud: 'cid', email: 'a@k.pl', tid }, { ...creds, msTenant: tid }), true);
  assert.equal(ssoEmailTrusted('microsoft', { aud: 'cid', email: 'a@k.pl', tid: 'inny' }, { ...creds, msTenant: tid }), false);
});

test('CORS: tylko domena platformy i subdomeny; aplikacja natywna bez Origin', () => {
  const prod = { appDomain: 'avenit.pl', isProd: true };
  assert.equal(corsOriginAllowed(undefined, prod), true);
  for (const o of ['https://avenit.pl', 'https://schwro.avenit.pl', 'https://app.avenit.pl', 'https://admin.avenit.pl']) {
    assert.equal(corsOriginAllowed(o, prod), true, o);
  }
  for (const o of ['https://evil.pl', 'https://avenit.pl.evil.pl', 'https://evilavenit.pl', 'http://schwro.avenit.pl', 'http://localhost:5173', 'null']) {
    assert.equal(corsOriginAllowed(o, prod), false, o);
  }
  assert.equal(corsOriginAllowed('http://localhost:5173', { appDomain: 'localhost', isProd: false }), true);
});
