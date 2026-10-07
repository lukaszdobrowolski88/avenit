// Kody zapasowe: oba formaty kolumny (text[] z napisami JSON i jsonb) — odczyt, zużycie, zapis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBackupCodes, consumeBackupCode, backupCodesParam } from '../src/auth/totp.js';

const textArray = ['{"code":"AB12CD34","used":false}', '{"code":"EF56GH78","used":true}'];
const jsonbArray = [{ code: 'AB12CD34', used: false }, { code: 'EF56GH78', used: true }];

test('normalizacja: text[] z napisami JSON i jsonb dają to samo', () => {
  assert.deepEqual(normalizeBackupCodes(textArray), normalizeBackupCodes(jsonbArray));
  assert.deepEqual(normalizeBackupCodes('[{"code":"x1","used":false}]'), [{ code: 'X1', used: false }]);
  assert.deepEqual(normalizeBackupCodes(null), []);
});

test('logowanie kodem zapasowym działa przy kolumnie text[] (dawniej zawsze odrzucało)', () => {
  const r = consumeBackupCode(textArray, 'ab12cd34');
  assert.equal(r.ok, true);
  assert.equal(r.updated.find((c) => c.code === 'AB12CD34').used, true);
  assert.equal(consumeBackupCode(textArray, 'EF56GH78').ok, false); // już zużyty
});

test('zapis zgodny z typem kolumny', async () => {
  const textDb = { options: { connectionString: 'db-text' }, query: async () => ({ rows: [{ udt_name: '_text' }] }) };
  const jsonDb = { options: { connectionString: 'db-json' }, query: async () => ({ rows: [{ udt_name: 'jsonb' }] }) };
  const t = await backupCodesParam(textDb, jsonbArray);
  assert.ok(Array.isArray(t) && typeof t[0] === 'string' && JSON.parse(t[0]).code === 'AB12CD34');
  const j = await backupCodesParam(jsonDb, jsonbArray);
  assert.equal(typeof j, 'string');
  assert.equal(JSON.parse(j)[1].used, true);
});
