// Polityka wymogu 2FA (claim n2fa): require_2fa_all, require_2fa_admins, totp_required.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needs2faSetup } from '../src/auth/twofa-policy.js';

// Atrapa bazy: app_settings jako mapa, app_roles jako mapa key → is_admin. Liczy zapytania.
function fakeDb(settings = {}, roles = {}) {
  const db = {
    calls: [],
    async query(sql, params = []) {
      db.calls.push(sql);
      if (/FROM app_settings/.test(sql)) {
        return { rows: Object.entries(settings).map(([key, value]) => ({ key, value })) };
      }
      if (/FROM app_roles/.test(sql)) {
        const k = params[0];
        return { rows: k in roles ? [{ is_admin: roles[k] }] : [] };
      }
      throw new Error('unexpected query: ' + sql);
    },
  };
  return db;
}

test('brak polityk → nie wymaga 2FA', async () => {
  assert.equal(await needs2faSetup(fakeDb(), { role: 'czlonek' }), false);
});

test('konto z włączonym 2FA nigdy nie jest blokowane (bez zapytań)', async () => {
  const db = fakeDb({ require_2fa_all: 'on' });
  assert.equal(await needs2faSetup(db, { role: 'czlonek', totp_enabled: true }), false);
  assert.equal(db.calls.length, 0);
});

test('totp_required na koncie → wymaga', async () => {
  assert.equal(await needs2faSetup(fakeDb(), { role: 'czlonek', totp_required: true }), true);
});

test('require_2fa_all=on → wymaga od każdego', async () => {
  assert.equal(await needs2faSetup(fakeDb({ require_2fa_all: 'on' }), { role: 'czlonek' }), true);
});

test('require_2fa_all=off → nie wymaga', async () => {
  assert.equal(await needs2faSetup(fakeDb({ require_2fa_all: 'off' }), { role: 'czlonek' }), false);
});

test('require_2fa_admins=on → wymaga od roli is_admin', async () => {
  const db = fakeDb({ require_2fa_admins: 'on' }, { rada_starszych: true, czlonek: false });
  assert.equal(await needs2faSetup(db, { role: 'rada_starszych' }), true);
});

test('require_2fa_admins=on → nie wymaga od zwykłej roli ani roli nieznanej', async () => {
  const db = fakeDb({ require_2fa_admins: 'on' }, { rada_starszych: true, czlonek: false });
  assert.equal(await needs2faSetup(db, { role: 'czlonek' }), false);
  assert.equal(await needs2faSetup(db, { role: 'nieistniejaca' }), false);
  assert.equal(await needs2faSetup(db, { role: null }), false);
});

test('require_2fa_admins=on → superadmin zawsze objęty', async () => {
  const db = fakeDb({ require_2fa_admins: 'on' }, {});
  assert.equal(await needs2faSetup(db, { role: 'czlonek', is_super_admin: true }), true);
});

test('require_2fa_admins=off → admin nie jest blokowany (i bez zapytania o role)', async () => {
  const db = fakeDb({ require_2fa_admins: 'off' }, { rada_starszych: true });
  assert.equal(await needs2faSetup(db, { role: 'rada_starszych' }), false);
  assert.ok(!db.calls.some((q) => /app_roles/.test(q)));
});

test('brak użytkownika → false', async () => {
  assert.equal(await needs2faSetup(fakeDb({ require_2fa_all: 'on' }), null), false);
});
